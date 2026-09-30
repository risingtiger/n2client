import type { LazyloadT } from "../defs.js"


type ParamsT = Record<string, string>

export type MatchedViewT = {
	viewpath: string // normalized, e.g. "car/12?color=red"; used for the /v/ url and the view data request
	lazyload: LazyloadT
	pathparams: ParamsT
	searchparams: ParamsT
}




// Mirrors MatchViewPath on the server (view_match_ver2.ts), so a viewpath resolves to the same view on both sides.
// viewpath is e.g. "car/12?color=red", optionally prefixed with "/" or "/v/". The first matching view wins.
export function MatchViewPath(viewpath:string, lazyloads:LazyloadT[]):MatchedViewT {
	// Only the pathname and search params are read, so any origin works as the parsing base.
	const url = new URL(viewpath, "http://localhost/")
	const pathname = url.pathname.replace(/^\/(?:v\/)?/, "")

	for (const lazyload of lazyloads) {
		if (lazyload.type !== "view") continue

		const pathparams = match_urlmatch(pathname, lazyload)
		if (!pathparams) continue

		return { viewpath: pathname + url.search, lazyload, pathparams, searchparams: Object.fromEntries(url.searchParams) }
	}

	throw new Error(`Lazyload view not found: ${viewpath}`)
}




// Unhandled Case: a malformed percent-encoding in a path param makes decodeURIComponent throw.
function match_urlmatch(pathname:string, lazyload:LazyloadT):ParamsT | null {
	if (!lazyload.urlmatch) {
		if (!lazyload.urlmatch_regex) return null
		const match = new RegExp(lazyload.urlmatch_regex).exec(pathname)
		return match ? { ...match.groups } : null
	}

	const paramnames:string[] = []
	const pattern = lazyload.urlmatch
		.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
		.replace(/:([a-zA-Z_0-9]+)/g, (_match, name:string) => {
			paramnames.push(name)
			return "([^/]+)"
		})
	const match = new RegExp(`^${pattern}$`).exec(pathname)
	if (!match) return null

	return Object.fromEntries(paramnames.map((name, index) => [name, decodeURIComponent(match[index + 1])]))
}
