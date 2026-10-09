/** A tiny DOM builder shared by the landing page and the playground.
 * VERIFIED: route params (typed into the playground's address bar) and explorer input are visitor-controlled, so this
 * builder only creates elements, attributes and text nodes. Template strings through innerHTML would be shorter, but
 * every interpolation would then be an HTML sink to escape by hand. */

/** h('a', { class, text, href, 'data-x': true }, ...children): null/false props and children are skipped,
 * `true` sets an empty attribute, strings become text nodes. */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) if (child != null && child !== false) el.append(child);
  return el;
}
