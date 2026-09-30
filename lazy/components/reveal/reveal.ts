declare var render: any;
declare var html: any;


const TRANSITION_FALLBACK_MS = 600 // The grid-template-rows transition lasts 420ms.


class RevealComponent extends HTMLElement {

	shadow = this.attachShadow({ mode: "open" })
	private is_closing = false

	static get observedAttributes() { return ["close"] }

	async connectedCallback() {
		// Hide slotted content until the shadow stylesheet is applied.
		this.style.display = "none"
		render(this.template(), this.shadow)

		await wait_for_stylesheets(this.shadow)
		if (!this.isConnected) return

		this.style.display = ""
		void this.offsetHeight // Commit the collapsed layout before starting the transition.
		this.setAttribute("active", "")

		// Unhandled Case: a close during opening can still be followed by an open event.
		// Reconnecting a previously closed instance does not reset its closing state.
		await this.wait_for_grid_transition()
		if (!this.isConnected) return

		this.dispatchEvent(new Event("open"))
	}

	attributeChangedCallback(_name: string, _old_value: string | null, new_value: string | null) {
		if (new_value === null) return
		void this.close()
	}

	async close() {
		if (this.is_closing) return
		this.is_closing = true

		this.removeAttribute("active")
		await this.wait_for_grid_transition()
		if (!this.isConnected) return // A stale close event would misdirect the view after unmounting.

		this.dispatchEvent(new Event("close"))
	}

	private wait_for_grid_transition() {
		return new Promise<void>(resolve => {
			const finish = () => {
				this.removeEventListener("transitionend", handle_transition_end)
				clearTimeout(fallback_id)
				resolve()
			}

			const handle_transition_end = (event: TransitionEvent) => {
				if (event.target !== this || event.propertyName !== "grid-template-rows") return
				finish()
			}

			this.addEventListener("transitionend", handle_transition_end)
			// Also finish when no transition runs (for example, closing an already collapsed element).
			const fallback_id = setTimeout(finish, TRANSITION_FALLBACK_MS)
		})
	}

	private template = () => html`{--css--}{--html--}`
}


// Development uses links; production inlines styles, so there is nothing to wait for.
function wait_for_stylesheets(root: ShadowRoot) {
	const pending_links = Array.from(root.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
		.filter(link => !link.sheet)

	return Promise.all(pending_links.map(link => new Promise<void>(resolve => {
		link.addEventListener('load', () => resolve(), { once: true })
		// Unhandled Case: a failed stylesheet reveals unstyled content rather than hanging.
		link.addEventListener('error', () => resolve(), { once: true })
	})))
}


customElements.define("c-reveal", RevealComponent)

export { }
