/** Opt-in shadcn consumer: reuse its callable df$, without a second engine installation. */
import { createRouter } from '../../dist/index.js';
try {
  await import('./vendor/shadcn/core.js');
  const df$ = globalThis.df$;
  if (typeof df$ !== 'function' || typeof df$.morph !== 'function') throw new Error('Shadcn core did not expose its documented runtime');
  const router = createRouter({ mode: 'hash', routes: [{ id: 'home', path: '/' }, { id: 'record', path: '/records/:id' }],
    prepare({ to }) {
      const section = document.createElement('section'); section.setAttribute('key', `${to.routeId}:${to.path}`);
      const heading = document.createElement('h2'); heading.textContent = to.routeId === 'record' ? `Record ${to.params.id}` : 'Persistent component shell';
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn'; button.textContent = 'Native button; route-managed view';
      section.append(heading, button);
      return { commit() { df$('#route-view').html(section.outerHTML); } };
    },
  });
  document.querySelector('#home').href = router.href({ id: 'home' });
  document.querySelector('#record').href = router.href({ id: 'record', params: { id: '73' } });
  router.attachLinks(document); await router.start();
  globalThis.exampleRouter = router;
} catch (error) { document.querySelector('#error').textContent = 'Run make examples before using this optional consumer. ' + String(error); }
