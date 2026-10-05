/** Real optional peer consumer. No substitute renderer and no CDN at runtime. */
import { createRouter } from '../../dist/index.js';
const output = document.querySelector('#route-view');
try {
  const morphModule = await import('./vendor/morph.js');
  const { df$ } = await import('./vendor/query.js');
  const direct = new URL(location.href).searchParams.get('renderer') === 'morph';
  const router = createRouter({ mode: 'hash', routes: [{ id: 'home', path: '/' }, { id: 'record', path: '/records/:id' }],
    prepare({ to }) {
      // Construct untrusted text with a DOM node, then pass serialized markup, not an unsupported Element, to html()/morph().
      const section = document.createElement('section'); section.setAttribute('key', `${to.routeId}:${to.path}`);
      const h = document.createElement('h2'); h.textContent = to.routeId === 'record' ? `Record ${to.params.id}` : 'Injected renderer';
      section.append(h);
      const p = document.createElement('p'); p.textContent = direct ? 'Rendering through the actual morph export.' : 'Rendering through the actual standalone df$.html().'; section.append(p);
      const label = document.createElement('label'); label.textContent = 'Uncontrolled form value survives same-record morphs';
      const input = document.createElement('input'); input.name = 'draft'; label.append(input); section.append(label);
      return { async commit() {
        const options = { transition: { type: 'fade', duration: 120, target: 'self' } };
        if (direct) await morphModule.morph(output, section.outerHTML, options);
        else await df$(output).html(section.outerHTML, options);
      } };
    },
  });
  document.querySelector('#home').href = router.href({ id: 'home' });
  document.querySelector('#record').href = router.href({ id: 'record', params: { id: '42' } });
  router.attachLinks(document);
  await router.start();
  globalThis.exampleRouter = router; // Explicit example-only inspection handle, not a library import side effect.
} catch (error) {
  document.querySelector('#error').textContent = 'Optional assets are unavailable or incompatible. Run make examples. ' + String(error);
}
