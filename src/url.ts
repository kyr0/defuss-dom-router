/** One physical URL produces every request field; hash mode adds an explicit logical URL. */
import { encoding, input } from './errors.js';
import { buildPath, matchPath, type CompiledRoute } from './matcher.js';
import type { HrefTarget, RouteRequest, RouterMode } from './types.js';
export function webUrl(href: string, base?: string): URL {
  // oxlint-disable-next-line no-control-regex -- VERIFIED: rejecting control characters is this check's purpose (tests/router.test.mjs rejects 'a\nb')
  if (typeof href !== 'string' || /[\x00-\x20\x7f\\]/u.test(href)) input('invalid-url', 'URL references must not contain whitespace, controls or backslashes');
  let url: URL;
  try { url = new URL(href, base); } catch { return input('invalid-url', 'A valid HTTP(S) URL or base is required'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    return input('invalid-url', 'Only credential-free HTTP(S) URLs are routable');
  encoding(url.pathname); encoding(url.search); encoding(url.hash);
  return url;
}
export function normalizedBase(base = '/'): string {
  if (typeof base !== 'string' || !base.startsWith('/') || base.startsWith('//') || /[?#]/u.test(base))
    return input('invalid-route', 'basePath must be an origin-rooted directory path');
  const url = webUrl(base, 'http://router.invalid/');
  if (url.pathname !== base) input('invalid-route', 'basePath must already be URL-normalized');
  return base.endsWith('/') ? base : base + '/';
}
export function withinBase(path: string, base: string): boolean {
  return base === '/' || path === base.slice(0, -1) || path.startsWith(base);
}
export class UrlSpace {
  constructor(readonly routes: readonly CompiledRoute[], readonly mode: RouterMode, readonly basePath: string, private readonly getBase: () => string) {}
  resolve(href: string, baseHref?: string): RouteRequest {
    const home = webUrl(this.getBase()), url = webUrl(href, baseHref ?? home.href);
    if (url.origin !== home.origin) input('outside-origin', 'Destination is outside the application origin');
    if (!withinBase(url.pathname, this.basePath)) input('outside-base', 'Destination is outside basePath');
    let logical: URL;
    if (this.mode === 'hash') {
      if (url.pathname !== home.pathname || url.search !== home.search)
        input('outside-shell', 'Hash routing cannot change the physical shell path or outer query');
      const fragment = url.hash.slice(1) || '/';
      if (!fragment.startsWith('/') || fragment.startsWith('//')) input('outside-shell', 'Hash routes must begin with #/');
      logical = webUrl(fragment, home.origin + '/');
    } else {
      const path = this.basePath === '/' ? url.pathname : url.pathname.slice(this.basePath.length - 1) || '/';
      logical = webUrl(url.origin + path + url.search + url.hash);
    }
    return Object.freeze({ ...matchPath(this.routes, logical.pathname), href: url.href, origin: url.origin, pathname: url.pathname,
      path: logical.pathname, search: logical.search, hash: logical.hash,
      query: Object.freeze(Array.from(logical.searchParams, pair => Object.freeze(pair) as readonly [string, string])) });
  }
  href(target: HrefTarget): string {
    if (!target || typeof target.id !== 'string') input('invalid-route', 'A named route id is required');
    const route = this.routes.find(r => r.definition.id === target.id);
    if (!route) return input('invalid-route', 'Unknown named route');
    let path = buildPath(route, target.params);
    if (!path.startsWith('/')) path = '/' + path;
    const query = new URLSearchParams();
    if (target.query !== undefined) {
      if (!Array.isArray(target.query)) input('invalid-url', 'query must be an ordered list of string pairs');
      for (const pair of target.query) {
        if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string' || typeof pair[1] !== 'string')
          input('invalid-url', 'query must contain string pairs');
        query.append(pair[0], pair[1]);
      }
    }
    if (target.hash !== undefined && typeof target.hash !== 'string') input('invalid-url', 'hash must be unencoded string data');
    let hash = '';
    try { if (target.hash) hash = '#' + encodeURIComponent(target.hash); }
    catch { input('invalid-encoding', 'Invalid Unicode in anchor'); }
    const search = query.size ? '?' + query.toString() : '';
    const home = webUrl(this.getBase());
    const href = this.mode === 'hash' ? home.pathname + home.search + '#' + path + search + hash
      : (this.basePath === '/' ? path : this.basePath.slice(0, -1) + path) + search + hash;
    this.resolve(href);
    return href;
  }
}
