let dispose_source:(()=>void) | undefined

export function Init(on_changed:(paths:string[])=>void, on_connected:()=>void, attach?:(source:EventSource)=>()=>void):void {
	// Repeated initialization must close the previous connection and its callbacks.
	dispose_source?.()
	const source = new EventSource("/api/events")
	const on_change = (event:Event) => {
		on_changed(JSON.parse((event as MessageEvent<string>).data) as string[])
	}
	source.onopen = on_connected
	source.addEventListener("changed", on_change)
	const detach = attach?.(source)
	dispose_source = () => {
		detach?.()
		source.removeEventListener("changed", on_change)
		source.onopen = null
		source.close()
	}
}
