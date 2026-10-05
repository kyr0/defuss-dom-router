/** Navigation owns intent ordering, not rendering. Preparation cancels; commits serialize.
 * UNKNOWN: an application callback that never settles cannot be forcefully terminated.
 */
import { RouterInputError, diagnostic, encoding, input } from './errors.js';
import { BrowserHistory, readEntry, type Entry } from './history.js';
import { bindLinks } from './links.js';
import { compileRoutes } from './matcher.js';
import { jsonState, sameState } from './state.js';
import { normalizedBase, UrlSpace } from './url.js';
import type { Disposer, JsonValue, NavigationCause, NavigationContext, NavigationGuard, NavigationResult, NavigateOptions,
  PreparedView, RouteRequest, Router, RouterCallbacks, RouterConfig, RouterError, RouterSnapshot } from './types.js';
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
interface Operation {
  id: number; to: RouteRequest; state: JsonValue; cause: NavigationCause; replace: boolean;
  traversal?: { entry: Entry | null }; controller: AbortController; locked: boolean; commitStarted: boolean;
  done: boolean; resolve: (result: NavigationResult) => void; promise: Promise<NavigationResult>;
}
export function createRouter(config: RouterConfig): Router {
  if (!config || typeof config !== 'object' || Array.isArray(config)) input('invalid-route', 'Router configuration is required');
  config = { ...config }; // Caller mutations cannot silently change structural configuration.
  const routes = compileRoutes(config.routes), mode = config.mode ?? 'history';
  if (mode !== 'history' && mode !== 'hash') input('invalid-route', 'Unknown routing mode');
  if (config.scroll !== undefined && !['auto', 'manual'].includes(config.scroll)) input('invalid-route', 'Unknown scrolling policy');
  const basePath = normalizedBase(config.basePath);
  let callbacks: RouterCallbacks = {};
  let win: Window | undefined, history: BrowserHistory | undefined, initialBase: string | undefined;
  let started = false, dead = false, sequence = 0, active: Operation | null = null, queued: Operation | null = null;
  let view: PreparedView | null = null, destroyPromise: Promise<void> | undefined;
  const listeners = new Set<(snapshot: RouterSnapshot) => void>(), guards = new Set<NavigationGuard>(), disposers = new Set<Disposer>();
  const initial = deferred<NavigationResult>();
  let initialSettled = false;
  let snapshot: RouterSnapshot = Object.freeze({ phase: 'idle', current: null, pending: null, intentId: 0,
    entryKey: null, historyOwnership: 'unowned', state: null, error: null });
  const environment = (): Window | undefined => config.window ?? (typeof window === 'undefined' ? undefined : window);
  const base = (): string => snapshot.current?.href ?? initialBase ?? config.baseUrl ?? environment()?.location.href
    ?? input('invalid-url', 'Provide baseUrl when resolving without a Window');
  // The logical resolver shares no mutable navigation state; this callback only supplies its base.
  const space = new UrlSpace(routes, mode, basePath, base);
  function report(error: RouterError): void { try { callbacks.onError?.(error, snapshot); } catch { /* Error handlers must not break settlement. */ } }
  function publish(update: Partial<RouterSnapshot>): void {
    snapshot = Object.freeze({ ...snapshot, ...update });
    for (const listener of Array.from(listeners)) {
      try { listener(snapshot); } catch { report(diagnostic(null, 'effect-error')); }
    }
  }
  function finishInitial(result: NavigationResult) { if (!initialSettled) { initialSettled = true; initial.resolve(result); } }
  function settle(op: Operation, result: NavigationResult): void { if (!op.done) { op.done = true; op.resolve(Object.freeze(result)); } }
  const current = (op: Operation): boolean => active === op && !op.controller.signal.aborted && !dead;
  async function dispose(v: PreparedView | null | undefined): Promise<void> {
    if (!v?.dispose) return;
    try { await v.dispose(); } catch { report(diagnostic(null, 'effect-error')); }
  }
  function advance(op: Operation): void {
    if (active !== op) return;
    active = null;
    if (queued && !dead) { const next = queued; queued = null; active = next; void execute(next); }
  }
  async function effects(ctx: NavigationContext, op: Operation, after?: RouterCallbacks['afterCommit']): Promise<void> {
    if (dead) return;
    await after?.(ctx);
    if (dead || config.scroll === 'manual' || !win || ctx.cause === 'render') return;
    if (op.traversal?.entry) {
      const p = history?.scrolls.get(op.traversal.entry.key) ?? op.traversal.entry.scroll;
      win.scrollTo(p[0], p[1]);
    } else if (ctx.to.hash) {
      const el = win.document.getElementById(encoding(ctx.to.hash.slice(1)));
      el?.scrollIntoView();
    } else if (ctx.from && ctx.from.path !== ctx.to.path) win.scrollTo(0, 0);
  }
  async function rejectTraversal(op: Operation): Promise<boolean> {
    if (!op.traversal) return true;
    op.locked = true; // Corrective traversal is not abortable once history.go has started.
    const restored = await history!.restore(history!.current, op.traversal.entry);
    if (!restored && !dead) {
      history!.accept(null);
      publish({ historyOwnership: 'unowned', entryKey: null });
    }
    return restored;
  }
  async function execute(op: Operation): Promise<void> {
    let prepared: PreparedView | null = null, assigned = false;
    const from = snapshot.current;
    const ctx: NavigationContext = Object.freeze({ to: op.to, from, cause: op.cause, intentId: op.id, signal: op.controller.signal, state: op.state });
    const cb = { ...callbacks };
    let stage: 'guard-error' | 'prepare-error' | 'history-error' | 'commit-error' | 'effect-error' = 'guard-error';
    try {
      if (!current(op)) return;
      if (from?.href === op.to.href && sameState(snapshot.state, op.state) && !op.traversal && !['initial', 'render'].includes(op.cause) && snapshot.phase !== 'error') {
        publish({ phase: 'idle', pending: null, intentId: op.id, error: null });
        settle(op, { status: 'unchanged', intentId: op.id, request: from }); return;
      }
      publish({ phase: 'preparing', pending: op.to, intentId: op.id, error: null });
      if (!current(op)) return; // Subscribers may synchronously replace this navigation.
      if (op.cause !== 'render') {
        const chain = Array.from(guards);
        if (view?.beforeLeave && from && (from.routeId !== op.to.routeId || from.path !== op.to.path)) chain.unshift(view.beforeLeave);
        for (const guard of chain) {
          const allowed = await guard(ctx);
          if (!current(op)) return;
          if (allowed === false) {
            const restored = await rejectTraversal(op);
            if (dead) return;
            if (!restored) throw new RouterInputError('unowned-history', 'Blocked traversal could not be restored; the browser URL changed, but protected content was not committed');
            publish({ phase: 'idle', pending: null, error: null });
            settle(op, { status: 'blocked', intentId: op.id, request: op.to, veto: op.traversal ? 'owned-history-restored' : 'before-write' }); return;
          }
        }
      }
      if (!current(op)) return;
      const anchorOnly = op.cause !== 'render' && from && from.path === op.to.path && from.search === op.to.search && sameState(snapshot.state, op.state);
      stage = 'prepare-error';
      if (!anchorOnly) {
        prepared = cb.prepare ? await cb.prepare(ctx) : { commit() {} };
        if (!prepared || typeof prepared.commit !== 'function') input('prepare-error', 'prepare() must return a view with commit()');
      }
      if (!current(op)) return;
      op.locked = true;
      stage = 'history-error';
      if (op.traversal) history!.accept(op.traversal.entry);
      else if (op.cause !== 'render') history!.write(op.to.href, op.state, op.replace);
      op.commitStarted = true;
      publish({ phase: 'committing', current: op.to, pending: null, state: op.state,
        entryKey: history!.current?.key ?? null, historyOwnership: history!.current ? 'owned' : 'unowned' });
      if (prepared) {
        stage = 'commit-error';
        const previous = view;
        view = null;
        try { await prepared.commit(); view = prepared; assigned = true; }
        finally { await dispose(previous); }
      }
      stage = 'effect-error';
      await effects(ctx, op, cb.afterCommit);
      if (dead) settle(op, { status: 'rejected', intentId: op.id, error: diagnostic(new RouterInputError('destroyed', 'Router was destroyed'), 'destroyed') });
      else {
        publish({ phase: 'idle', pending: null, error: null });
        settle(op, { status: 'committed', intentId: op.id, request: op.to });
      }
    } catch (error) {
      if (current(op) || op.locked && !dead) {
        let failure = diagnostic(error, stage);
        // Failed pre-commit traversal must not leave the URL changed silently.
        if (op.traversal && !op.commitStarted && failure.code !== 'unowned-history') {
          if (!await rejectTraversal(op)) failure = diagnostic(new RouterInputError('unowned-history', 'Traversal failed and cannot be restored; application recovery is required'), 'unowned-history');
        }
        if (!dead) { publish({ phase: 'error', pending: null, error: failure }); report(failure); }
        settle(op, { status: 'error', intentId: op.id, error: failure, commitStarted: op.commitStarted });
      }
    } finally {
      if (prepared && !assigned) await dispose(prepared);
      if (!op.done) settle(op, { status: 'superseded', intentId: op.id });
      advance(op);
    }
  }
  function rejected(code: Parameters<typeof input>[0], message: string): Promise<NavigationResult> {
    const error = diagnostic(new RouterInputError(code, message), code);
    const result: NavigationResult = Object.freeze({ status: 'rejected', intentId: ++sequence, error }); report(error);
    return Promise.resolve(result);
  }
  function submit(href: string, options: NavigateOptions, cause: NavigationCause, traversal?: { entry: Entry | null }): Promise<NavigationResult> {
    if (dead) return rejected('destroyed', 'Router was destroyed');
    if (!started) return rejected('not-started', 'Call start() before navigating');
    let to: RouteRequest, state: JsonValue;
    try {
      if (!options || typeof options !== 'object' || Array.isArray(options) ||
        Object.keys(options).some(k => !['replace','state','cause'].includes(k)) ||
        options.replace !== undefined && typeof options.replace !== 'boolean' ||
        options.cause !== undefined && !['programmatic','native'].includes(options.cause))
        input('invalid-route', 'Invalid navigation options');
      to = space.resolve(href);
      state = Object.hasOwn(options, 'state') ? jsonState(options.state)
        : traversal ? traversal.entry?.state ?? null
        : snapshot.current?.href === to.href ? snapshot.state
        : cause === 'initial' ? history!.current?.state ?? null : null;
    } catch (error) {
      const failure = diagnostic(error, 'invalid-url'); report(failure);
      return Promise.resolve({ status: 'rejected', intentId: ++sequence, error: failure });
    }
    const result = deferred<NavigationResult>();
    const op: Operation = { id: ++sequence, to, state, cause, replace: options.replace ?? false, traversal,
      controller: new AbortController(), locked: false, commitStarted: false, done: false, ...result };
    if (active?.locked) {
      if (queued) { queued.controller.abort(); settle(queued, { status: 'superseded', intentId: queued.id }); }
      queued = op;
    } else {
      if (active) { active.controller.abort(); settle(active, { status: 'superseded', intentId: active.id }); }
      active = op; void execute(op);
    }
    return result.promise;
  }
  function changed(event: Event): void {
    if (dead || !history || !win) return;
    const href = win.location.href, entry = readEntry(win.history.state, href);
    if (history.corrected(href, entry)) return;
    if (snapshot.current?.href === href && snapshot.entryKey === (entry?.key ?? null) && sameState(snapshot.state, entry?.state ?? null)) return;
    // Both popstate and hashchange may describe the same traversal.
    if (active?.traversal && active.to.href === href && active.traversal.entry?.key === entry?.key) return;
    void submit(href, {}, event.type === 'popstate' ? 'traverse' : 'hashchange', { entry }).then(result => {
      if (result.status === 'rejected' && !dead && win?.location.href === href) {
        history?.accept(null);
        publish({ phase: 'error', pending: null, entryKey: null, historyOwnership: 'unowned', error: result.error });
      }
    });
  }
  const api: Router = {
    start(initialHref) {
      if (started || initialSettled) return initial.promise;
      if (dead) { const r = rejected('destroyed', 'Router was destroyed'); void r.then(finishInitial); return r; }
      try {
        win = environment();
        if (!win) input('not-started', 'A real Window is required to start browser routing');
        initialBase = config.baseUrl ?? win.location.href;
        // Resolve before taking ownership so invalid initial configuration does not leak it.
        const to = space.resolve(initialHref ?? win.location.href);
        if (to.origin !== win.location.origin) input('outside-origin', 'Configured base is not the Window origin');
        history = new BrowserHistory(win, config.scroll !== 'manual');
        started = true;
        for (const name of ['popstate', 'hashchange']) { win.addEventListener(name, changed); disposers.add(() => win!.removeEventListener(name, changed)); }
        const scroll = () => history!.captureScroll();
        win.addEventListener('scroll', scroll, { passive: true }); disposers.add(() => win!.removeEventListener('scroll', scroll));
        void submit(to.href, { replace: true }, 'initial').then(finishInitial);
      } catch (error) {
        history?.release();
        const failure = diagnostic(error, 'not-started'); report(failure);
        finishInitial({ status: 'rejected', intentId: ++sequence, error: failure });
      }
      return initial.promise;
    },
    ready: () => initial.promise,
    resolve: (href, baseHref) => space.resolve(href, baseHref),
    href: target => space.href(target),
    navigate: (href, options = {}) => submit(href, options, options?.cause ?? 'programmatic'),
    getSnapshot: () => snapshot,
    subscribe(listener) { if (dead) input('destroyed', 'Router was destroyed'); if (typeof listener !== 'function') input('invalid-route', 'subscribe requires a function'); listeners.add(listener); return () => { listeners.delete(listener); }; },
    beforeEach(guard) { if (dead) input('destroyed', 'Router was destroyed'); if (typeof guard !== 'function') input('invalid-route', 'beforeEach requires a function'); guards.add(guard); return () => { guards.delete(guard); }; },
    attachLinks(root, options) {
      if (dead) input('destroyed', 'Router was destroyed');
      // VERIFIED: before start() a link stays native; preventing it would swallow the click as a not-started
      // rejection (browser suite: 'links attached before start stay native', fails without this check).
      const eligible = (href: string) => started ? space.resolve(href) : input('not-started', 'Links are native until start()');
      const detach = bindLinks(root, eligible, href => { void submit(href, {}, 'link'); }, options);
      const dispose = () => { detach(); disposers.delete(dispose); }; disposers.add(dispose); return dispose;
    },
    config(next) {
      if (dead) input('destroyed', 'Router was destroyed');
      if (!next || typeof next !== 'object' || Array.isArray(next)) input('invalid-route', 'Callbacks must be an object');
      for (const [key, value] of Object.entries(next)) if (!['prepare', 'afterCommit', 'onError'].includes(key) || value !== undefined && typeof value !== 'function')
        input('invalid-route', 'config() accepts callback functions only');
      callbacks = { ...callbacks, ...next };
    },
    render() {
      if (dead) return rejected('destroyed', 'Router was destroyed');
      if (!snapshot.current) return rejected('not-started', 'The initial view has not committed');
      return submit(snapshot.current.href, { state: snapshot.state }, 'render');
    },
    destroy() {
      if (destroyPromise) return destroyPromise;
      dead = true;
      for (const detach of Array.from(disposers)) detach(); disposers.clear(); history?.release(); guards.clear();
      if (queued) { queued.controller.abort(); settle(queued, { status: 'rejected', intentId: queued.id, error: { code: 'destroyed', message: 'Router was destroyed' } }); queued = null; }
      const running = active;
      if (running && !running.locked) { running.controller.abort(); settle(running, { status: 'superseded', intentId: running.id }); }
      finishInitial({ status: 'rejected', intentId: sequence, error: { code: 'destroyed', message: 'Router was destroyed' } });
      publish({ phase: 'destroyed', pending: null }); listeners.clear();
      destroyPromise = (async () => {
        if (running?.locked) await running.promise;
        const previous = view; view = null; await dispose(previous);
      })();
      return destroyPromise;
    },
  };
  api.config({ prepare: config.prepare, afterCommit: config.afterCommit, onError: config.onError });
  return api;
}
