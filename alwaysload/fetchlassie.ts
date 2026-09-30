
import { FetchResultT, FetchLassieHttpOptsT, FetchLassieOptsT, $NT } from "../defs.js"



declare var $N: $NT;


const ANIMATE_TIMEOUT = 9
let animateTimeout:ReturnType<typeof setTimeout> | undefined
let activeClicklocks = 0



function normalize_params(http_opts:FetchLassieHttpOptsT = {}, opts:FetchLassieOptsT = {}) {
	return {
		http_opts: {
			...http_opts,
			method: http_opts.method ?? "GET",
			headers: { ...http_opts.headers },
		},
		opts: {
			...opts,
			clicklock: opts.clicklock ?? true,
			animate: opts.animate ?? true,
			cacheduration: opts.cacheduration ?? 0,
		},
	}
}




async function Init() {

	// nothing for now
}




async function FetchLassie(url:string, http_optsP?:FetchLassieHttpOptsT, optsP?:FetchLassieOptsT):Promise<FetchResultT> {

	const { http_opts, opts } = normalize_params(http_optsP, optsP)

	// Route GETs through the worker even at duration 0; nocache bypasses its storage.
	if (http_opts.method === "GET") {
		http_opts.headers["Nifty-Cache"] = opts.cacheduration.toString()
		if (opts.nocache) http_opts.headers["Nifty-No-Cache"] = "true"
	}

	if (!http_opts.headers["Content-Type"]) http_opts.headers["Content-Type"] = "application/json"
	if (!http_opts.headers["Accept"]) http_opts.headers["Accept"] = "application/json"

	if (opts.clicklock) {
		// Count concurrent locked requests so the first completion cannot hide another's overlay.
		activeClicklocks++
		setAnimate(true)
	}

	try {
		const result = await fetchit(url, http_opts)

		if (result.status !== 200) {
			if (result.status === 426) {
				// App update in flight - the service worker is swapping versions and will reload the
				// page momentarily. Belt-and-braces overlay in case the SW's update_pending message lags.
				$N.UpdateOverlayShow?.()
			}
			return {headers:result.headers, status: result.status, statusText: result.statusText, ok: false}
		}

		try {
			const returnobj:FetchResultT = {
				headers: result.headers,
				status: 200,
				statusText: result.statusText,
				ok: true,
			}

			if (http_opts.headers["Accept"] === "application/json") {
				returnobj.data = await result.json()
			} else {
				returnobj.data = await result.text()
			}
			return returnobj
		} catch (e) {
			return {status: 400, statusText: "Could not parse text or json", ok: false, headers: result.headers}
		}
	} finally {
		// Also runs when fetch rejects or is aborted, not just on a successful response.
		if (opts.clicklock && --activeClicklocks === 0) setAnimate(false)
	}
}




const fetchit = (url:string, http_opts:FetchLassieHttpOptsT):Promise<Response> => {
	const requestOpts:RequestInit = {
		...http_opts,
		cache: http_opts.method === "GET" ? "no-store" : undefined,
		body: http_opts.body ? JSON.stringify(http_opts.body) : undefined,
	}

	return fetch(url, requestOpts)
}




function setAnimate(ison:boolean) {
	const overlayId = "fetchlassie_background_overlay"
	const existingOverlay = document.body.querySelector(`#${overlayId}`)

	if (animateTimeout) clearTimeout(animateTimeout)

	if (!ison) {
		animateTimeout = undefined
		existingOverlay?.getAnimations({ subtree: true }).forEach(animation => animation.cancel())
		existingOverlay?.remove()
		return
	}

	animateTimeout = setTimeout(() => setAnimate(false), ANIMATE_TIMEOUT * 1000)

	if (existingOverlay) return

	const overlay = document.createElement("div")
	overlay.id = overlayId
	overlay.setAttribute("role", "status")
	overlay.setAttribute("aria-label", "Loading")
	Object.assign(overlay.style, {
		position: "fixed",
		top: "50%",
		left: "50%",
		transform: "translate(-50%, -50%)",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		width: "75px",
		height: "75px",
		borderRadius: "50%",
		background: "rgba(255, 255, 255, 0.3)",
		backdropFilter: "blur(24px)",
		WebkitBackdropFilter: "blur(24px)",
		boxShadow: "0 0 30px rgba(255, 255, 255, 0.3)",
		zIndex: "9999",
	})

	const spinner = document.createElement("div")
	Object.assign(spinner.style, {
		width: "43px",
		height: "43px",
		border: "4px solid rgba(255, 255, 255, 0.45)",
		borderTopColor: "rgba(255, 255, 255, 0.95)",
		borderRadius: "50%",
		boxSizing: "border-box",
	})
	spinner.animate(
		[
			{ transform: "rotate(0deg)" },
			{ transform: "rotate(360deg)" },
		],
		{ duration: 800, iterations: Infinity, easing: "linear" },
	)

	overlay.appendChild(spinner)
	document.body.appendChild(overlay)
}




export { Init }


if (!(window as any).$N) {   (window as any).$N = {};   }
((window as any).$N as any).FetchLassie = FetchLassie;


// export { RunWithForceReloadCache }

