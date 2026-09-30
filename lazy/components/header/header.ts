declare var render: any;
declare var html: any;


export class CHeader extends HTMLElement {

	shadow = this.attachShadow({ mode: 'open' })
	private heading = ''
	private left_icon = ''
	private right_icons: string[] = []

	connectedCallback() {
		this.update()
	}

	SetTitle(title: string) {
		this.heading = title
		this.update()
	}

	// An empty string clears the left icon.
	SetLeftIcon(icon: string) {
		this.left_icon = icon
		this.update()
	}

	// Replaces all actions; an empty array clears them.
	SetRightActionIcons(icons: string[]) {
		this.right_icons = [...icons]
		this.update()
	}

	private update() {
		render(this.template(), this.shadow)
	}

	private template = () => html`{--css--}{--html--}`
}


customElements.define('c-header', CHeader)
