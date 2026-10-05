/** Native delegated click handling: never rewrite History prototypes or synthesize clicks. */
import type { Disposer, LinkOptions, RouteRequest } from './types.js';
export function bindLinks(root: Document | Element | ShadowRoot, resolve: (href: string) => RouteRequest,
  navigate: (href: string) => void, options: LinkOptions = {}): Disposer {
  const selector = options.selector ?? 'a[data-router-link]';
  root.querySelector(selector); // Validate before attaching; malformed selectors fail synchronously.
  const doc = root.nodeType === 9 ? root as Document : root.ownerDocument!;
  const click: EventListener = raw => {
    const e = raw as MouseEvent;
    if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    const path = e.composedPath();
    const elements = path.filter((n): n is Element => (n as Node).nodeType === 1);
    const link = elements.find(el => el.localName === 'a' && el.hasAttribute('href'));
    if (!link || !link.matches(selector) || link.hasAttribute('download') ||
      elements.some(el => el.hasAttribute('data-router-ignore')) || link.getAttribute('rel')?.split(/\s+/).includes('external')) return;
    const target = link.getAttribute('target') || doc.querySelector('base[target]')?.getAttribute('target') || '_self';
    if (target.toLowerCase() !== '_self') return;
    let href: string;
    try {
      const url = new URL(link.getAttribute('href')!, doc.baseURI);
      if (!['http:', 'https:'].includes(url.protocol)) return;
      href = url.href;
      if (!resolve(href).match) return;
    } catch { return; } // Ineligible input stays native; event dispatch must not throw.
    e.preventDefault(); navigate(href);
  };
  root.addEventListener('click', click);
  return () => root.removeEventListener('click', click);
}
