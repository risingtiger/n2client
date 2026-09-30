let _scheduled = false


// Called after the first successful view render. One document-level sheet supplies inherited SVG masks
// to every shadow root; two frames give the initial view a rendering opportunity before the request starts.
// Unhandled Case: a failed load leaves placeholders until the next page load; there is no retry.
// Animation frames pause in background tabs, so icons wait until the document becomes visible.
export function LoadIconsOnce() {
	if (_scheduled) return
	_scheduled = true

	requestAnimationFrame(() => requestAnimationFrame(() => {
		const link = document.createElement("link")
		link.rel = "stylesheet"
		link.href = "/assets/instance/icons.css"
		document.head.appendChild(link)
	}))
}
