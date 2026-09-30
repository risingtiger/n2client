import { LocalDatabase } from "./localdb_indexeddb.js"
import type { LocalDBChangeT, LocalDBKeyT, LocalDBOptionsT, LocalDBQueryT, LocalDBReaderT, LocalDBRecordT, LocalDBSnapshotT } from "./localdb_types.js"

export type { LocalDBOptionsT, LocalDBQueryT, LocalDBReaderT, LocalDBRecordT } from "./localdb_types.js"

type StoreStateT = {
	loaded:boolean
	revision:number
	queue:Promise<void>
	preload?:Promise<void>
}

let _database:LocalDatabase
let _stores = new Set<string>()
let _on_changed:(paths:string[])=>void
const _states = new Map<string, StoreStateT>()




// Configure once on page load. Opening/installing is lazy: no localdb work on cold loads.
export function Init(options:LocalDBOptionsT, on_changed:(paths:string[])=>void):void {
	_database = new LocalDatabase(options)
	_stores = new Set(options.stores.map(store => store.name))
	_on_changed = on_changed
}




// Explicit installation API for a future install flow; navigation also installs as needed.
export async function Install():Promise<void> {
	await _database.Install()
}




export async function EnsureStores(stores:string[]):Promise<void> {
	await Promise.all([...new Set(stores)].map(ensure_store))
}




export async function GetOne<T extends LocalDBRecordT = LocalDBRecordT>(path:string, id?:LocalDBKeyT):Promise<T | undefined> {
	const separator = path.indexOf("/")
	const store = id === undefined ? path.slice(0, separator) : path
	const key = id === undefined ? path.slice(separator + 1) : id
	if (!await readable([store])) return undefined

	// Path IDs are strings; use GetOne(store, numeric_id) for numeric primary keys.
	return _database.GetOne<T>(store, key)
}




export async function GetAll<T extends LocalDBRecordT = LocalDBRecordT>(store:string):Promise<T[]> {
	const [records] = await ReadMany<T>([{ store }])
	return records
}




export async function ReadMany<T extends LocalDBRecordT = LocalDBRecordT>(queries:LocalDBQueryT[]):Promise<T[][]> {
	if (!queries.length) return []
	if (!await readable(queries.map(query => query.store))) return queries.map(() => [])

	return _database.ReadMany<T>(queries)
}




async function ensure_store(store:string):Promise<void> {
	if (!_stores.has(store)) throw new Error(`LocalDB store is not configured: ${store}`)

	let state = _states.get(store)
	if (!state) {
		state = { loaded: false, revision: -1, queue: Promise.resolve() }
		_states.set(store, state)
	}
	if (state.preload) return state.preload
	if (state.loaded) return state.queue

	const loading = enqueue(state, () => pull(store, state!))
	state.preload = loading
	try {
		await loading
	} finally {
		state.preload = undefined
	}
}

// This hook attaches to the application's EventSource; it never creates a connection.
export function AttachSSE(source:EventSource):()=>void {
	const on_change = (event:Event) => {
		const change = JSON.parse((event as MessageEvent<string>).data) as LocalDBChangeT
		HandleChange(change).catch(error => console.error("LocalDB event failed", error))
	}
	const on_connected = () => {
		// Only navigation-activated stores participate. Cold loads remain entirely ignored.
		// Queue a fresh snapshot even if a preload is in flight: it may predate this connection.
		for (const [store, state] of _states) {
			enqueue(state, () => pull(store, state))
				.catch(error => console.error("LocalDB reconnect sync failed", error))
		}
	}
	source.addEventListener("localdb", on_change)
	source.addEventListener("open", on_connected)
	return () => {
		source.removeEventListener("localdb", on_change)
		source.removeEventListener("open", on_connected)
	}
}

// Sync-only entry point, deliberately absent from the public view API.
export async function HandleChange(change:LocalDBChangeT):Promise<void> {
	const state = _states.get(change.store)
	if (!state) return // Never populate an unrequested store from a partial event.

	await enqueue(state, async () => {
		if (!state.loaded || change.revision <= state.revision) return

		switch (change.operation) {
			case "add":
				await _database.Add(change.store, change.records)
				break
			case "update":
				await _database.Update(change.store, change.records)
				break
			case "delete":
				await _database.Delete(change.store, change.ids)
				break
		}
		state.revision = change.revision
		const ids = change.operation === "delete" ? change.ids : change.records.map(record => record.id)
		_on_changed([change.store, ...ids.map(id => `${change.store}/${id}`)])
	})
}

async function pull(store:string, state:StoreStateT):Promise<void> {
	if (!navigator.onLine) {
		if (!await _database.IsLoaded(store)) throw new Error(`LocalDB store has not been downloaded: ${store}`)
		state.loaded = true
		return
	}

	// Direct fetch intentionally bypasses FetchLassie's HTTP cache. IndexedDB is the cache.
	const response = await fetch(`/api/localdb?${new URLSearchParams({ store })}`, { cache: "no-store" })
	if (!response.ok) throw new Error(`Could not sync LocalDB store: ${store} (${response.status})`)

	const snapshot = await response.json() as LocalDBSnapshotT
	if (snapshot.store !== store) throw new Error(`LocalDB snapshot store mismatch: ${store}`)

	await _database.Replace(store, snapshot.records)
	const was_loaded = state.loaded
	state.loaded = true
	// Revisions are session-only; a reconnect snapshot also resets a restarted server's counter.
	state.revision = snapshot.revision
	if (was_loaded) _on_changed([store])
}

function enqueue(state:StoreStateT, work:()=>Promise<void>):Promise<void> {
	const pending = state.queue.then(work)
	// Snapshot replacement and SSE writes for each store must never overtake one another.
	// Unhandled: failed operations are logged, not retried until navigation/reconnection.
	state.queue = pending.catch(() => {})
	return pending
}

async function readable(stores:string[]):Promise<boolean> {
	// Cold-load ingest gets no local data (not even a previously cached copy). Integration
	// is deferred to the next iteration; SwitchStation shows the requested alert.
	if (!_states.size) return false

	for (const store of stores) {
		if (!_states.get(store)?.loaded) throw new Error(`Declare ${store} in the view's localdb array before reading it`)
	}
	await Promise.all(stores.map(store => _states.get(store)!.queue))
	return true
}





// Views receive reads only: no database handle, write methods, or optimistic mutation API.
if (!(window as any).$N) (window as any).$N = {}
;(window as any).$N.LocalDBSync = { GetOne, GetAll, ReadMany } satisfies LocalDBReaderT
