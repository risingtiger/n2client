import type { LazyloadT, ViewDataT, $NT } from "../defs.js"
import "./fetchlassie.js"


declare var $N: $NT;


type ColdLoadWindowT = Window & { __n2_appcoldload?:ViewDataT }


// Keyed by asset url: each view, component and thirdparty is imported once per document, however many views need it.
const _imports = new Map<string, Promise<unknown>>()




// Imports a view, component or thirdparty from /assets/. The server returns only the entry itself (with its relative
// imports), so its declared dependencies are imported here first: every dependency runs before whatever depends on
// it, the same order as the cold load page's inline scripts. Independent dependencies import concurrently.
// Unhandled Case: a dependency cycle recurses without end.
// Unhandled Case: a dependency without a main.json entry throws.
// Unhandled Case: a failed import stays rejected for this document; it is not retried.
export function ImportLazyload(lazyload:LazyloadT, lazyloads:LazyloadT[]):Promise<unknown> {
	const url = asset_url(lazyload)
	const pending = _imports.get(url)
	if (pending) return pending

	const importing = Promise.all(find_dependencies(lazyload, lazyloads).map(dependency => ImportLazyload(dependency, lazyloads)))
		.then(() => import(url))
	_imports.set(url, importing)
	return importing
}




// A cold load page (dist only) has already run the first view and its dependencies as inline module scripts, and
// carries that view's data as window.__n2_appcoldload. Returns that data, or null on a warm load page.
// The data is handed out once, so coming back to this view later loads fresh data.
export function TakeColdLoad(view:LazyloadT, lazyloads:LazyloadT[]):ViewDataT | null {
	const coldload_window = window as ColdLoadWindowT
	const viewdata = coldload_window.__n2_appcoldload
	if (!viewdata) return null

	delete coldload_window.__n2_appcoldload
	mark_imported(view, lazyloads)
	return viewdata
}




// Runs the view's server-side loader. Goes through FetchLassie like any other data request (network first, with an
// offline cache fallback); the signal lets navigation cancel it without cancelling shared asset imports.
export async function LoadViewData(viewpath:string, background:boolean, signal:AbortSignal):Promise<ViewDataT> {
	const response = await $N.FetchLassie(`/api/view-data?${new URLSearchParams({ viewpath })}`, { signal }, {
		cacheduration: 0,
		clicklock: !background,
	})
	if (!response.ok) throw new Error(`Could not load view data: ${viewpath}`)
	return response.data as ViewDataT
}




// Unhandled Case: a view declared as a dependency is not inlined by the cold load page, yet is marked imported here.
function mark_imported(lazyload:LazyloadT, lazyloads:LazyloadT[]) {
	const url = asset_url(lazyload)
	if (_imports.has(url)) return

	_imports.set(url, Promise.resolve())
	for (const dependency of find_dependencies(lazyload, lazyloads)) mark_imported(dependency, lazyloads)
}




function find_dependencies(lazyload:LazyloadT, lazyloads:LazyloadT[]):LazyloadT[] {
	return (lazyload.dependencies ?? []).map(dependency =>
		lazyloads.find(item => item.type === dependency.type && item.name === dependency.name)!)
}




// The server's LazyloadFilePath (lazyloads_ver2.ts), under its /assets/ route.
function asset_url(lazyload:LazyloadT):string {
	const prefix = "/assets/" + (lazyload.is_instance ? "instance/" : "")

	if (lazyload.type === "view") return `${prefix}lazy/views/${lazyload.name}/${lazyload.name}.js`
	if (lazyload.type === "component") return `${prefix}lazy/components/${lazyload.name}/${lazyload.name}.js`
	return `${prefix}thirdparty/${lazyload.name}.js`
}
