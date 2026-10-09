// The landing page script. index.html loads defuss-shadcn (df$) from jsDelivr first; this module wires the page and runs
// the resolve()/href() explorer on the shipped bundle.
// VERIFIED: ./defuss-dom-router.js is dist/index.js byte for byte (tests/docs.test.mjs), so the page shows what ships.
import { createRouter } from './defuss-dom-router.js';
import { h } from './dom.js';

const $ = (id) => document.getElementById(id);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

// ---- theme: this page and the playground frame follow one switch ----------------------------------------------------
// VERIFIED: the frame is same-origin, so the page repaints its root directly; tools/docs-browser.mjs checks both roots.
// A postMessage protocol would also work across origins, which this site does not need.
const themeToggle = $('theme-toggle');
const frame = document.querySelector('#playground iframe');
const paint = (doc, dark) => {
  doc.documentElement.classList.toggle('dark', dark);
  doc.documentElement.style.colorScheme = dark ? 'dark' : 'light';
};
const frameDocument = () => { try { return frame.contentDocument; } catch { return null; } };
function setTheme(dark) {
  paint(document, dark);
  const doc = frameDocument();
  if (doc?.documentElement) paint(doc, dark);
  themeToggle.checked = dark;
  try { localStorage.setItem('defuss-shadcn-theme', JSON.stringify(dark ? 'dark' : 'light')); } catch {}
}
themeToggle.checked = document.documentElement.classList.contains('dark');
themeToggle.addEventListener('change', () => setTheme(themeToggle.checked));
frame.addEventListener('load', () => {
  const doc = frameDocument();
  if (doc?.documentElement) paint(doc, document.documentElement.classList.contains('dark'));
});
$('playground-restart').addEventListener('click', () => {
  // replace(): restarting the demo must not add an entry to the shared session history
  frame.contentWindow?.location.replace(frame.src);
});

// ---- in-page links scroll without adding history entries ------------------------------------------------------------
// VERIFIED: section links add no entry (tools/docs-browser.mjs compares history.length).
// HYPOTHESIS: native fragment links would push entries into the tab's joint session history, between the playground's
// own, so its Back button would move this page first; falsified if the frame's history.back() skipped those entries.
document.addEventListener('click', (event) => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const anchor = event.target.closest('a[href^="#"]');
  let id = '';
  try { id = anchor ? decodeURIComponent(anchor.hash.slice(1)) : ''; } catch { return; }
  const target = id && document.getElementById(id);
  if (!target) return;
  event.preventDefault();
  // VERIFIED: scrollIntoView() measured the transformed box of a section still in its scroll-driven reveal and landed
  // 62 px off; layout offsets ignore transforms, and tools/docs-browser.mjs asserts the section lands at its margin.
  let top = 0;
  for (let node = target; node; node = node.offsetParent) top += node.offsetTop;
  scrollTo({ top: top - parseFloat(getComputedStyle(target).scrollMarginTop || '0'), behavior: reducedMotion.matches ? 'auto' : 'smooth' });
  history.replaceState(history.state, '', anchor.hash);
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
});

// ---- copy buttons ---------------------------------------------------------------------------------------------------
async function copyText(text, status, label) {
  try {
    await navigator.clipboard.writeText(text);
    status.textContent = 'Copied';
  } catch {
    status.textContent = 'Copy failed';
  }
  if (!label) return;
  label.textContent = status.textContent;
  setTimeout(() => { label.textContent = 'Copy prompt'; }, 2000);
}
for (const button of document.querySelectorAll('.mk-code-block-copy')) {
  button.addEventListener('click', () => {
    const block = button.closest('.mk-code-block');
    const tab = block.querySelector('.mk-code-block-tabs input:checked')?.value;
    const pre = tab ? block.querySelector(`pre[data-tab="${tab}"]`) : block.querySelector('pre');
    const lines = [...pre.querySelectorAll('code > span')].map((line) => line.textContent);
    void copyText(lines.join('\n'), block.querySelector('.mk-code-block-status'));
  });
}
$('copy-prompt').addEventListener('click', () => void copyText(
  [...document.querySelectorAll('#agent-prompt pre:not([data-tone]) code')].map((code) => code.textContent).join('\n'),
  $('copy-prompt-status'), $('copy-prompt').querySelector('span')));

// ---- resolve() and href() explorer: a router that is never started owns no Window and no history ---------------------
// VERIFIED: createRouter() attaches nothing until start() (README; ARCH.md), so this page can resolve URLs while the
// playground's router owns the frame. Rebuilding on every settings change is cheap: patterns compile once per router.
const ROUTES = [
  { id: 'home', path: '/' },
  { id: 'project', path: '/projects/:id' },
  { id: 'file', path: '/files/:name.json' },
  { id: 'api', path: '/api/v:version/*' },
  { id: 'docs', path: '/docs/*' },
  { id: 'missing', path: '*' },
];
const PARAMS = {
  project: { id: 'a b' }, file: { name: 'report' }, api: { version: '2', wildcard: 'users/7' }, docs: { wildcard: 'guides/intro' }, home: {},
};
const configText = Object.fromEntries([...document.querySelectorAll('[data-config]')].map((el) => [el.dataset.config, el]));
let explorer = null;
let buildError = null;

function build() {
  const mode = $('ex-mode').value;
  const basePath = $('ex-base').value.trim();
  const baseUrl = `https://example.com${basePath.endsWith('/') ? basePath : `${basePath}/`}`;
  configText.mode.textContent = `'${mode}'`;
  configText.basePath.textContent = `'${basePath}'`;
  configText.baseUrl.textContent = `'${baseUrl}'`;
  try {
    explorer = createRouter({ routes: ROUTES, mode, basePath, baseUrl });
    buildError = null;
  } catch (error) {
    explorer = null;
    buildError = error;
  }
}

const errorAlert = (error, where) => h('div', { class: 'alert', 'data-variant': 'destructive', role: 'alert' },
  h('div', { class: 'alert-content' },
    h('h5', { class: 'alert-title', text: `${where} threw RouterInputError · ${error.code ?? error.name}` }),
    h('p', { class: 'alert-description', text: error.message })));

function showResolve() {
  const out = $('ex-result');
  const href = $('ex-href').value;
  if (!explorer) { out.replaceChildren(errorAlert(buildError, 'createRouter()')); return; }
  let request;
  try { request = explorer.resolve(href); } catch (error) { out.replaceChildren(errorAlert(error, 'resolve()')); return; }
  const rows = [
    ['match', String(request.match), String(request.match)],
    ['routeId', JSON.stringify(request.routeId)],
    ['matchedRoute', JSON.stringify(request.matchedRoute)],
    ['params', JSON.stringify(request.params)],
    ['query', JSON.stringify(request.query)],
    ['path', JSON.stringify(request.path)],
    ['search', JSON.stringify(request.search)],
    ['hash', JSON.stringify(request.hash)],
    ['pathname', JSON.stringify(request.pathname)],
    ['href', JSON.stringify(request.href)],
  ];
  out.replaceChildren(
    h('p', { class: 'ddr-result-head' }, 'A frozen ', h('code', { text: 'RouteRequest' }), ' for ', h('code', { text: JSON.stringify(href) })),
    h('dl', { class: 'ddr-dl' }, rows.map(([key, value, kind]) =>
      h('div', null, h('dt', null, h('code', { text: key })), h('dd', { 'data-kind': kind, text: value })))));
}

function showHref() {
  const out = $('hb-out');
  const id = $('hb-id').value;
  let params, query;
  try {
    params = JSON.parse($('hb-params').value || '{}');
    query = JSON.parse($('hb-query').value || '[]');
  } catch {
    out.dataset.error = '';
    out.replaceChildren(h('span', { class: 'ddr-out-label', text: 'Not valid JSON' }), 'params is an object of strings, query a list of [key, value] pairs.');
    return;
  }
  const hash = $('hb-hash').value;
  const target = { id };
  if (params && Object.keys(params).length) target.params = params;
  if (Array.isArray(query) ? query.length : query != null) target.query = query;
  if (hash) target.hash = hash;
  const call = `router.href(${JSON.stringify(target)})`;
  if (!explorer) { out.dataset.error = ''; out.replaceChildren(h('span', { class: 'ddr-out-label', text: call }), buildError.message); return; }
  try {
    const href = explorer.href(target);
    delete out.dataset.error;
    out.replaceChildren(h('span', { class: 'ddr-out-label', text: call }), href);
  } catch (error) {
    out.dataset.error = '';
    out.replaceChildren(h('span', { class: 'ddr-out-label', text: `${call} threw ${error.code ?? error.name}` }), error.message);
  }
}

const refresh = () => { build(); showResolve(); showHref(); };
$('ex-mode').addEventListener('change', refresh);
$('ex-base').addEventListener('input', refresh);
$('ex-form').addEventListener('submit', (event) => { event.preventDefault(); showResolve(); });
$('ex-href').addEventListener('input', showResolve);
for (const button of document.querySelectorAll('.ddr-examples [data-href]')) {
  button.addEventListener('click', () => {
    if ($('ex-mode').value !== button.dataset.mode) { $('ex-mode').value = button.dataset.mode; build(); showHref(); }
    $('ex-href').value = button.dataset.href;
    showResolve();
  });
}
$('hb-id').addEventListener('change', () => { $('hb-params').value = JSON.stringify(PARAMS[$('hb-id').value]); showHref(); });
for (const id of ['hb-params', 'hb-query', 'hb-hash']) $(id).addEventListener('input', showHref);
$('hb-form').addEventListener('submit', (event) => { event.preventDefault(); showHref(); });
refresh();
