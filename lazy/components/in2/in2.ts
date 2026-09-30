declare var render: any;
declare var html: any;


type ControlType = "input" | "select" | "toggle" | "textarea"
type InputType = "text" | "tel" | "email" | "password" | "number" | "url" | "date" | "time" | "datetime-local" | "month" | "week" | "color" | "search" | "file" | "range"
type SelectOption = { label: string, value: string }

type InputConfig = {
	name: string,
	control_type: ControlType,
	input_type: InputType,
	label: string,
	label_width: number,
	placeholder: string,
	rows: number,
	options: SelectOption[],
	min: string,
	max: string,
	step: number,
}


class InputComponent extends HTMLElement {

	shadow = this.attachShadow({ mode: 'open' })
	private config!: InputConfig
	private value = ""

	static get observedAttributes() { return ["val"] }

	connectedCallback() {
		this.config = this.read_config()
		this.value = this.getAttribute("val") || ""
		this.update()
	}

	attributeChangedCallback(_name: string, old_value: string | null, new_value: string | null) {
		// Initial attributes are read on connection; parent echoes of an update need no render.
		if (!this.isConnected || !this.config || old_value === new_value) return

		this.value = new_value ?? ""
		this.update()
	}

	private read_config(): InputConfig {
		// Unhandled Case: only val is observed; other attribute changes take effect on reconnection.
		// Unhandled Case: invalid numeric attributes are not validated.
		return {
			name: this.getAttribute("name") || "",
			control_type: (this.getAttribute("type") || "input") as ControlType,
			input_type: (this.getAttribute("inputtype") || "text") as InputType,
			label: this.getAttribute("label") || "",
			label_width: parseInt(this.getAttribute("labelwidth") || "125"),
			placeholder: this.getAttribute("placeholder") || "",
			rows: parseInt(this.getAttribute("rows") || "3"),
			options: parse_select_options(this.getAttribute("options") || ""),
			min: this.getAttribute("min") || "",
			max: this.getAttribute("max") || "",
			step: parseFloat(this.getAttribute("step") || "1"),
		}
	}

	private update() {
		render(this.template(), this.shadow)
	}

	private focus_control() {
		this.shadow.querySelector<HTMLElement>(".controlel")!.focus()
	}

	private select_input_text(event: FocusEvent) {
		// Input types without text selection keep their native select() behavior.
		(event.currentTarget as HTMLInputElement).select()
	}

	private toggle_value() {
		this.change_value(this.value === "true" ? "false" : "true")
	}

	private handle_toggle_keydown(event: KeyboardEvent) {
		if (event.key !== " ") return

		event.preventDefault()
		this.toggle_value()
	}

	private get_number_state() {
		return {
			value: parseFloat(this.value) || 0,
			min: this.config.min ? parseFloat(this.config.min) : -Infinity,
			max: this.config.max ? parseFloat(this.config.max) : Infinity,
		}
	}

	private step_number(direction: "up" | "down") {
		const input = this.shadow.querySelector<HTMLInputElement>(".controlel")!
		const { value, min, max } = this.get_number_state()

		// Unhandled Case: fractional steps accumulate floating-point error.
		const next_value = direction === "up"
			? Math.min(value + this.config.step, max)
			: Math.max(value - this.config.step, min)

		// A value attribute no longer updates the displayed value once the user has typed.
		input.value = String(next_value)
		this.change_value(input.value)
	}

	private handle_control_change(event: Event) {
		this.change_value((event.currentTarget as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value)
	}

	private change_value(new_value: string) {
		const old_value = this.value

		this.setAttribute("val", new_value) // attributeChangedCallback updates value and renders.
		this.dispatchEvent(new CustomEvent("update", {
			detail: { name: this.config.name, newval: new_value, oldval: old_value },
		}))
	}

	private render_control() {
		switch (this.config.control_type) {
			case "toggle": return this.render_toggle()
			case "select": return this.render_select()
			case "textarea": return this.render_textarea()
			// Unhandled Case: unknown control types render as an input.
			default: return this.render_input()
		}
	}

	private render_toggle() {
		return html`
			<span class="switch controlel ${this.value === 'true' ? 'istrue' : ''}"
				tabindex="0"
				@click="${() => this.toggle_value()}"
				@keydown="${(event: KeyboardEvent) => this.handle_toggle_keydown(event)}">
				<span class="inner"></span>
			</span>`
	}

	private render_select() {
		return html`
			<select class="controlel" name="${this.config.name}"
				@change="${(event: Event) => this.handle_control_change(event)}">
				${this.config.options.map(option => html`
					<option value="${option.value}" ?selected="${option.value === this.value}">${option.label}</option>`)}
			</select>`
	}

	private render_textarea() {
		return html`
			<textarea class="controlel" name="${this.config.name}"
				.value="${this.value}"
				placeholder="${this.config.placeholder}"
				rows="${this.config.rows}"
				@input="${(event: Event) => this.handle_control_change(event)}"></textarea>`
	}

	private render_input() {
		// Bind the attribute, not .value: number inputs report "" for partial entries like "-";
		// a property binding would wipe those entries mid-typing.
		// Unhandled Case: parent val changes don't display in an input already edited by the user.
		const input = html`
			<input class="controlel" type="${this.config.input_type}" name="${this.config.name}"
				value="${this.value}"
				placeholder="${this.config.placeholder}"
				min="${this.config.min}"
				max="${this.config.max}"
				enterkeyhint="done"
				@input="${(event: Event) => this.handle_control_change(event)}"
				@focus="${(event: FocusEvent) => this.select_input_text(event)}">`

		if (this.config.input_type !== "number") return input

		const { value, min, max } = this.get_number_state()
		return html`
			<div class="number-spinner">
				${input}
				<div class="spinner-buttons">
					<button class="spinner-btn spinner-up" tabindex="-1" ?disabled="${value >= max}" @click="${() => this.step_number("up")}">
						<i class="arrow"></i>
					</button>
					<button class="spinner-btn spinner-down" tabindex="-1" ?disabled="${value <= min}" @click="${() => this.step_number("down")}">
						<i class="arrow"></i>
					</button>
				</div>
			</div>`
	}

	private template = () => html`{--css--}{--html--}`
}


// Options use "Label:value,Other label"; a missing value defaults to the label.
// Unhandled Case: labels or values containing "," or ":" can't be expressed.
function parse_select_options(options: string): SelectOption[] {
	if (!options) return []

	return options.split(",").map(option => {
		const [label, value = label] = option.trim().split(":")
		return { label, value }
	})
}


customElements.define('c-in2', InputComponent)

export { }
