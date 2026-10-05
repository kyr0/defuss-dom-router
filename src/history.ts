/** Indexed metadata permits corrective traversal without truncating the forward stack. */
import { input } from './errors.js';
import { jsonState, isPlainRecord } from './state.js';
import type { JsonValue } from './types.js';
export const HISTORY_KEY = '__defuss_dom_router_v1';
const OWNER = Symbol.for('defuss-dom-router.owner.v1');
export interface Entry { library: 'defuss-dom-router'; version: 1; session: string; index: number; key: string; href: string; state: JsonValue; scroll: [number, number] }
function record(value: unknown): value is Record<string, unknown> {
  return isPlainRecord(value);
}
export function readEntry(raw: unknown, href: string): Entry | null {
  if (!record(raw) || !Object.hasOwn(raw, HISTORY_KEY)) return null;
  const m = raw[HISTORY_KEY];
  if (!record(m) || m.library !== 'defuss-dom-router' || m.version !== 1 || m.href !== href ||
      typeof m.session !== 'string' || !m.session || typeof m.key !== 'string' || !m.key ||
      typeof m.index !== 'number' || !Number.isSafeInteger(m.index) || m.index < 0 ||
      !Array.isArray(m.scroll) || m.scroll.length !== 2 || m.scroll.some(n => typeof n !== 'number' || !Number.isFinite(n))) return null;
  try { return { library: 'defuss-dom-router', version: 1, href, key: m.key, session: m.session, index: m.index, state: jsonState(m.state), scroll: [m.scroll[0] as number, m.scroll[1] as number] }; }
  catch { return null; }
}
export class BrowserHistory {
  current: Entry | null;
  readonly token = {};
  readonly scrolls = new Map<string, [number, number]>();
  private sequence = 0;
  private readonly seed: string;
  private originalScroll: ScrollRestoration;
  private correction: { key: string; href: string; done: (ok: boolean) => void; timer: ReturnType<typeof setTimeout> } | null = null;
  constructor(readonly win: Window, private readonly automaticScroll: boolean) {
    const w = win as Window & { [OWNER]?: object };
    if (w[OWNER] !== undefined) input('already-owned', 'This Window already has a running router');
    Object.defineProperty(w, OWNER, { configurable: true, value: this.token });
    this.seed = win.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    this.current = readEntry(win.history.state, win.location.href);
    this.originalScroll = win.history.scrollRestoration;
    if (automaticScroll) win.history.scrollRestoration = 'manual';
  }
  private key(): string { return `${this.seed}:${++this.sequence}`; }
  captureScroll(): void {
    if (this.automaticScroll && this.current?.href === this.win.location.href)
      this.scrolls.set(this.current.key, [this.win.scrollX, this.win.scrollY]);
  }
  write(href: string, state: JsonValue, replace: boolean): void {
    this.captureScroll();
    const raw: unknown = this.win.history.state;
    const currentPhysical = readEntry(raw, this.win.location.href);
    const canAdopt = raw == null || (record(raw) && (!Object.hasOwn(raw, HISTORY_KEY) || currentPhysical !== null));
    let next: Entry | null = null, value: unknown = raw;
    if (canAdopt) {
      // A pending traversal can be superseded before accept(). Branch/index writes must
      // follow the entry physically selected by the browser, not the last committed view.
      const previous = currentPhysical;
      // VERIFIED: an unowned predecessor breaks the index chain; a fresh session stops restore()
      // from computing go(delta) across it and landing on an unrelated entry (browser suite:
      // 'push after an unowned fragment entry starts a new session', fails with a shared session).
      next = { library: 'defuss-dom-router', version: 1, session: previous?.session ?? this.key(),
        index: replace ? (previous?.index ?? 0) : (previous ? previous.index + 1 : 0),
        key: replace && previous ? previous.key : this.key(), href, state,
        scroll: replace && previous ? (this.scrolls.get(previous.key) ?? previous.scroll) : [0, 0] };
      // A push does not mutate the outgoing entry. Save its scroll metadata first,
      // but only after guards/preparation have succeeded.
      if (!replace && currentPhysical && this.automaticScroll) {
        const saved = this.scrolls.get(currentPhysical.key);
        if (saved) this.win.history.replaceState({ ...(raw as object), [HISTORY_KEY]: { ...currentPhysical, scroll: saved } }, '', this.win.location.href);
      }
      value = { ...(record(raw) ? raw : {}), [HISTORY_KEY]: next };
    }
    this.win.history[replace ? 'replaceState' : 'pushState'](value, '', href);
    this.current = next;
  }
  accept(entry: Entry | null): void { this.current = entry; }
  /** Returns true only for the corrective event we were actually waiting for. */
  corrected(href: string, entry: Entry | null): boolean {
    const c = this.correction;
    if (!c || entry?.key !== c.key || href !== c.href) return false;
    clearTimeout(c.timer); this.correction = null; c.done(true); return true;
  }
  async restore(from: Entry | null, to: Entry | null): Promise<boolean> {
    if (!from || !to || from.session !== to.session || from.index === to.index) return false;
    if (this.correction) { clearTimeout(this.correction.timer); this.correction.done(false); this.correction = null; }
    return new Promise<boolean>((done) => {
      const timer = setTimeout(() => { this.correction = null; done(false); }, 3000);
      this.correction = { key: from.key, href: from.href, done, timer };
      try { this.win.history.go(from.index - to.index); }
      catch { clearTimeout(timer); this.correction = null; done(false); }
    });
  }
  release(): void {
    if (this.correction) { clearTimeout(this.correction.timer); this.correction.done(false); this.correction = null; }
    const w = this.win as Window & { [OWNER]?: object };
    if (w[OWNER] === this.token) {
      if (this.automaticScroll) this.win.history.scrollRestoration = this.originalScroll;
      delete w[OWNER];
    }
  }
}
