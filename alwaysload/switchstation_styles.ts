type ShadowHostT = HTMLElement & { shadow:ShadowRoot }
type CoreSheetsWindowT = Window & { css_maincss?:CSSStyleSheet, css_instancemaincss?:CSSStyleSheet }




// For views and view parts. Dev ones link the core css and then their own css inside their shadow root, so they need
// nothing here. Dist ones inline only their own css as a <style>: it moves into a constructed sheet adopted after the
// core sheets, keeping the dev order (main.css, instance/main.css, own css). Adopted sheets always cascade after
// <style> elements, which is why the <style> has to move.
// lit-html does not track static template nodes, so the removed <style> is not re-added on later renders, and any
// later call finds nothing to do.
// Unhandled Case: a dev view whose html has its own top-level <style> is treated as dist, so its core css applies twice.
export function AdoptStylesheets(el:ShadowHostT) {
	// ":scope > style" never matches when queried from a ShadowRoot, so look through its direct children instead.
	const style = Array.from(el.shadow.children).find(child => child.tagName === "STYLE")
	if (!style) return

	const owncss = new CSSStyleSheet()
	owncss.replaceSync(style.textContent ?? "")
	style.remove()
	el.shadow.adoptedStyleSheets = [...el.shadow.adoptedStyleSheets, ...core_stylesheets(), owncss]
}




// The cold load page builds window.css_maincss and window.css_instancemaincss inline. The warm load page links
// main.css and instance/main.css on the document instead, so there the sheets are built from those links the first
// time a dist view needs them.
function core_stylesheets():CSSStyleSheet[] {
	const w = window as CoreSheetsWindowT
	if (!w.css_maincss) w.css_maincss = sheet_from_link("/assets/main.css")
	if (!w.css_instancemaincss) w.css_instancemaincss = sheet_from_link("/assets/instance/main.css")

	return [w.css_maincss, w.css_instancemaincss]
}




// Views only render after window load, so the linked sheet has loaded by then.
// Unhandled Case: relative url()s in the copied css resolve against the page instead of /assets/.
function sheet_from_link(href:string):CSSStyleSheet {
	const link = document.querySelector<HTMLLinkElement>(`link[href="${href}"]`)!
	const sheet = new CSSStyleSheet()
	sheet.replaceSync(Array.from(link.sheet!.cssRules, rule => rule.cssText).join("\n"))
	return sheet
}
