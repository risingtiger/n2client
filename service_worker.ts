/// <reference lib="webworker" />

const worker = self as unknown as ServiceWorkerGlobalScope
const CORE_CACHE = "core_cache"
const ASSET_CACHE = "asset_cache"
const DATA_CACHE = "data"
const CACHED_AT_HEADER = "Nifty-Cached-At"
// The server's warm load page, which links the other core files.
const WARM_LOAD_PAGE = "/assets/index.html"
const CORE_FILES = [
	WARM_LOAD_PAGE,
	"/assets/index.css",
	"/assets/main.css",
	"/assets/instance/main.css",
	"/assets/main.js",
]


worker.addEventListener("install", event => {
	event.waitUntil(precache_core_files().then(() => worker.skipWaiting()))
})


worker.addEventListener("activate", event => {
	// Clear lazy-loaded assets on each activation; the new worker fetches fresh copies.
	event.waitUntil(Promise.all([
		caches.delete(ASSET_CACHE),
		caches.delete(DATA_CACHE)
	]).then(() => worker.clients.claim()))
})


worker.addEventListener("fetch", event => {
	if (event.request.method !== "GET") return

	const url = new URL(event.request.url)
	if (url.origin !== worker.location.origin) return

	// Same page routes as the server.
	const is_page = url.pathname === "/" || url.pathname === "/index.html" || url.pathname.startsWith("/v/")
	if (event.request.mode === "navigate" && is_page) {
		event.respondWith(serve_page(event.request))
		return
	}

	if (event.request.headers.has("Nifty-Cache")) {
		event.respondWith(serve_data(event.request, event))
		return
	}

	// Core files, views, components, thirdparty, and in dev also the alwaysload modules and linked css.
	if (!url.pathname.startsWith("/assets/")) return

	const cache_name = CORE_FILES.includes(url.pathname) ? CORE_CACHE : ASSET_CACHE
	event.respondWith(serve_asset(cache_name, event.request, event))
})




// Core files are only fetched when the warm load page is missing, so a new worker keeps the core files already cached.
async function precache_core_files():Promise<void> {
	const cache = await caches.open(CORE_CACHE)
	if (await cache.match(WARM_LOAD_PAGE)) return

	await cache.addAll(CORE_FILES.map(path => new Request(path, { cache: "no-store" })))
}




// Every page load is a warm load from the cached page. Only before it is cached does the page come from the server:
// the cold load page in dist, the warm load page in dev.
async function serve_page(request:Request):Promise<Response> {
	const cache = await caches.open(CORE_CACHE)
	const cached = await cache.match(WARM_LOAD_PAGE)
	if (!cached) return fetch(request)

	return cached
}




// Cache first; a miss is fetched and cached.
async function serve_asset(cache_name:string, request:Request, event:FetchEvent):Promise<Response> {
	const cache = await caches.open(cache_name)
	const cached = await cache.match(request)
	if (cached) return cached

	const response = await fetch(request, { cache: "no-store" })
	if (!response.ok) return response

	// Let the browser consume the response concurrently with the cache write.
	event.waitUntil(cache.put(request, response.clone()))
	return response
}




async function serve_data(request:Request, event:FetchEvent):Promise<Response> {
	if (request.headers.has("Nifty-No-Cache")) return fetch(request, { cache: "no-store" })

	const cache = await caches.open(DATA_CACHE)
	const cached = await cache.match(request)
	const duration = Number(request.headers.get("Nifty-Cache") ?? 0)
	const cached_at = Number(cached?.headers.get(CACHED_AT_HEADER) ?? 0)
	if (cached && duration > 0 && cached_at > 0 && Date.now() - cached_at < duration * 1000) return cached
	if (cached && !worker.navigator.onLine) return cached

	let response:Response
	try {
		response = await fetch(request, { cache: "no-store" })
	} catch (error) {
		if (cached) return cached
		throw error
	}
	if (!response.ok) return response

	const headers = new Headers(response.headers)
	headers.set(CACHED_AT_HEADER, Date.now().toString())
	// Cache in the event lifetime while the caller consumes the original stream.
	// Awaiting cache.put here would buffer its unread clone in memory.
	event.waitUntil(cache.put(request, new Response(response.clone().body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	})))
	return response
}
