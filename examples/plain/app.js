/** Consumer of the built bundle (make build). Browser events, prepared views and disposal are real, not mocked.
 * VERIFIED: renders, follows router links and Back/Forward in one document in Chromium, Firefox and WebKit
 * (Playwright check on 2026-10-06; not part of make verify). */
import { createRouter } from '../../dist/index.js';
const outlet = document.querySelector('#route-view');
const state = document.querySelector('#state');
const status = document.querySelector('#status');
const records = new Map([['42', 'Read the deep-link contract'], ['73', 'Ship the smallest useful package']]);
let renders = 0;
const text = (tag, value) => { const el = document.createElement(tag); el.textContent = value; return el; };
function report(result) { if (result.status === 'error' || result.status === 'rejected') status.textContent = result.error.message; return result; }
const router = createRouter({
  mode: 'hash', basePath: '/',
  routes: [{ id: 'home', path: '/' }, { id: 'project', path: '/projects/:id' }, { id: 'missing', path: '*' }],
  prepare({ to }) {
    const section = document.createElement('section');
    const events = new AbortController();
    let dirty = false;
    section.dataset.routeKey = `${to.routeId}:${to.path}`;
    section.append(text('h2', to.routeId === 'project' ? `Project ${to.params.id}` : to.routeId === 'home' ? 'Overview' : 'Not found'));
    if (to.routeId === 'project') {
      const original = records.get(to.params.id) ?? 'A project opened directly from its URL';
      const label = text('label', 'Edit this record (navigation asks before losing unsaved changes)');
      const input = document.createElement('input'); input.value = original; input.name = 'title';
      label.append(input); section.append(label);
      const note = text('p', 'Saved.'); const save = text('button', 'Save'); save.type = 'button';
      input.addEventListener('input', () => { dirty = input.value !== (records.get(to.params.id) ?? original); note.textContent = dirty ? 'Unsaved changes.' : 'Saved.'; }, { signal: events.signal });
      save.addEventListener('click', () => { records.set(to.params.id, input.value); dirty = false; note.textContent = 'Saved.'; }, { signal: events.signal });
      section.append(save, note);
      const anchor = document.createElement('a'); anchor.dataset.routerLink = ''; anchor.textContent = 'Open timeline, preserving duplicate filters';
      anchor.href = router.href({ id: 'project', params: { id: to.params.id }, query: [['tag', 'routing'], ['tag', 'desktop']], hash: 'event-7' });
      section.append(anchor);
      const event = text('h3', 'Event 7: route committed'); event.id = 'event-7'; section.append(event);
      section.append(text('p', 'The route anchor is restored after the prepared view is committed.'));
    } else {
      section.append(text('p', 'Open a project, edit its title, and navigate elsewhere. Cancel the leave dialog to keep the draft.'));
      section.append(text('p', 'Reload or paste a hash deep link: this example needs only an ordinary static file server.'));
    }
    section.append(text('p', `Render ${++renders}. Logical query: ${to.search || '(none)'}. Logical anchor: ${to.hash || '(none)'}.`));
    return {
      commit() { outlet.replaceChildren(section); },
      beforeLeave() { return !dirty || window.confirm('Discard the unsaved title?'); },
      dispose() { events.abort(); },
    };
  },
  afterCommit({ to, cause }) {
    document.title = `${to.routeId === 'project' ? 'Project ' + to.params.id : 'Overview'} · Defuss routing`;
    for (const link of document.querySelectorAll('nav a')) {
      const active = new URL(link.href).href === to.href;
      if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    }
    // Initial loading, query updates and anchors do not steal focus from an existing control.
    if (['link','programmatic','native'].includes(cause) && !to.hash) outlet.focus({ preventScroll: true });
  },
  onError(error) { status.textContent = `${error.code}: ${error.message}`; },
});
for (const link of document.querySelectorAll('nav a')) link.href = router.href(link.dataset.routeId === 'project'
  ? { id: 'project', params: { id: link.dataset.record } } : { id: 'home' });
router.attachLinks(document);
router.subscribe(snapshot => { state.textContent = JSON.stringify(snapshot, null, 2); });
document.querySelector('#back').addEventListener('click', () => history.back());
document.querySelector('#forward').addEventListener('click', () => history.forward());
document.querySelector('#rerender').addEventListener('click', () => { void router.render().then(report); });
document.querySelector('#replace').addEventListener('click', () => { void router.navigate(router.href({ id: 'home' }), { replace: true }).then(report); });
report(await router.start());
window.addEventListener('pagehide', event => {
  // A BFCache freeze is not teardown; listeners and the current DOM are retained for pageshow.
  if (!event.persisted) void router.destroy();
});
