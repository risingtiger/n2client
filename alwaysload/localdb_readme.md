# LocalDB sync plugin

Server-authoritative IndexedDB cache. Views only read; there is no optimistic write API,
mutation queue, reconciliation, or client-to-server data sync.

## Configure a view

Add stores to the view's source `main.json` entry (main or instance):

```json
{
	"type": "view",
	"name": "ledger",
	"urlmatch": "ledger",
	"localdb": ["transactions", "categories", "merchants"]
}
```

Existing views have `localdb: []` because they do not ingest local records. Actual store
readers must be registered on the host server before enabling a view's stores. The server's
`static_dev/main.json` and `static_dist/main.json` are generated copies; instance source
configuration remains the authority for subsequent builds.

`main.ts` combines store names declared by views with `INFO.localdb` schemas.
Optional indexes are declared there, e.g. `{ "name": "transactions", "indexes": ["date"] }`.
Records must be JSON-compatible full objects with a stable string or numeric `id`.
Only top-level store names are supported. Bump `INSTANCE.INFO.firebase.dbversion` when
adding stores/indexes. The plugin itself has no Firebase dependency; its `Init` accepts
`{ name, version, stores }`. Use a user-specific database name for authenticated apps.

`Init(options, on_changed)` only configures the plugin. `Install()` explicitly creates or
upgrades the database; `EnsureStores(names)` also installs as needed. SwitchStation calls
`EnsureStores` alongside existing asset/data loading on navigation, parameter changes, and
refreshes. Same-session preloads are reused. First online use in a document downloads a
snapshot; offline navigation can reuse a previously completed snapshot, including an empty
one. Reads never fetch HTTP data themselves.

## Read in ingest

The `$N.LocalDBSync` facade (also typed in `defs.ts`) exposes only `GetOne`, `GetAll`, and
`ReadMany`. Named exports are available from `alwaysload/localdb_sync.ts` as well.

```ts
async ingest() {
	const [transactions, categories] = await $N.LocalDBSync.ReadMany([
		{ store: "transactions", index: "date", query: IDBKeyRange.bound("2026-01-01", "2026-01-31") },
		{ store: "categories" },
	])
	this.m.transactions = transactions
	this.m.categories = categories
	this.m.merchants = await $N.LocalDBSync.GetAll("merchants")
	this.m.selected = await $N.LocalDBSync.GetOne("transactions/1234")
}
```

`GetOne("transactions", 1234)` supports numeric keys. `ReadMany` returns arrays in query
order and queues all requests together in one readonly transaction, including multiple
queries on the same store. Independent reader calls can also use `Promise.all`.
SwitchStation awaits ingest before rendering. Stores must be preloaded, not implicitly
loaded by readers. There is no public write method or raw database handle on `$N`.

## Host server integration

`n2server` has no application database mutation routes. Connect its exported APIs to your
existing database readers and committed writes during host startup:

```ts
import { InitLocalDB, NotifyLocalDBChanged, HandleRequest } from "./build/index.js"

InitLocalDB({
	// Application-provided authentication and database functions:
	scope: async req => (await authenticate(req))?.userId ?? null,
	stores: {
		transactions: async scope => readTransactions(scope),
		categories: async scope => readCategories(scope),
		merchants: async scope => readMerchants(scope),
	},
})

// In each existing mutation handler, immediately after the write commits:
const record = await updateTransaction(scope, id, changes)
NotifyLocalDBChanged(scope, { store: "transactions", operation: "update", records: [record] })

// Equivalent notifications after committed additions/deletions:
// NotifyLocalDBChanged(scope, { store: "transactions", operation: "add", records: [record] })
// NotifyLocalDBChanged(scope, { store: "transactions", operation: "delete", ids: [id] })
```

Scope identifies clients with identical record visibility. Snapshot loaders must enforce
that scope's data access; returning null denies access. The SSE listener captures the same
scope on connect. Unconfigured localdb returns 503 and cannot broadcast record data.
Reconnect SSE and use a different local database when identity changes. The existing
legacy `changed` protocol retains its existing behavior.

## Protocol and ordering

- `GET /api/localdb?store=transactions` returns
  `{ "store": "transactions", "revision": 3, "records": [...] }` with `no-store`.
- The existing `/api/events` connection carries a separate named `localdb` event:
  `{ "store": "transactions", "revision": 4, "operation": "update", "records": [...] }`.
- `add` and `update` carry full record images, not patches. `delete` carries `ids`, not records.
- The server tracks per-scope/store revisions and rereads a snapshot if a concurrent
  notification invalidated the read. Every authoritative write must publish immediately.
- Client snapshot replacement and SSE writes are serialized per store. Events already
  included in a snapshot are skipped by revision. Different stores preload concurrently.
- Snapshots atomically replace the entire store, removing records deleted while disconnected.
  Reconnects refresh only stores activated by navigation; there is no SSE replay log.
- Only after an IndexedDB transaction commits does the plugin notify SwitchStation using
  `[store, "store/id", ...]`. Declared stores join the existing `refreshon` set, so normal
  coalescing, throttling, ingest, and rendering remain in control.

## Deliberate limitations

- Cold loads (the dist-only server page with the first view inlined) do not open, preload, or
  read IndexedDB, even if records were previously cached. Warm loads (dev pages and service
  worker pages) load their first view like a navigation, so its stores install normally.
  Ingest gets empty arrays/undefined and a localdb-dependent cold view alerts exactly:
  `Need to integrate localdb for app cold loads`. Background refreshes of that cold view
  also skip localdb until navigation. Cold-load integration is deferred.
- Full snapshots only; no pagination, distributed server revisions/pub-sub, cross-tab sync
  coordination, schema removals, blocked-upgrade UI, quota recovery, or automatic retry.
- Readers must use the primary database. External writers must publish through the same
  process. Failures are surfaced/logged; a later navigation can retry a failed preload,
  and reconnection refreshes loaded stores. A failing refresh leaves cached data intact.
- Offline cache reuse relies on `navigator.onLine`; network failures while reported online
  are surfaced rather than introducing additional fallback/retry machinery.
