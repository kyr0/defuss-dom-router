/** The website (docs/) in real browsers: the landing page, the resolve()/href() explorer and every playground route.
 * It serves docs/ as static files and loads defuss-shadcn from jsDelivr over the real network, as the published site
 * does; vendoring the CDN files would hide a broken pin or SRI hash.
 * HYPOTHESIS: an offline run fails (failed requests and console errors fail the engine) rather than passing;
 * falsified by a green run without network.
 * VERIFIED: it refuses to run while docs/assets/defuss-dom-router.js differs from dist/index.js.
 * Evidence: output/docs-browser.json and screenshots per engine. */
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { playwright } from './playwright.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const site = join(root, 'docs');
const output = join(root, 'output');
await mkdir(output, { recursive: true });
const [shipped, served] = await Promise.all([readFile(join(root, 'dist/index.js')), readFile(join(site, 'assets/defuss-dom-router.js'))]);
if (!shipped.equals(served)) {
  console.error('FAILED docs/assets/defuss-dom-router.js differs from dist/index.js; run make docs');
  process.exit(1);
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://site').pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = resolve(site, '.' + path);
  if (!file.startsWith(site + '/')) { res.writeHead(403); res.end(); return; }
  try {
    const body = await readFile(file);
    res.setHeader('content-type', TYPES[extname(file)] ?? 'application/octet-stream');
    res.end(body);
  } catch { res.writeHead(404); res.end('missing'); }
});
await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
const origin = `http://127.0.0.1:${server.address().port}`;

const assert = (condition, message) => { if (!condition) throw new Error(message); };
async function until(target, fn, arg, what) {
  try { await target.waitForFunction(fn, arg, { timeout: 15000 }); }
  catch { throw new Error(`Timed out waiting for ${what}`); }
}

/** The newest playground result row: status, cause, href and note. */
const latest = (frame) => frame.evaluate(() => {
  const row = document.querySelector('#log .pg-log-item');
  if (!row) return null;
  const [id, status, cause, href, note] = [...row.children].map((el) => el.textContent);
  return { id, status, cause, href, note };
});
const resultIs = (frame, status, what) => until(frame, (wanted) => document.querySelector('#log .pg-log-item')?.dataset.status === wanted, status, what);
async function expectLatest(frame, expected, what) {
  await resultIs(frame, expected.status, what);
  const row = await latest(frame);
  for (const [key, value] of Object.entries(expected)) assert(row[key] === value, `${what}: ${key} is ${JSON.stringify(row[key])}, expected ${JSON.stringify(value)}`);
}
const heading = (frame, text) => until(frame, (wanted) => document.querySelector('#outlet h1')?.textContent === wanted, text, `the heading "${text}"`);

async function landing(page, steps, report) {
  await page.goto(origin + '/', { waitUntil: 'networkidle' });
  await until(page, () => document.querySelector('#ex-result dl') && document.querySelector('#hb-out')?.textContent, null, 'the explorer');

  // resolve() explorer: the default URL, then an error example
  const first = await page.locator('#ex-result').innerText();
  assert(first.includes('"project"') && first.includes('[["tab","timeline"],["tab","files"]]'), 'explorer resolves the default URL');
  await page.click('.ddr-examples [data-href="https://evil.example/app/"]');
  await until(page, () => document.querySelector('#ex-result .alert')?.textContent.includes('outside-origin'), null, 'outside-origin in the explorer');
  await page.click('.ddr-examples [data-mode="hash"][data-href^="#/"]');
  await until(page, () => document.querySelector('#ex-result')?.textContent.includes('"/projects/42"') && document.querySelector('#ex-mode').value === 'hash', null, 'hash-mode resolution');
  const built = await page.locator('#hb-out').innerText();
  assert(built.includes('/app/#/projects/a%20b?tab=files&tab=timeline#event%207'), `href() builder output: ${built}`);
  await page.selectOption('#ex-mode', 'history');
  await until(page, () => document.querySelector('#hb-out')?.textContent.includes('/app/projects/a%20b?tab=files&tab=timeline#event%207'), null, 'history-mode href()');
  await page.selectOption('#hb-id', 'api');
  await until(page, () => document.getElementById('hb-params').value === '{"version":"2","wildcard":"users/7"}'
    && document.querySelector('#hb-out').textContent.includes('/app/api/v2/users/7?tab=files&tab=timeline#event%207'), null, 'href() for another route');
  await page.fill('#ex-base', 'app');
  await until(page, () => document.querySelector('#ex-result .alert')?.textContent.includes('invalid-route'), null, 'an invalid basePath');
  await page.fill('#ex-base', '/app');
  await until(page, () => document.querySelector('#ex-result dl'), null, 'the explorer again');
  steps.push('explorer');

  // API tabs
  await page.click('#tab-router');
  await until(page, () => !document.getElementById('api-router').hidden && document.querySelectorAll('#api-router tbody tr').length === 12, null, 'the method table');
  await page.click('#tab-types');
  await until(page, () => !document.getElementById('api-types').hidden && document.querySelectorAll('#api-types .ddr-type').length === 4, null, 'the type cards');
  await page.click('#tab-errors');
  await until(page, () => !document.getElementById('api-errors').hidden && document.querySelectorAll('#api-errors tbody tr').length === 16, null, 'the error code table');
  await page.click('#tab-config');
  await page.click('#api-config .accordion-item:nth-child(2) summary');
  await until(page, () => document.querySelectorAll('#api-config details[open]').length === 2, null, 'a second accordion item');
  steps.push('api tabs, accordion');

  // in-page navigation scrolls below the floating header and adds no history entry
  const before = await page.evaluate(() => history.length);
  await page.click('.mk-header-nav a[href="#install"]');
  await until(page, () => Math.abs(document.getElementById('install').getBoundingClientRect().top - 80) < 3, null, 'the install section under the header');
  assert(await page.evaluate(() => history.length) === before, 'section links must not push history entries');
  assert(page.url().endsWith('#install'), 'the address shows the section');
  steps.push('section links');

  // code block tabs and copy buttons
  const source = page.locator('.mk-code-block', { has: page.locator('input[name="cb-src"]') });
  await source.locator('label', { hasText: 'add' }).click();
  await until(page, () => getComputedStyle(document.querySelector('pre[data-tab="add"]')).display === 'block', null, 'the second code tab');
  await source.locator('.mk-code-block-copy').click();
  await until(page, () => [...document.querySelectorAll('.mk-code-block-status')].some((status) => status.textContent), null, 'the code copy status');
  report.copied = await page.evaluate(() => navigator.clipboard?.readText?.().catch(() => null) ?? null);
  // the defuss-vae install block under the prompt, and the CTA below the install panel
  const vae = page.locator('#vae-install');
  await vae.locator('.mk-code-block-copy').click();
  report.copiedVae = await page.evaluate(() => navigator.clipboard?.readText?.().catch(() => null) ?? null);
  await vae.locator('label', { hasText: 'Claude Code plugin' }).click();
  await until(page, () => getComputedStyle(document.querySelector('#vae-install pre[data-tab="claude"]')).display === 'block'
    && getComputedStyle(document.querySelector('#vae-install pre[data-tab="skills"]')).display === 'none', null, 'the Claude Code install tab');
  const ctaLinks = await page.$$eval('.ddr-consult .mk-cta-desc a', (links) => links.map((link) => link.getAttribute('href')));
  assert(JSON.stringify(ctaLinks) === JSON.stringify(['https://github.com/kyr0/defuss-vae', 'https://vae.defuss.org']), `the CTA text links: ${ctaLinks}`);
  assert(await page.getAttribute('.ddr-consult .btn', 'href') === 'https://www.linkedin.com/in/aronhomberg/', 'the CTA button goes to LinkedIn');
  await page.click('#copy-prompt');
  await until(page, () => document.getElementById('copy-prompt-status').textContent !== '', null, 'the prompt copy status');
  steps.push('code tabs, copy, defuss-vae install and CTA');

  // the theme switch repaints the page and the playground frame
  const dark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  await page.click('.swap');
  await until(page, (was) => {
    const frameDoc = document.querySelector('#playground iframe').contentDocument;
    return document.documentElement.classList.contains('dark') !== was && frameDoc.documentElement.classList.contains('dark') !== was;
  }, dark, 'the theme in page and frame');
  await page.click('.swap');
  steps.push('theme');
}

async function playground(page, steps) {
  await page.evaluate(() => document.getElementById('demo').scrollIntoView());
  const frame = page.frame({ url: /\/demo\// });
  assert(frame, 'the playground frame');
  await expectLatest(frame, { status: 'committed', cause: 'initial', href: '/' }, 'initial navigation');

  await frame.click('a[data-nav="project:42"]');
  await heading(frame, 'Deep-link contract');
  await expectLatest(frame, { status: 'committed', cause: 'link', href: '/projects/42' }, 'link click');
  assert(await frame.inputValue('#address') === '#/projects/42', 'the address bar follows');
  await frame.click('.pg-tabs a:text("Timeline")');
  await expectLatest(frame, { status: 'committed', href: '/projects/42?tab=timeline' }, 'query-only change');
  await frame.click('text=Jump to event 7');
  await expectLatest(frame, { status: 'committed', href: '/projects/42?tab=timeline#event-7' }, 'anchor-only change');
  await until(frame, () => Math.abs(document.getElementById('event-7').getBoundingClientRect().top - parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop)) < 4, null, 'the anchor at the top, under the address bar');
  steps.push('links, query, anchor');

  // The dialog is centred in the frame; keep the whole frame on screen, as a reader would, before answering it.
  await page.evaluate(() => document.getElementById('playground').scrollIntoView({ block: 'center' }));
  await frame.click('.pg-tabs a:text("Settings")');
  await frame.fill('#project-title', 'Renamed');
  await frame.click('a[data-nav="home"]');
  await until(frame, () => document.getElementById('leave-dialog').open, null, 'the beforeLeave dialog');
  await frame.click('#leave-stay');
  await expectLatest(frame, { status: 'blocked', note: 'before-write' }, 'beforeLeave veto');
  assert(await frame.inputValue('#address') === '#/projects/42?tab=settings', 'a veto leaves the URL');
  await frame.click('a[data-nav="home"]');
  await until(frame, () => document.getElementById('leave-dialog').open, null, 'the dialog again');
  await frame.click('#leave-discard');
  await heading(frame, 'Overview');
  steps.push('async beforeLeave');

  await frame.click('a[data-nav="admin"]');
  await expectLatest(frame, { status: 'blocked', note: 'before-write', href: '/admin' }, 'global guard');
  await frame.click('#act-race');
  await heading(frame, 'Smallest useful package');
  const rows = await frame.evaluate(() => [...document.querySelectorAll('#log .pg-log-item')].slice(0, 2).map((row) => [row.dataset.status, row.children[3].textContent]));
  assert(JSON.stringify(rows) === JSON.stringify([['committed', '/projects/73'], ['superseded', '/reports']]), `race results: ${JSON.stringify(rows)}`);
  await frame.click('#act-same');
  await expectLatest(frame, { status: 'unchanged', href: '/projects/73' }, 'same URL');
  steps.push('guard, superseded, unchanged');

  await frame.click('a[data-nav="broken"]');
  await expectLatest(frame, { status: 'error', note: 'prepare-error' }, 'prepare() throws');
  await until(frame, () => !document.getElementById('error').hidden
    && document.getElementById('error-title').textContent === 'prepare-error · navigation to /broken'
    && document.getElementById('error-text').textContent.includes('on purpose'), null, 'the error banner naming the deliberate failure');
  await heading(frame, 'Smallest useful package');
  await frame.click('#act-foreign');
  await expectLatest(frame, { status: 'rejected', note: 'outside-origin' }, 'foreign origin');
  assert(await frame.textContent('#error-title') === 'outside-origin', 'a rejected call names no route');
  await frame.click('#act-native');
  await heading(frame, 'A Back button that heals');
  await expectLatest(frame, { status: 'committed', cause: 'native', href: '/projects/7?tab=timeline' }, 'native link');
  await frame.click('#back');
  await heading(frame, 'Smallest useful package');
  steps.push('error, rejected, native');

  // A vetoed Back: the browser moves first, the router walks it back with history.go().
  await frame.check('#signed-in');
  await frame.click('a[data-nav="admin"]');
  await heading(frame, 'Admin');
  await frame.click('#outlet button:text("Sign out")');
  assert(!(await frame.isChecked('#signed-in')), 'Sign out turns the switch off');
  await frame.click('a[data-nav="home"]');
  await heading(frame, 'Overview');
  await frame.click('#back');
  await expectLatest(frame, { status: 'blocked', cause: 'traverse', note: 'owned-history-restored' }, 'vetoed Back');
  await until(frame, () => location.hash === '#/' && document.getElementById('address').value === '#/', null, 'the restored URL');
  await heading(frame, 'Overview');
  await frame.check('#signed-in');
  await frame.click('#back');
  await heading(frame, 'Admin');
  await frame.click('#back');
  await heading(frame, 'Smallest useful package');
  await expectLatest(frame, { status: 'committed', cause: 'traverse' }, 'Back');
  await frame.click('#forward');
  await heading(frame, 'Admin');
  await expectLatest(frame, { status: 'committed', cause: 'traverse', href: '/admin' }, 'Forward');
  await frame.click('#back');
  await heading(frame, 'Smallest useful package');
  steps.push('history.go correction, Back, Forward');

  await Promise.all([page.waitForEvent('framenavigated', (navigated) => navigated === frame), frame.click('#reload')]);
  await frame.waitForLoadState('load');
  await heading(frame, 'Smallest useful package');
  await expectLatest(frame, { status: 'committed', cause: 'initial', href: '/projects/73' }, 'reload keeps the deep link');
  await frame.fill('#address', '/docs/a/b/c');
  await frame.press('#address', 'Enter');
  await heading(frame, 'c');
  await frame.click('#outlet a:text("guards")');
  await heading(frame, 'guards');
  await expectLatest(frame, { status: 'committed', cause: 'link', href: '/docs/a/b/c/guards' }, 'wildcard link');
  steps.push('reload, address bar, wildcard');

  await frame.click('a[data-nav="projects"]');
  await heading(frame, 'Projects');
  assert(await frame.locator('.pg-project').count() === 3, 'three projects without a filter');
  await frame.click('.pg-chips a:text("router")');
  await until(frame, () => document.querySelectorAll('.pg-project').length === 2 && location.hash === '#/projects?tag=router', null, 'one tag filter');
  await frame.click('.pg-chips a:text("docs")');
  await until(frame, () => document.querySelectorAll('.pg-project').length === 1 && location.hash === '#/projects?tag=router&tag=docs', null, 'two tag filters in order');
  await expectLatest(frame, { status: 'committed', href: '/projects?tag=router&tag=docs' }, 'repeated query keys');
  await frame.click('a[data-nav="reports"]');
  await heading(frame, 'Reports');
  assert(await frame.locator('#outlet .statistic').count() === 4, 'the report counts');
  await frame.click('a[data-nav="missing"]');
  await heading(frame, 'Not found');
  await frame.fill('#address', '/projects/999');
  await frame.press('#address', 'Enter');
  await heading(frame, 'No project 999');
  steps.push('projects, filters, reports, 404, unknown record');

  await frame.click('#act-render');
  await expectLatest(frame, { status: 'committed', cause: 'render' }, 'render()');
  await frame.click('#act-replace');
  await heading(frame, 'Overview');
  await until(frame, () => document.querySelector('#snapshot [data-key="state"]').textContent === '{"via":"devtools"}', null, 'the replaced entry\'s state');
  await frame.check('#slow');
  await frame.click('a[data-nav="project:42"]');
  await until(frame, () => document.getElementById('phase').dataset.phase === 'preparing' && !document.getElementById('loading').hidden, null, 'the loading state');
  await heading(frame, 'Deep-link contract');
  await frame.uncheck('#slow');
  await frame.click('#log-clear');
  await until(frame, () => document.querySelectorAll('#log .pg-log-item').length === 0, null, 'an empty log');
  steps.push('render, replace with state, slow network, clear');

  await Promise.all([page.waitForEvent('framenavigated', (navigated) => navigated === frame), page.click('#playground-restart')]);
  await frame.waitForLoadState('load');
  await heading(frame, 'Overview');
  await expectLatest(frame, { status: 'committed', cause: 'initial', href: '/' }, 'restart');
  steps.push('restart');
}

async function deepLink(page, steps) {
  await page.goto(`${origin}/demo/#/projects/7?tab=timeline#event-3`, { waitUntil: 'networkidle' });
  await heading(page, 'A Back button that heals');
  await until(page, () => document.querySelector('.pg-tabs [aria-current="page"]')?.textContent === 'Timeline', null, 'the timeline tab');
  steps.push('deep link');
}

const engines = (process.env.ROUTER_BROWSERS ?? 'chromium').split(',');
const reports = [];
let failed = false;
const pw = playwright();
for (const engine of engines) {
  const report = { engine, status: 'passed', steps: [], errors: [] };
  let browser, page;
  try {
    const options = { headless: true };
    if (engine === 'chromium' && (process.env.CHROMIUM_PATH || existsSync('/usr/bin/chromium'))) options.executablePath = process.env.CHROMIUM_PATH || '/usr/bin/chromium';
    if (engine === 'chromium') options.args = ['--no-sandbox'];
    browser = await pw[engine].launch(options);
    report.version = browser.version();
    // Reduced motion: the landing page scrolls smoothly otherwise, and a click during a smooth scroll can land on the
    // floating header above the frame (observed in Firefox after the dialog restored focus). It also covers that path.
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    if (engine === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
    page = await context.newPage();
    page.on('console', (message) => { if (message.type() === 'error') report.errors.push(`console: ${message.text()}`); });
    page.on('pageerror', (error) => report.errors.push(`pageerror: ${error}`));
    page.on('requestfailed', (request) => report.errors.push(`requestfailed: ${request.url()}`));
    page.on('response', (response) => { if (response.status() >= 400) report.errors.push(`HTTP ${response.status()}: ${response.url()}`); });

    await landing(page, report.steps, report);
    if (engine === 'chromium') {
      assert(report.copied === 'bun add /path/to/defuss-dom-router', `the command reached the clipboard: ${report.copied}`);
      assert(report.copiedVae === "npx skills add kyr0/defuss-vae --skill '*'", `the defuss-vae command reached the clipboard: ${report.copiedVae}`);
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      assert(copied.startsWith('Integrate defuss-dom-router into this app'), 'the prompt reached the clipboard');
    }
    await page.screenshot({ path: join(output, `docs-${engine}-landing.png`) });
    await playground(page, report.steps);
    await page.screenshot({ path: join(output, `docs-${engine}-playground.png`) });
    await deepLink(page, report.steps);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(origin + '/', { waitUntil: 'networkidle' });
    const width = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    assert(width[0] <= width[1], `no horizontal scroll at 390 px: ${width}`);
    await page.screenshot({ path: join(output, `docs-${engine}-phone.png`) });
    await page.click('.mk-header-menu');
    await until(page, () => document.getElementById('ddr-menu').open, null, 'the menu sheet');
    await page.click('#ddr-menu a[href="#api"]');
    await until(page, () => !document.getElementById('ddr-menu').open && Math.abs(document.getElementById('api').getBoundingClientRect().top - 80) < 3, null, 'the API section from the menu');
    await page.click('.fab-trigger');
    await until(page, () => scrollY === 0, null, 'the scroll-top button');
    report.steps.push('phone width, menu, scroll-top');
    if (report.errors.length) throw new Error(report.errors.join('\n'));
  } catch (error) {
    failed = true;
    report.status = browser ? 'failed' : 'UNKNOWN';
    report.failure = String(error.message ?? error);
    // The playground's own record of what happened, for the failure report.
    const frame = browser && page?.frames().find((candidate) => /\/demo\//.test(candidate.url()));
    report.playground = await frame?.evaluate(() => ({
      url: location.href, heading: document.querySelector('#outlet h1')?.textContent,
      results: [...document.querySelectorAll('#log .pg-log-item')].slice(0, 6).map((row) => [...row.children].map((cell) => cell.textContent).join(' ').trim()),
    })).catch(() => undefined);
  } finally {
    await browser?.close();
  }
  reports.push(report);
  console.log(`${engine}: ${report.status.toUpperCase()} docs site (${report.steps.join(', ')})${report.failure ? `\n${report.failure}` : ''}`);
  if (report.playground) console.log(JSON.stringify(report.playground, null, 2));
}
await new Promise((done) => server.close(done));
await writeFile(join(output, 'docs-browser.json'), JSON.stringify({ recordedAt: new Date().toISOString(), origin: 'docs/ over HTTP, defuss-shadcn from jsDelivr', reports }, null, 2) + '\n');
if (failed) process.exitCode = 1;
