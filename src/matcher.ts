/** Matching retains the legacy first-registration precedence, not its literal exact prefilter. */
import { encoding, input } from './errors.js';
import type { RouteDefinition } from './types.js';
type Part = { literal: string } | { name: string; wildcard: boolean };
export interface CompiledRoute { definition: RouteDefinition; regexp: RegExp; parts: Part[]; names: string[] }
const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function compileRoutes(definitions: readonly RouteDefinition[]): readonly CompiledRoute[] {
  if (!Array.isArray(definitions)) return input('invalid-route', 'routes must be an array');
  const ids = new Set<string>(), patterns = new Set<string>();
  return definitions.map((definition) => {
    if (!definition || typeof definition.id !== 'string' || !definition.id || typeof definition.path !== 'string')
      return input('invalid-route', 'Each route needs a nonempty id and path');
    const authoredPath: string = definition.path;
    // oxlint-disable-next-line no-control-regex -- VERIFIED: patterns must not contain control characters (tests/router.test.mjs rejects '/x\ty' and '/x\u0000y')
    if (authoredPath !== '*' && (!authoredPath.startsWith('/') || authoredPath.startsWith('//')) || /[?#\\\x00-\x20\x7f]/u.test(authoredPath)) input('invalid-route', 'Invalid route pattern');
    if (authoredPath.split('/').some(s => ['.', '..'].includes(encoding(s)))) input('invalid-route', 'Patterns cannot contain dot segments');
    const path = authoredPath === '*' ? '*' : new URL('http://router.invalid' + authoredPath).pathname;
    // oxlint-disable-next-line no-control-regex -- patterns must not contain control characters
    if (path !== '*' && (!path.startsWith('/') || path.startsWith('//')) || /[?#\\\x00-\x20\x7f]/u.test(path))
      return input('invalid-route', 'Patterns are root-relative paths without query, hash or whitespace');
    encoding(path);
    const canonical = path === '/' ? path : path.replace(/\/$/, '');
    if (ids.has(definition.id) || patterns.has(canonical)) return input('invalid-route', 'Duplicate route id or pattern');
    ids.add(definition.id); patterns.add(canonical);
    const parts: Part[] = [], names: string[] = [];
    const rx = /:([A-Za-z0-9_]+)|\*/g;
    let at = 0, source = '', match: RegExpExecArray | null;
    while ((match = rx.exec(path))) {
      const literal = path.slice(at, match.index);
      if (literal.includes(':')) return input('invalid-route', 'A colon must introduce a named parameter');
      if (literal) parts.push({ literal });
      source += escaped(literal);
      const wildcard = match[0] === '*', name = wildcard ? 'wildcard' : match[1]!;
      if (names.includes(name)) return input('invalid-route', 'Duplicate parameter name');
      if (wildcard && (match.index !== path.length - 1 || (path !== '*' && path[match.index - 1] !== '/')))
        return input('invalid-route', 'A wildcard must be the final whole segment');
      names.push(name); parts.push({ name, wildcard });
      source += wildcard ? '(.*)' : '([^/]+)';
      at = match.index + match[0].length;
    }
    const tail = path.slice(at);
    if (tail.includes(':')) return input('invalid-route', 'A colon must introduce a named parameter');
    if (tail) parts.push({ literal: tail });
    source += escaped(tail);
    if (path !== '*') source = source.endsWith('/') ? source.slice(0, -1) + '/?' : source + '/?';
    return { definition: Object.freeze({ id: definition.id, path: authoredPath }), regexp: new RegExp(`^${source}$`), parts, names };
  });
}
export function matchPath(routes: readonly CompiledRoute[], path: string) {
  const params: Record<string, string> = Object.create(null);
  for (const route of routes) {
    const hit = route.regexp.exec(path);
    if (!hit) continue;
    route.names.forEach((name, index) => { params[name] = encoding(hit[index + 1]!); });
    return { match: true, routeId: route.definition.id, matchedRoute: route.definition.path, params: Object.freeze(params) };
  }
  return { match: false, routeId: null, matchedRoute: null, params: Object.freeze(params) };
}
export function buildPath(route: CompiledRoute, params: Readonly<Record<string, string>> = {}): string {
  if (!params || typeof params !== 'object' || Array.isArray(params)) input('invalid-route', 'Route params must be an object');
  for (const k of Object.keys(params)) if (!route.names.includes(k)) input('invalid-route', 'Unexpected named-route parameter');
  return route.parts.map(part => {
    if ('literal' in part) return part.literal;
    if (!Object.hasOwn(params, part.name) || typeof params[part.name] !== 'string')
      return input('invalid-route', 'Missing or non-string named-route parameter');
    const value = params[part.name]!;
    if (!value && !part.wildcard) return input('invalid-route', 'Named parameters must not be empty');
    const segments = part.wildcard ? value.split('/') : [value];
    if (segments.some(p => p === '.' || p === '..')) return input('invalid-route', 'Dot segments cannot be represented as route data in browser URLs');
    try { return segments.map(p => encodeURIComponent(p)).join('/'); }
    catch { return input('invalid-encoding', 'Invalid Unicode in a route parameter'); }
  }).join('');
}
