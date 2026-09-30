declare var render: any;
declare var html: any;

class ButtonComponent extends HTMLElement {
	shadow = this.attachShadow({ mode: 'open' })

	constructor() {
		super()
		// Select before a consumer's bubbling @click handler reads highlighted_index.
		this.addEventListener('click', event => {
			if (this.hasAttribute('busy')) {
				event.preventDefault()
				event.stopImmediatePropagation()
				return
			}

			const item = event.composedPath().find(node => node instanceof ButtonItem) as ButtonItem | undefined
			if (item?.parentElement !== this || !this.hasAttribute('btngroup')) return
			this.set_highlighted_btnitem(item)
		}, { capture: true })
	}

	connectedCallback() {
		render(html`{--css--}{--html--}`, this.shadow)

		// Plain button content uses the same item as an explicit button group.
		if (!this.querySelector(':scope > c-btnitem')) {
			const item = document.createElement('c-btnitem')
			const icon = this.getAttribute('icon')
			if (icon) item.setAttribute('icon', icon)
			while (this.firstChild) item.appendChild(this.firstChild)
			this.appendChild(item)
		}

		// Items added or removed later do not update the group styling automatically.
		const items = this.items
		this.toggleAttribute('btngroup', items.length > 1)
		if (items.length > 1 && !items.some(item => item.hasAttribute('isactive'))) {
			items[0].setAttribute('isactive', '')
		}
	}

	async run(work: () => Promise<void>): Promise<void> {
		if (this.hasAttribute('busy')) return

		this.setAttribute('busy', '')
		this.setAttribute('aria-busy', 'true')
		const spinner_timer = window.setTimeout(() => this.setAttribute('spinning', ''), 300)

		try {
			await work()
		} finally {
			clearTimeout(spinner_timer)
			this.removeAttribute('spinning')
			this.removeAttribute('busy')
			this.removeAttribute('aria-busy')
		}
	}

	private get items() {
		return Array.from(this.querySelectorAll<ButtonItem>(':scope > c-btnitem'))
	}

	get highlighted_btnitem() {
		return this.items.find(item => item.hasAttribute('isactive')) || this.items[0] || null
	}

	set highlighted_btnitem(item: ButtonItem | null) {
		if (item) this.set_highlighted_btnitem(item)
	}

	get highlighted_index() {
		return this.items.indexOf(this.highlighted_btnitem!)
	}

	set highlighted_index(index: number) {
		this.set_highlighted_btnitem(index)
	}

	set_highlighted_btnitem(item_or_index: ButtonItem | number) {
		const items = this.items
		const index = typeof item_or_index === 'number' ? item_or_index : items.indexOf(item_or_index)
		if (index < 0 || index >= items.length) return
		items.forEach((item, position) => item.toggleAttribute('isactive', position === index))
	}
}

class ButtonItem extends HTMLElement {
	connectedCallback() {
		const icon = this.getAttribute('icon')
		if (!icon || this.querySelector(':scope > i[data-btn-icon]')) return

		const element = document.createElement('i')
		element.className = `icon-${icon}`
		element.style.maskImage = `var(--icon-${icon}, var(--icon-placeholder))`
		element.setAttribute('data-btn-icon', '')
		this.prepend(element)
	}
}

customElements.define('c-btnitem', ButtonItem)
customElements.define('c-btn', ButtonComponent)

export { }
