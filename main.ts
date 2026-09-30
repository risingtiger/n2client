import { html, render } from "./thirdparty/lit-html.js"
import type { AppSettingsT } from "./defs.js"
import { Init as SwitchStationInit, HandleSSEInitOnChanged as SwitchStationHandleSSEInitOnChanged, HandleSSEInitOnConnected as SwitchStationHandleSSEInitOnConnected } from "./alwaysload/switchstation.js"
import { Init as SSEInit } from "./alwaysload/sse.js"
import { Init as LocalDBInit, AttachSSE as AttachLocalDBSSE } from "./alwaysload/localdb_sync.js"


declare const SETTINGS: AppSettingsT


(window as any).html = html;
(window as any).render = render;


window.addEventListener("load", () => {

	const lazyloads = [...SETTINGS.MAIN.LAZYLOADS, ...SETTINGS.INSTANCE.LAZYLOADS]

	LocalDBInit({
		// Use a user-specific name before introducing account switching on the same device.
		name: `${SETTINGS.INSTANCE.INFO.shortname}-localdb`,
		version: SETTINGS.INSTANCE.INFO.firebase.dbversion,
		stores: [...new Map([
			...lazyloads.flatMap(view => (view.localdb ?? []).map(name => ({ name }))),
			...SETTINGS.MAIN.INFO.localdb,
			...(SETTINGS.INSTANCE.INFO.localdb ?? SETTINGS.INSTANCE.INFO.localdb_objectstores ?? []),
		].map(store => [store.name, store])).values()],
	}, SwitchStationHandleSSEInitOnChanged)
	// Init only configures the plugin; database installation waits for navigation.
	SwitchStationInit(lazyloads);

	SSEInit(
		(paths:string[])=> { // sse on changed handler
			SwitchStationHandleSSEInitOnChanged(paths)
		}, 
		()=>{  // sse on connected handler
			SwitchStationHandleSSEInitOnConnected()
		},
		AttachLocalDBSSE,
	)

	if (!("serviceWorker" in navigator)) return

	navigator.serviceWorker.register("/service_worker.js", { updateViaCache: "none" })
		.catch(error => console.error("Service worker registration failed", error))
})


//{--replace_slot.js--}
