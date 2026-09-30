

declare var render: any;
declare var html: any;


type HeaderAction = {
	icon: string,
	onClick: () => void,
}

type SwipeState = {
	pointer_id: number,
	start_y: number,
	last_y: number,
	last_time: number,
	velocity_y: number, // Pixels per millisecond over the latest move; positive is downward.
	dismiss_distance: number,
}


// Phones use a full-width bottom sheet; wider screens use a centered card. Match ol2.css.
const BOTTOM_SHEET_LAYOUT = window.matchMedia('(max-width: 767px)')
const CARD_OPEN_ANIMATION: KeyframeAnimationOptions = { duration: 360, easing: 'cubic-bezier(.16, .86, .34, 1)' }
const SHEET_OPEN_ANIMATION: KeyframeAnimationOptions = { duration: 520, easing: 'cubic-bezier(.16, .86, .34, 1)' }
// Forwards holds the dialog hidden until close() removes it from the top layer.
const CLOSE_ANIMATION: KeyframeAnimationOptions = { duration: 260, easing: 'cubic-bezier(.32, .72, 0, 1)', fill: 'forwards' }
const SNAP_BACK_ANIMATION: KeyframeAnimationOptions = { duration: 260, easing: 'cubic-bezier(.33, 1, .68, 1)' }
const CARD_SHIFT_RATIO = 0.06
const SHEET_SHIFT_RATIO = 0.12

// Swipe-to-dismiss thresholds and resistance.
const DISMISS_DISTANCE_MIN_PX = 120
const DISMISS_DISTANCE_MAX_PX = 220
const DISMISS_DISTANCE_HEIGHT_RATIO = 0.22
const DISMISS_VELOCITY_THRESHOLD = 0.55
const DISMISS_MIN_DRAG_PX = 24
const DRAG_OPACITY_REDUCTION = 0.08
const RESISTANCE_START_PX = 360
const RESISTANCE_FACTOR = 0.35
const INTERACTIVE_TARGET_SELECTOR = 'a, button, input, textarea, select, option, [contenteditable="true"], [data-swipe-ignore], .action, #leftcolumn i'


class OverlayComponent extends HTMLElement {

	shadow = this.attachShadow({ mode: 'open' })
	private dialog!: HTMLDialogElement
	private opening_complete: Promise<void> | null = null
	private is_open = false
	private is_closing = false
	private swipe: SwipeState | null = null
	private header: any

	static get observedAttributes() { return ['close'] }

	connectedCallback() {
		// Unhandled Case: reconnecting the same instance tries to open it a second time.
		render(this.template(), this.shadow)
		this.dialog = this.shadow.querySelector<HTMLDialogElement>('dialog')!
		this.header = this.shadow.querySelector('c-header') as any;

		// Unhandled Case: removal before opening finishes makes showModal throw.
		this.opening_complete = this.open()
	}

	// Setting the close attribute closes the overlay just like calling close().
	attributeChangedCallback(_name: string, _old_value: string | null, new_value: string | null) {
		if (new_value === null) return
		void this.close()
	}

	async open() {
		this.header.SetTitle(this.title)
		this.header.SetLeftIcon(this.getAttribute('closebtn') === 'false' ? '' : 'x')
		this.header.addEventListener('leftclick', () => { void this.close() })

		await Promise.all([wait_for_stylesheets(this.shadow), wait_for_stylesheets(this.header.shadowRoot!)])

		this.dialog.showModal()
		// Focus the dialog rather than the first control, so an input doesn't grab focus while opening.
		this.dialog.focus({ preventScroll: true })
		await this.dialog.animate([
			{ translate: `0 ${get_animation_offset()}px`, opacity: 0 },
			{ translate: 'none', opacity: 1 },
		], BOTTOM_SHEET_LAYOUT.matches ? SHEET_OPEN_ANIMATION : CARD_OPEN_ANIMATION).finished

		this.is_open = true
		this.dispatchEvent(new Event('open'))
	}

	async close() {
		if (this.is_closing || !this.opening_complete) return
		this.is_closing = true

		// A close received mid-open lets the card land before animating it out.
		await this.opening_complete
		await this.animate_close(get_animation_offset())
	}


	// Start at the current visual position, including an active swipe or snap-back animation.
	private async animate_close(offset_px: number) {
		this.is_closing = true

		const { translate, opacity } = getComputedStyle(this.dialog)
		await this.dialog.animate([
			{ translate, opacity },
			{ translate: `0 ${offset_px}px`, opacity: 0 },
		], CLOSE_ANIMATION).finished

		this.is_open = false
		this.dialog.close()
		this.dispatchEvent(new Event('close'))
	}

	private handle_cancel(event: Event) {
		// Keep the dialog visible for the Escape close animation.
		// Unhandled Case: Chrome can make repeated cancel events non-cancelable without intervening
		// user interaction; the dialog then vanishes before our animation and close event finish.
		event.preventDefault()
		void this.close()
	}

	private handle_backdrop_click(event: MouseEvent) {
		// Children cover the card, so only backdrop clicks target the dialog itself.
		// Unhandled Case: pressing inside and releasing outside also targets the dialog and closes it.
		if (event.target !== this.dialog) return
		void this.close()
	}

	// Swipes start on the header or indicator, for touch/pen in the bottom-sheet layout only.
	private start_swipe(event: PointerEvent) {
		if (!this.is_open || this.is_closing || this.swipe) return
		if (event.pointerType === 'mouse' || !BOTTOM_SHEET_LAYOUT.matches) return
		if (event.composedPath().some(target => target instanceof Element && target.matches(INTERACTIVE_TARGET_SELECTOR))) return

		// Unhandled Case: grabbing during snap-back cancels it and jumps the card to rest.
		this.dialog.getAnimations().forEach(animation => animation.cancel())

		// Touch/pen implicitly capture the pressed element, keeping subsequent events bubbling here.
		this.swipe = {
			pointer_id: event.pointerId,
			start_y: event.clientY,
			last_y: event.clientY,
			last_time: event.timeStamp,
			velocity_y: 0,
			dismiss_distance: get_dismiss_distance(this.dialog),
		}
	}

	private move_swipe(event: PointerEvent) {
		const swipe = this.swipe
		if (!swipe || event.pointerId !== swipe.pointer_id) return

		swipe.velocity_y = (event.clientY - swipe.last_y) / Math.max(event.timeStamp - swipe.last_time, 1)
		swipe.last_y = event.clientY
		swipe.last_time = event.timeStamp

		const distance = Math.max(0, event.clientY - swipe.start_y)
		const progress = Math.min(distance / swipe.dismiss_distance, 1)
		this.dialog.style.translate = `0 ${apply_drag_resistance(distance)}px`
		this.dialog.style.opacity = String(1 - progress * DRAG_OPACITY_REDUCTION)
	}

	private end_swipe(event: PointerEvent) {
		const swipe = this.swipe
		if (!swipe || event.pointerId !== swipe.pointer_id) return
		this.swipe = null

		if (this.is_closing) return // The close button or Escape took over mid-swipe.

		const distance = Math.max(0, swipe.last_y - swipe.start_y)
		const is_flick = swipe.velocity_y > DISMISS_VELOCITY_THRESHOLD && distance > DISMISS_MIN_DRAG_PX
		if (event.type === 'pointerup' && (distance > swipe.dismiss_distance || is_flick)) {
			void this.animate_close(window.innerHeight)
			return
		}

		this.snap_back() // Short swipes and pointercancel return the card to rest.
	}

	private snap_back() {
		const { translate, opacity } = getComputedStyle(this.dialog)
		this.dialog.style.translate = ''
		this.dialog.style.opacity = ''
		this.dialog.animate([{ translate, opacity }, { translate: 'none', opacity: 1 }], SNAP_BACK_ANIMATION)
	}

	private template = () => html`{--css--}{--html--}`
}


function get_animation_offset() {
	return Math.ceil(window.innerHeight * (BOTTOM_SHEET_LAYOUT.matches ? SHEET_SHIFT_RATIO : CARD_SHIFT_RATIO))
}

function get_dismiss_distance(dialog: HTMLDialogElement) {
	return Math.min(DISMISS_DISTANCE_MAX_PX, Math.max(DISMISS_DISTANCE_MIN_PX, dialog.clientHeight * DISMISS_DISTANCE_HEIGHT_RATIO))
}

// Beyond the resistance threshold, the card follows the finger at a fraction of its speed.
function apply_drag_resistance(distance: number) {
	if (distance <= RESISTANCE_START_PX) return distance
	return RESISTANCE_START_PX + (distance - RESISTANCE_START_PX) * RESISTANCE_FACTOR
}

// Development uses links; production inlines styles, so there is nothing to wait for.
function wait_for_stylesheets(root: ShadowRoot) {
	const pending_links = Array.from(root.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
		.filter(link => !link.sheet)

	return Promise.all(pending_links.map(link => new Promise<void>(resolve => {
		link.addEventListener('load', () => resolve(), { once: true })
		// Unhandled Case: a failed stylesheet opens unstyled content rather than hanging.
		link.addEventListener('error', () => resolve(), { once: true })
	})))
}


customElements.define('c-ol2', OverlayComponent)

export { }
