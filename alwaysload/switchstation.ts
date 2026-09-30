import type { ViewT, ViewPartT, LazyloadT, ViewDataT, ViewLoadStateT } from "../defs.js"
import { MatchViewPath, type MatchedViewT } from "./switchstation_match.js"
import { ImportLazyload, LoadViewData, TakeColdLoad } from "./switchstation_loader.js"
import { AdoptStylesheets } from "./switchstation_styles.js"
import { LoadIconsOnce } from "./icons.js"
import { EnsureStores as EnsureLocalDBStores } from "./localdb_sync.js"


// A history entry: the view matched for a viewpath, plus the scroll position to restore when coming back to it.
type NavEntryT = MatchedViewT & { scrollY?:number }

const REVALIDATE_DELAY_MS = 2000
const REVALIDATE_IGNORE_AFTER_PAGELOAD_MS = 5000
const MAX_PENDING_CHANGES = 100
const MAX_HISTORY_ENTRIES = 100

let _lazyloads:LazyloadT[] = []
const _navstack = new Map<number, NavEntryT>()
let _navindex = 0
let _current:NavEntryT
let _version = 0
let _is_coldload_view = false
let _view_ready = false
let _refreshing = false
let _force_refresh = false
let _refresh_timer:ReturnType<typeof setTimeout> | undefined
let _last_refresh_started = 0
let _refreshon = new Set<string>()
const _pending_changes = new Set<string>()
let _data_abort_controller:AbortController | undefined
let _dispose_listeners:(()=>void) | undefined




export const Init = (lazyloads:LazyloadT[]) => {

	// Reinitialization must not leave old listeners, timers or data requests alive.
	_dispose_listeners?.()
	reset_view_state()
	_lazyloads = lazyloads

	const entry = MatchViewPath(location_viewpath(), _lazyloads)
	_navstack.clear()
	_navindex = 0
	remember_entry(_navindex, entry)
	history.scrollRestoration = "manual"
	history.replaceState({ switchstation_index: _navindex }, "")
	_dispose_listeners = add_listeners()

	_current = entry
	// A cold load page (dist only) has already run this view's assets and carries its data. A warm load page carries
	// neither, so its first view loads just like a navigation.
	const coldload_viewdata = TakeColdLoad(entry.lazyload, _lazyloads)
	_is_coldload_view = coldload_viewdata !== null
	// Localdb is deliberately not installed/preloaded for a cold loaded view, including its background revalidations.
	// Cold load integration is deferred to the next iteration.
	if (_is_coldload_view && entry.lazyload.localdb?.length) alert('Need to integrate localdb for app cold loads')
	mount_view(entry, ++_version, coldload_viewdata)
}




async function GoTo(path:string, opts?:{replacestate?:boolean}) {
	const entry = MatchViewPath(path, _lazyloads)
	const url = `/v/${entry.viewpath}`
	const previous = _current
	previous.scrollY = window.scrollY

	if (opts?.replacestate) {
		remember_entry(_navindex, entry)
		history.replaceState({ switchstation_index: _navindex }, "", url)
	} else {
		// Forward entries are no longer reachable after a new push from a back navigation.
		for (const index of _navstack.keys()) {
			if (index > _navindex) _navstack.delete(index)
		}
		_navindex++
		remember_entry(_navindex, entry)
		history.pushState({ switchstation_index: _navindex }, "", url)
	}

	show_entry(entry, previous)
}




async function GoBack(opts?:{default?:string}) {
	if (_navindex === 0) {
		await GoTo(opts?.default || "home", { replacestate: true })
		return
	}

	history.back()
}




async function UpdateViewPart(part:HTMLElement & ViewPartT) {
	await part.ingest()
	part.render()
	// A dist part's first render must come through here to get its stylesheets. Parts that first render themselves,
	// or whose module registers after the view sets .context (setter never runs), are not covered.
	AdoptStylesheets(part)
}




export const HandleSSEInitOnChanged = (paths:string[]) => {
	for (const path of paths) {
		if (_force_refresh) break
		_pending_changes.add(path)
		if (_pending_changes.size < MAX_PENDING_CHANGES) continue

		// Too many distinct paths: a full refresh is cheaper than retaining the queue.
		_pending_changes.clear()
		_force_refresh = true
		break
	}
	check_refresh()
}




export const HandleSSEInitOnConnected = () => {
	// No event replay: revalidate after initial connection and each reconnection.
	request_revalidation()
}




function request_revalidation() {
	// The view data was just loaded with the page (cold load or refresh), so early SSE connect and focus signals are
	// redundant. performance.now() counts from the page's navigation start.
	// Unhandled Case: an SSE drop-and-reconnect inside this window is also ignored, so changes missed during it are not
	// revalidated until the next engagement or change notification.
	if (performance.now() < REVALIDATE_IGNORE_AFTER_PAGELOAD_MS) return

	_force_refresh = true
	// Engagement and SSE reconnection can arrive together; wait for the last signal.
	if (_refresh_timer) clearTimeout(_refresh_timer)
	_refresh_timer = setTimeout(() => {
		_refresh_timer = undefined
		check_refresh()
	}, REVALIDATE_DELAY_MS)
}




function add_listeners():()=>void {
	const on_engaged = () => {
		if (!document.hidden) request_revalidation()
	}
	const on_pageshow = (event:PageTransitionEvent) => {
		if (event.persisted) request_revalidation()
	}

	window.addEventListener("popstate", on_popstate)
	document.addEventListener("visibilitychange", on_engaged)
	window.addEventListener("focus", on_engaged)
	window.addEventListener("pageshow", on_pageshow)

	return () => {
		window.removeEventListener("popstate", on_popstate)
		document.removeEventListener("visibilitychange", on_engaged)
		window.removeEventListener("focus", on_engaged)
		window.removeEventListener("pageshow", on_pageshow)
	}
}




// Drops everything tied to the previously shown view: its data request, refresh timer and queued changes.
// Shared asset imports are left running.
function reset_view_state() {
	_data_abort_controller?.abort()
	if (_refresh_timer) clearTimeout(_refresh_timer)
	_refresh_timer = undefined
	_view_ready = false
	_refreshing = false
	_force_refresh = false
	_last_refresh_started = 0
	_refreshon.clear()
	_pending_changes.clear()
}




function show_entry(entry:NavEntryT, previous:NavEntryT) {
	_is_coldload_view = false
	_current = entry
	const version = ++_version
	reset_view_state()

	if (entry.lazyload === previous.lazyload && active_view_element()) {
		update_view_params(entry, version)
		return
	}

	mount_view(entry, version)
}




// Imports the view (with its dependencies) and loads its data concurrently, then replaces the active view element.
// A cold loaded view passes its data in, and its imports already count as done.
async function mount_view(entry:NavEntryT, version:number, coldload_viewdata:ViewDataT | null = null) {
	try {
		const [, viewdata] = await Promise.all([
			ImportLazyload(entry.lazyload, _lazyloads),
			coldload_viewdata ?? load_viewdata(entry),
		])
		if (version !== _version) return

		active_view_element()?.remove()
		const view = document.createElement(`v-${entry.lazyload.name}`) as HTMLElement & ViewT
		view.classList.add("view")
		view.dataset.active = "true"
		views_element().appendChild(view)

		if (!await ingest_and_render(view, entry, 'initial', viewdata, version)) return
		AdoptStylesheets(view)
		mark_view_ready(viewdata)
	} catch (error) {
		if (version !== _version) return
		// The view is not ready; discard queued notifications after a failed load.
		_pending_changes.clear()
		console.error("Could not mount view", error)
	}
}




// Same view with new path or search params: only its data reloads, into the existing view element.
async function update_view_params(entry:NavEntryT, version:number) {
	try {
		const viewdata = await load_viewdata(entry)
		if (version !== _version) return

		if (!await ingest_and_render(active_view_element()!, entry, 'paramschanged', viewdata, version)) return
		mark_view_ready(viewdata)
	} catch (error) {
		if (version !== _version) return
		_pending_changes.clear()
		console.error("Could not load view parameters", error)
	}
}




function check_refresh() {
	if (!_view_ready || _refreshing || _refresh_timer) return

	let should_refresh = _force_refresh
	for (const path of _pending_changes) {
		if (_refreshon.has(path)) {
			should_refresh = true
			break
		}
	}
	if (!should_refresh) {
		_pending_changes.clear()
		return
	}

	// Never start two active-view refreshes within the same REVALIDATE_DELAY_MS window.
	const remaining = REVALIDATE_DELAY_MS - (Date.now() - _last_refresh_started)
	if (remaining > 0) {
		_refresh_timer = setTimeout(() => {
			_refresh_timer = undefined
			check_refresh()
		}, remaining)
		return
	}

	_force_refresh = false
	_pending_changes.clear()
	_refreshing = true
	_last_refresh_started = Date.now()
	refresh_view(_current, _version)
}




async function refresh_view(entry:NavEntryT, version:number) {
	try {
		const viewdata = await load_viewdata(entry, true)
		if (version !== _version) return

		if (!await ingest_and_render(active_view_element()!, entry, 'server_state_change', viewdata, version)) return
		_refreshon = new Set(viewdata.refreshon)
	} catch (error) {
		if (version !== _version) return
		// Unhandled Case: a failed refresh is not retried until another notification or engagement.
		console.error("Could not refresh view data", error)
	} finally {
		if (version === _version) {
			_refreshing = false
			check_refresh()
		}
	}
}




// Returns false, leaving the view unrendered, when a newer navigation started while the view ingested.
async function ingest_and_render(view:HTMLElement & ViewT, entry:NavEntryT, loadstate:ViewLoadStateT, viewdata:ViewDataT, version:number):Promise<boolean> {
	view.context = { loadeddata: viewdata.data, pathparams: entry.pathparams, searchparams: entry.searchparams, loadstate }
	await view.ingest()
	if (version !== _version) return false

	view.render()
	return true
}




function mark_view_ready(viewdata:ViewDataT) {
	_refreshon = new Set(viewdata.refreshon)
	_view_ready = true
	LoadIconsOnce()
	check_refresh()
}




function on_popstate(event:PopStateEvent) {
	// Evicted entries can be rebuilt from the URL, but lose their saved scroll position.
	const previous = _current
	previous.scrollY = window.scrollY
	_navindex = event.state.switchstation_index
	const entry = _navstack.get(_navindex) ?? MatchViewPath(location_viewpath(), _lazyloads)
	remember_entry(_navindex, entry)

	show_entry(entry, previous)
	window.scrollTo(0, entry.scrollY || 0)
}




function remember_entry(index:number, entry:NavEntryT) {
	_navstack.delete(index)
	_navstack.set(index, entry)
	// Keep only recent entries in memory; browser history still owns the full stack.
	if (_navstack.size > MAX_HISTORY_ENTRIES) _navstack.delete(_navstack.keys().next().value!)
}




// The view's localdb stores install alongside its data, and their names join refreshon so store changes refresh the
// view. A cold loaded view skips its stores (see Init).
function load_viewdata(entry:NavEntryT, background = false):Promise<ViewDataT> {
	const controller = new AbortController()
	_data_abort_controller = controller
	const stores = _is_coldload_view ? [] : (entry.lazyload.localdb ?? [])

	return Promise.all([
		LoadViewData(entry.viewpath, background, controller.signal),
		EnsureLocalDBStores(stores),
	]).then(([viewdata]) => ({
		data: viewdata.data,
		refreshon: [...new Set([...viewdata.refreshon, ...stores])],
	})).finally(() => {
		if (_data_abort_controller === controller) _data_abort_controller = undefined
	})
}




// The server's page routes: "/" and "/index.html" show home, "/v/<viewpath>" shows that view (MatchViewPath strips "/v/").
function location_viewpath() {
	const { pathname, search } = window.location
	if (pathname === "/" || pathname === "/index.html") return "home" + search

	return pathname + search
}




function views_element() {
	const views = document.getElementById("views")
	if (!views) throw new Error('SwitchStation requires a "#views" element')

	return views
}




function active_view_element() {
	return views_element().querySelector<HTMLElement & ViewT>(':scope > [data-active="true"]')
}




if (!(window as any).$N) (window as any).$N = {}
;(window as any).$N.SwitchStation = { GoTo, GoBack, UpdateViewPart, HandleSSEInitOnChanged, HandleSSEInitOnConnected }
