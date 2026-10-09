// Atlas: a small app routed by defuss-dom-router.
// VERIFIED: ../assets/defuss-dom-router.js is dist/index.js byte for byte (`make docs` copies it; tests/docs.test.mjs).
// VERIFIED: hash mode lets a static server answer deep links; tools/docs-browser.mjs opens one directly and reloads.
// History mode would give clean paths but needs a server that answers every path with this HTML.
// The devtools panel uses the public API only: subscribe(), a beforeEach guard, the callbacks and navigate() results.
import { createRouter } from '../assets/defuss-dom-router.js';
import { h } from '../assets/dom.js';

const $ = (id) => document.getElementById(id);
const outlet = $('outlet');

const link = (href, ...children) => h('a', { href, 'data-router-link': true }, ...children);
const wait = (ms, signal) => new Promise((resolve, reject) => {
  if (signal.aborted) return reject(signal.reason);
  const timer = setTimeout(resolve, ms);
  signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
});

// ---- app data -------------------------------------------------------------------------------------------------------
const projects = new Map([
  ['42', { name: 'Deep-link contract', status: 'In progress', progress: 64, tags: ['router', 'docs'],
    summary: 'Every screen of Atlas has a URL that survives a reload, a shared link and the Back button.' }],
  ['73', { name: 'Smallest useful package', status: 'In review', progress: 88, tags: ['build'],
    summary: 'One self-contained ESM file without runtime dependencies, usable with or without a bundler.' }],
  ['7', { name: 'A Back button that heals', status: 'Planned', progress: 12, tags: ['router', 'history'],
    summary: 'A vetoed Back or Forward is corrected with history.go() instead of truncating the forward stack.' }],
]);
const TAGS = ['router', 'docs', 'build', 'history'];
const drafts = new Map(); // project id → unsaved title; survives tab switches, which re-prepare the view
const prefs = { signedIn: false, slow: false };
let prepared = 0;

const router = createRouter({
  mode: 'hash',
  routes: [
    { id: 'home', path: '/' },
    { id: 'projects', path: '/projects' },
    { id: 'project', path: '/projects/:id' },
    { id: 'reports', path: '/reports' },
    { id: 'admin', path: '/admin' },
    { id: 'docs', path: '/docs/*' },
    { id: 'broken', path: '/broken' },
    { id: 'missing', path: '*' },
  ],
  // prepare() builds the next screen detached from the page; only commit() touches the live outlet.
  async prepare(ctx) {
    trace.note(ctx);
    if (prefs.slow) await wait(1200, ctx.signal);
    const view = views[ctx.to.routeId] ?? views.missing;
    return view(ctx);
  },
  afterCommit({ to, cause }) {
    document.title = `${titleOf(to)} · Atlas`;
    const key = to.routeId === 'project' ? `project:${to.params.id}` : to.routeId;
    for (const item of document.querySelectorAll('[data-nav]')) {
      if (item.dataset.nav === key) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    }
    showError(null);
    // Move focus only for in-app navigations: never on load, Back/Forward or render(), and never away from an anchor.
    if ((cause === 'link' || cause === 'programmatic') && !to.hash) outlet.querySelector('h1')?.focus({ preventScroll: true });
  },
  onError(error, snapshot) { showError(error, snapshot); },
});

const titleOf = (to) => ({
  home: 'Overview', projects: 'Projects', reports: 'Reports', admin: 'Admin', broken: 'Broken',
  project: `Project ${to.params.id}`, docs: `Docs · ${to.params.wildcard}`,
}[to.routeId] ?? 'Not found');

// ---- screens --------------------------------------------------------------------------------------------------------
function page(eyebrow, title, lead) {
  return h('section', { class: 'pg-page' },
    h('header', { class: 'pg-page-head' },
      h('p', { class: 'pg-eyebrow', text: eyebrow }),
      h('h1', { class: 'pg-title', tabindex: '-1', text: title }),
      lead && h('p', { class: 'pg-lead', text: lead })));
}
function footnote(section, { to, cause }) {
  section.append(h('p', { class: 'pg-footnote' },
    'Matched ', h('code', { text: to.matchedRoute ?? '(none)' }), ` · prepare() #${++prepared} · cause `, h('code', { text: cause })));
}
const screen = (section, extra) => ({ commit() { outlet.replaceChildren(section); }, ...extra });

const views = {
  home(ctx) {
    const section = page('Atlas', 'Overview', 'A tiny project tracker inside this frame. Every screen has a URL in the frame\'s real session history, so the Back and Forward buttons, a reload and a pasted link all work.');
    const steps = [
      ['Open a project and switch its tabs', router.href({ id: 'project', params: { id: '42' }, query: [['tab', 'timeline']] }),
        'A tab is a query parameter, so the view is prepared again. "Jump to event 7" only changes the anchor: no rendering, just scrolling.'],
      ['Edit a title, then leave the project', router.href({ id: 'project', params: { id: '73' }, query: [['tab', 'settings']] }),
        'beforeLeave asks in a dialog. Nothing is written to history until you answer.'],
      ['Open Reports, then another link at once', router.href({ id: 'reports' }),
        'Reports needs 1.5 s to prepare. A newer navigation abandons it before anything is shown: superseded.'],
      ['Visit Admin while signed out', router.href({ id: 'admin' }),
        'A global beforeEach guard returns false: blocked before-write, the URL never changes.'],
      ['Sign in, open Admin, leave, sign out, press Back', router.href({ id: 'admin' }),
        'The browser moves before any guard can run, so the router undoes it with history.go(): owned-history-restored.'],
      ['Open Broken', router.href({ id: 'broken' }),
        'prepare() throws. The result is an error and the current screen stays as it was.'],
    ];
    section.append(h('ol', { class: 'pg-tour' }, steps.map(([title, href, text], index) =>
      h('li', { class: 'pg-tour-item' },
        h('span', { class: 'pg-tour-n', 'aria-hidden': 'true', text: String(index + 1).padStart(2, '0') }),
        h('div', null, h('h2', { class: 'pg-tour-title' }, link(href, title)), h('p', { text }))))));
    section.append(h('div', { class: 'card pg-hint' },
      h('div', { class: 'card-content' },
        h('p', null, 'Or type into the address bar: ', h('code', { text: '/projects/7?tab=timeline#event-3' }), ', ',
          h('code', { text: '/docs/a/b/c' }), ' or ', h('code', { text: 'https://example.org/' }), '.'))));
    footnote(section, ctx);
    return screen(section);
  },

  projects(ctx) {
    const { to } = ctx;
    const active = to.query.filter(([key]) => key === 'tag').map(([, value]) => value);
    const section = page('Workspace', 'Projects', 'Filters are ordered, repeatable query pairs: ?tag=router&tag=docs keeps both values and their order.');
    const chips = h('nav', { class: 'pg-chips', 'aria-label': 'Filter by tag' }, TAGS.map((tag) => {
      const next = active.includes(tag) ? active.filter((t) => t !== tag) : [...active, tag];
      const chip = link(router.href({ id: 'projects', query: next.map((t) => ['tag', t]) }), tag);
      chip.className = 'pg-chip';
      if (active.includes(tag)) chip.setAttribute('aria-current', 'true');
      return chip;
    }));
    section.append(chips, h('p', { class: 'pg-mono' }, 'to.query = ', h('code', { text: JSON.stringify(to.query) })));
    const shown = [...projects].filter(([, p]) => active.every((tag) => p.tags.includes(tag)));
    section.append(shown.length
      ? h('ul', { class: 'pg-cards' }, shown.map(([id, p]) => h('li', { class: 'card pg-project' },
        h('div', { class: 'card-header' },
          h('h2', { class: 'card-title' }, link(router.href({ id: 'project', params: { id } }), p.name)),
          h('p', { class: 'card-description', text: `#${id} · ${p.status}` })),
        h('div', { class: 'card-content' }, h('p', { text: p.summary }),
          h('div', { class: 'pg-tags' }, p.tags.map((tag) => h('span', { class: 'badge', 'data-variant': 'secondary', text: tag })))))))
      : h('p', { class: 'pg-empty', text: 'No project carries all of these tags.' }));
    footnote(section, ctx);
    return screen(section);
  },

  project(ctx) {
    const { to } = ctx;
    const id = to.params.id;
    const project = projects.get(id);
    if (!project) {
      const section = page('Projects', `No project ${id}`, 'The route matched, the record does not exist. Route params are decoded once and shown as text.');
      section.append(h('p', null, link(router.href({ id: 'projects' }), 'Back to all projects')));
      footnote(section, ctx);
      return screen(section);
    }
    const tab = to.query.find(([key]) => key === 'tab')?.[1] ?? 'overview';
    const events = new AbortController();
    const section = page(`Project #${id}`, project.name, project.summary);
    const tabs = [['overview', 'Overview'], ['timeline', 'Timeline'], ['settings', 'Settings']];
    section.append(h('nav', { class: 'pg-tabs', 'aria-label': 'Project sections' }, tabs.map(([value, label]) => {
      const tabLink = link(router.href({ id: 'project', params: { id }, query: value === 'overview' ? [] : [['tab', value]] }), label);
      if (value === tab) tabLink.setAttribute('aria-current', 'page');
      return tabLink;
    })));

    if (tab === 'timeline') {
      const jump = link(router.href({ id: 'project', params: { id }, query: [['tab', 'timeline']], hash: 'event-7' }), 'Jump to event 7');
      jump.className = 'btn';
      jump.dataset.variant = 'outline';
      jump.dataset.size = 'sm';
      section.append(h('p', { class: 'pg-row' }, jump,
        h('span', { class: 'pg-muted', text: 'Only the anchor changes: the router skips prepare() and scrolls.' })));
      const items = ['Route table drafted', 'Hash mode added', 'Guards run before history writes', 'Blocked Back/Forward corrected',
        'Superseded intents abandoned', 'Commits serialized', 'Anchor scrolling after commit', 'Scroll restored on Back', 'Released 0.1.0'];
      section.append(h('ol', { class: 'pg-timeline' }, items.map((title, index) =>
        h('li', null, h('h3', { id: `event-${index + 1}`, text: `Event ${index + 1}: ${title}` }),
          h('p', { class: 'pg-muted', text: `${index + 1} day${index ? 's' : ''} after kickoff.` })))));
    } else if (tab === 'settings') {
      const field = h('input', { class: 'input', id: 'project-title', type: 'text', value: drafts.get(id) ?? project.name, autocomplete: 'off' });
      const status = h('p', { class: 'field-description', id: 'project-title-status', role: 'status' });
      const sync = () => {
        const dirty = drafts.has(id);
        status.textContent = dirty ? 'Unsaved changes: leaving this project asks first.' : 'Saved.';
        status.dataset.dirty = String(dirty);
      };
      field.addEventListener('input', () => {
        if (field.value === project.name) drafts.delete(id); else drafts.set(id, field.value);
        sync();
      }, { signal: events.signal });
      const save = h('button', { class: 'btn', type: 'submit', text: 'Save' });
      const reset = h('button', { class: 'btn', 'data-variant': 'outline', type: 'button', text: 'Reset' });
      reset.addEventListener('click', () => { field.value = project.name; drafts.delete(id); sync(); }, { signal: events.signal });
      const form = h('form', { class: 'form pg-form' },
        h('div', { class: 'form-field' }, h('label', { class: 'label', for: 'project-title', text: 'Project title' }), field, status),
        h('div', { class: 'form-actions' }, save, reset));
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        project.name = field.value.trim() || project.name;
        drafts.delete(id);
        section.querySelector('h1').textContent = project.name;
        sync();
      }, { signal: events.signal });
      sync();
      section.append(form, h('p', { class: 'pg-muted', text: 'Switching tabs keeps the draft: a query-only change prepares a new view, but beforeLeave only asks when the route or path changes.' }));
    } else {
      section.append(h('div', { class: 'pg-facts' },
        h('div', { class: 'progress-field' },
          h('div', { class: 'progress-header' }, h('span', { class: 'progress-label', id: 'p-label', text: 'Progress' }),
            h('span', { class: 'pg-mono', text: `${project.progress}%` })),
          h('progress', { class: 'progress', value: project.progress, max: 100, 'aria-labelledby': 'p-label' })),
        h('dl', { class: 'pg-dl pg-dl-inline' },
          h('div', null, h('dt', { text: 'Status' }), h('dd', { text: project.status })),
          h('div', null, h('dt', { text: 'Tags' }), h('dd', null, project.tags.map((tag) => {
            const chip = link(router.href({ id: 'projects', query: [['tag', tag]] }), tag);
            chip.className = 'pg-chip';
            return chip;
          }))))));
    }
    footnote(section, ctx);
    return screen(section, {
      async beforeLeave(leave) {
        trace.note(leave);
        if (!drafts.has(id)) return true;
        const discard = await confirmLeave(leave.signal);
        if (discard) drafts.delete(id);
        return discard;
      },
      dispose() { events.abort(); },
    });
  },

  async reports(ctx) {
    await wait(1500, ctx.signal); // a slow fetch; an AbortSignal cancels it when a newer navigation wins
    const section = page('Analytics', 'Reports', 'This screen took 1.5 s to prepare. Click another link during that time and this navigation ends as superseded: its view is never committed.');
    const counts = trace.counts();
    const rows = [['committed', 'Committed'], ['blocked', 'Blocked'], ['superseded', 'Superseded'], ['error', 'Failed']];
    section.append(h('p', { class: 'pg-muted', text: 'Results in the devtools log of this session, counted while this screen was prepared:' }),
      h('div', { class: 'pg-stats' }, rows.map(([status, label]) =>
        h('div', { class: 'statistic' }, h('p', { class: 'statistic-title', text: label }), h('p', { class: 'statistic-value', text: String(counts[status] ?? 0) })))));
    footnote(section, ctx);
    return screen(section);
  },

  admin(ctx) {
    const section = page('Restricted', 'Admin', 'You passed the global beforeEach guard. Sign out below, open another screen and press Back: the browser moves first, then the guard vetoes and the router walks history back with history.go().');
    const out = h('button', { class: 'btn', 'data-variant': 'outline', type: 'button', text: 'Sign out' });
    const events = new AbortController();
    out.addEventListener('click', () => { setSignedIn(false); out.disabled = true; out.textContent = 'Signed out'; }, { signal: events.signal });
    section.append(h('p', null, out));
    footnote(section, ctx);
    return screen(section, { dispose() { events.abort(); } });
  },

  docs(ctx) {
    const { to } = ctx;
    const parts = to.params.wildcard.split('/').filter(Boolean);
    const section = page('Docs', parts.at(-1) ?? 'Docs', 'One terminal /* wildcard matches any depth; its value arrives as params.wildcard.');
    section.append(h('nav', { class: 'pg-crumbs', 'aria-label': 'Breadcrumb' }, h('ol', null, parts.map((part, index) => {
      const target = router.href({ id: 'docs', params: { wildcard: parts.slice(0, index + 1).join('/') } });
      return h('li', null, index === parts.length - 1 ? h('span', { 'aria-current': 'page', text: part }) : link(target, part));
    }))));
    section.append(h('p', { class: 'pg-mono' }, 'to.params.wildcard = ', h('code', { text: JSON.stringify(to.params.wildcard) })));
    const deeper = ['hash-mode', 'guards', 'scroll'].map((leaf) =>
      h('li', null, link(router.href({ id: 'docs', params: { wildcard: [...parts, leaf].join('/') } }), leaf)));
    section.append(h('ul', { class: 'pg-links' }, deeper));
    footnote(section, ctx);
    return screen(section);
  },

  broken() {
    throw new Error('Atlas failed to load this screen'); // the router reports prepare-error with a fixed message
  },

  missing(ctx) {
    const section = page('404', 'Not found', 'No route matches this path, so the catch-all * route did. The address keeps the unknown path.');
    section.append(h('p', { class: 'pg-mono' }, 'to.path = ', h('code', { text: JSON.stringify(ctx.to.path) })),
      h('p', null, link(router.href({ id: 'home' }), 'Go to the overview')));
    footnote(section, ctx);
    return screen(section);
  },
};

// ---- async beforeLeave: an alert dialog the navigation awaits -------------------------------------------------------
// VERIFIED: guards run before any history write, so awaiting the answer leaves the URL untouched (the e2e checks the
// address after "Stay here"). window.confirm() would block the whole tab and could not be closed when Back supersedes.
function confirmLeave(signal) {
  const dialog = $('leave-dialog');
  return new Promise((resolve) => {
    const done = new AbortController();
    const finish = (answer) => {
      done.abort();
      if (dialog.open && dialog.api) dialog.api.setState('default');
      else if (dialog.open) dialog.close();
      resolve(answer);
    };
    $('leave-stay').addEventListener('click', () => finish(false), { signal: done.signal });
    $('leave-discard').addEventListener('click', () => finish(true), { signal: done.signal });
    dialog.addEventListener('close', () => finish(false), { signal: done.signal });
    // A newer navigation (Back, a link) supersedes this one: close the question it no longer needs.
    signal.addEventListener('abort', () => finish(false), { signal: done.signal });
    if (dialog.api) dialog.api.setState('open');
    else dialog.showModal();
  });
}

// ---- devtools: navigation results derived from snapshots, plus exact results from navigate() ------------------------
// VERIFIED: link clicks and Back/Forward start intents whose result promise stays inside the router (attachLinks and
// popstate call it with `void`), so the log derives their outcome from the snapshot sequence of each intentId:
// preparing → committing → idle is committed; preparing → idle is blocked; a newer preparing supersedes; idle with an
// unseen intentId is unchanged. navigate() and render() results overwrite the derived status.
const trace = (() => {
  const list = $('log');
  const entries = new Map();
  const FINAL = new Set(['committed', 'unchanged', 'blocked', 'superseded', 'rejected', 'error']);
  const TRAVERSALS = new Set(['traverse', 'hashchange']);
  const LIMIT = 60;
  let extra = 0;
  const routeOf = (request) => request ? `${request.path}${request.search}${request.hash}` : '';

  function paint(entry) {
    if (!entry.el) {
      entry.el = h('li', { class: 'pg-log-item' },
        h('span', { class: 'pg-log-id' }), h('span', { class: 'ddr-status' }), h('span', { class: 'pg-log-cause' }),
        h('code', { class: 'pg-log-href' }), h('span', { class: 'pg-log-note' }));
      list.prepend(entry.el);
      while (list.children.length > LIMIT) {
        const last = list.lastElementChild;
        for (const [key, value] of entries) if (value.el === last) entries.delete(key);
        last.remove();
      }
    }
    const [idEl, statusEl, causeEl, hrefEl, noteEl] = entry.el.children;
    idEl.textContent = typeof entry.id === 'number' ? `#${entry.id}` : '·';
    statusEl.textContent = entry.status;
    statusEl.dataset.status = entry.status;
    entry.el.dataset.status = entry.status;
    causeEl.textContent = entry.cause || '–';
    hrefEl.textContent = entry.href || '–';
    noteEl.textContent = entry.note;
    noteEl.hidden = !entry.note;
  }
  function put(id, patch, authoritative = false) {
    const entry = entries.get(id) ?? { id, status: 'preparing', cause: '', href: '', note: '', el: null };
    if (!authoritative && FINAL.has(entry.status) && patch.status) return entry;
    for (const [key, value] of Object.entries(patch)) if (value !== undefined && (value !== '' || key === 'note')) entry[key] = value;
    entries.set(id, entry);
    paint(entry);
    return entry;
  }
  return {
    /** Guards, beforeLeave and prepare() see the cause; the snapshot does not carry it. */
    note(ctx) {
      const entry = entries.get(ctx.intentId);
      if (entry && !entry.cause) put(ctx.intentId, { cause: ctx.cause });
    },
    observe(snapshot) {
      const id = snapshot.intentId;
      const entry = entries.get(id);
      if (snapshot.phase === 'preparing' && snapshot.pending) {
        // A newer intent started preparing: an older one still preparing was abandoned.
        for (const other of entries.values()) if (other.id !== id && other.status === 'preparing') put(other.id, { status: 'superseded', note: '' });
        put(id, { status: 'preparing', href: routeOf(snapshot.pending) });
      } else if (snapshot.phase === 'committing') {
        put(id, { status: 'committing', href: routeOf(snapshot.current) });
      } else if (snapshot.phase === 'idle') {
        if (!entry) put(id, { status: 'unchanged', href: routeOf(snapshot.current) });
        else if (entry.status === 'committing') put(id, { status: 'committed' });
        else if (entry.status === 'preparing') put(id, { status: 'blocked', note: TRAVERSALS.has(entry.cause) ? 'owned-history-restored' : 'before-write' });
      } else if (snapshot.phase === 'error' && snapshot.error) {
        if (entry && !FINAL.has(entry.status)) put(id, { status: 'error', note: snapshot.error.code });
        else put(`x${++extra}`, { status: 'rejected', cause: 'traverse', note: snapshot.error.code });
      }
    },
    /** navigate()/render() resolve to the exact result; it overrides what the snapshots suggested. */
    settle(result, href, cause) {
      const known = entries.get(result.intentId);
      put(result.intentId, {
        status: result.status, cause: known?.cause || cause, href: known?.href || href,
        note: result.status === 'blocked' ? result.veto : result.error?.code ?? '',
      }, true);
      return result;
    },
    counts() {
      const counts = {};
      for (const entry of entries.values()) counts[entry.status] = (counts[entry.status] ?? 0) + 1;
      return counts;
    },
    /** The logical route of an intent the log has seen, for messages about it. */
    routeOf(id) { return entries.get(id)?.href ?? ''; },
    clear() { entries.clear(); list.replaceChildren(); },
  };
})();

// ---- shell: snapshot inspector, loading bar, address bar, error banner ----------------------------------------------
const snapshotFields = Object.fromEntries([...document.querySelectorAll('#snapshot [data-key]')].map((el) => [el.dataset.key, el]));
const json = (value) => JSON.stringify(value);
function showSnapshot(snapshot) {
  const request = snapshot.pending ?? snapshot.current;
  const set = (key, value) => { snapshotFields[key].textContent = value; };
  set('phase', snapshot.phase);
  set('intentId', String(snapshot.intentId));
  set('routeId', request ? `${request.routeId ?? 'null'}${snapshot.pending ? ' (pending)' : ''}` : '–');
  set('params', request ? json(request.params) : '–');
  set('query', request ? json(request.query) : '–');
  set('hash', request ? json(request.hash) : '–');
  set('state', json(snapshot.state));
  set('history', `${snapshot.historyOwnership}${snapshot.entryKey ? ` · ${snapshot.entryKey.split(':').pop()}` : ''}`);
  const phase = $('phase');
  phase.textContent = snapshot.phase;
  phase.dataset.phase = snapshot.phase;
  $('loading').hidden = snapshot.phase !== 'preparing';
}
const address = $('address');
// The public API exposes no entry index; ARCH.md documents the record each owned entry carries.
// HYPOTHESIS: at index 0 a Back leaves the frame's session and moves the host page; falsified if browsers scoped the
// frame's history.back() to its own entries.
const HISTORY_KEY = '__defuss_dom_router_v1';
const syncAddress = () => {
  if (document.activeElement !== address) address.value = location.hash || '#/';
  $('back').disabled = !(history.state?.[HISTORY_KEY]?.index > 0);
};
$('address-shell').textContent = location.pathname.split('/').slice(-2).join('/') || '/';
// VERIFIED: a failed navigation publishes its error in the snapshot before onError runs (router.ts execute), so the
// snapshot's intentId names it; tools/docs-browser.mjs checks both the named and the unnamed banner.
// A rejected call (bad URL, foreign origin) reports a different error object and leaves the snapshot as it was, which
// may still hold an earlier failure: only the identical object proves the snapshot describes this error.
function showError(error, snapshot) {
  $('error').hidden = !error;
  if (!error) return;
  const route = snapshot?.error === error ? trace.routeOf(snapshot.intentId) : '';
  $('error-title').textContent = route ? `${error.code} · navigation to ${route}` : error.code;
  $('error-text').textContent = route === '/broken'
    ? `${error.message}. Atlas's Broken screen throws in prepare() on purpose: the router reports this fixed text, never the exception's own message, and the previous screen stays.`
    : error.message;
}

router.subscribe((snapshot) => {
  trace.observe(snapshot);
  showSnapshot(snapshot);
  syncAddress();
});
// Registered first, so it sees every intent that reaches the global guards. Returning nothing allows the navigation.
router.beforeEach((ctx) => { trace.note(ctx); });
// Only an exact false blocks.
router.beforeEach(({ to }) => to.routeId !== 'admin' || prefs.signedIn);
router.attachLinks(document);

// The URL bar changes on Back/Forward before the router decides; show it, including a vetoed traversal's correction.
addEventListener('popstate', syncAddress);
addEventListener('hashchange', syncAddress);

const run = async (href, cause, start) => trace.settle(await start(), href, cause);
const go = (href, options) => run(href.replace(/^[^#]*#/, ''), 'programmatic', () => router.navigate(href, options));

$('address-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const typed = address.value.trim();
  // '/projects/7' is the route path; '#/projects/7' and full URLs are taken as they are.
  const href = typed.startsWith('/') ? `#${typed}` : typed;
  address.blur();
  void run(typed, 'programmatic', () => router.navigate(href));
});
address.addEventListener('keydown', (event) => { if (event.key === 'Escape') { address.blur(); syncAddress(); } });
address.addEventListener('blur', () => setTimeout(syncAddress, 0));
$('back').addEventListener('click', () => history.back());
$('forward').addEventListener('click', () => history.forward());
$('reload').addEventListener('click', () => location.reload());
$('error-dismiss').addEventListener('click', () => showError(null));
$('log-clear').addEventListener('click', () => trace.clear());

const signedIn = $('signed-in');
function setSignedIn(value) { prefs.signedIn = value; signedIn.checked = value; }
signedIn.addEventListener('change', () => { prefs.signedIn = signedIn.checked; });
$('slow').addEventListener('change', (event) => { prefs.slow = event.target.checked; });

$('act-race').addEventListener('click', () => {
  void go(router.href({ id: 'reports' }));
  setTimeout(() => void go(router.href({ id: 'project', params: { id: '73' } })), 200);
});
$('act-render').addEventListener('click', () => {
  void run(location.hash.slice(1) || '/', 'render', () => router.render());
});
$('act-replace').addEventListener('click', () => void go(router.href({ id: 'home' }), { replace: true, state: { via: 'devtools' } }));
$('act-same').addEventListener('click', () => void go(location.href));
// A native shell (a desktop or mobile wrapper) delivers links as absolute HTTP(S) URLs on the app origin.
$('act-native').addEventListener('click', () => {
  const href = new URL(router.href({ id: 'project', params: { id: '7' }, query: [['tab', 'timeline']] }), location.href).href;
  void run(href.replace(/^[^#]*#/, ''), 'native', () => router.navigate(href, { cause: 'native' }));
});
$('act-foreign').addEventListener('click', () => void run('https://example.org/', 'programmatic', () => router.navigate('https://example.org/')));

const initial = await router.start();
if (initial.status !== 'committed') showError(initial.error ?? { code: initial.status, message: 'The initial navigation did not commit' }, router.getSnapshot());
addEventListener('pagehide', (event) => {
  // A back/forward-cache freeze is not teardown: listeners and the current DOM stay for pageshow.
  if (!event.persisted) void router.destroy();
});
