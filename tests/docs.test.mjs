/** The website (docs/) against the build: it serves a copy of dist/index.js and documents the API in dist/index.d.ts.
 * Browser behaviour of the site is tools/docs-browser.mjs (make e2e). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFile(root + path);
const text = async (path) => (await read(path)).toString('utf8');
const declarations = await text('dist/index.d.ts');
const page = await text('docs/index.html');
const block = (name) => {
  const start = declarations.indexOf(`interface ${name} `);
  assert.ok(start >= 0, `dist/index.d.ts declares ${name}`);
  return declarations.slice(start, declarations.indexOf('\n}', start));
};
const union = (name) => [...declarations.match(new RegExp(`type ${name} = ([^;]+);`))[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
const missing = (names, render = (name) => `<code>${name}`) => names.filter((name) => !page.includes(render(name)));

test('the site serves the shipped bundle byte for byte (make docs refreshes it)', async () => {
  const [shipped, served] = await Promise.all([read('dist/index.js'), read('docs/assets/defuss-dom-router.js')]);
  assert.ok(shipped.equals(served), 'docs/assets/defuss-dom-router.js is stale: run make docs');
});

test('the API reference names every Router method and createRouter option', () => {
  const methods = [...block('Router').matchAll(/^\s{4}(\w+)\(/gm)].map((m) => m[1]);
  assert.ok(methods.length >= 12);
  assert.deepEqual(missing(methods), [], 'document these Router methods in docs/index.html');
  const options = [...block('RouterConfig').matchAll(/^\s{4}readonly (\w+)\??:/gm), ...block('RouterCallbacks').matchAll(/^\s{4}(\w+)\??:/gm)].map((m) => m[1]);
  assert.ok(options.length >= 9);
  assert.deepEqual(missing(options), [], 'document these options in docs/index.html');
});

test('the API reference explains every result status, cause and error code', () => {
  const statuses = [...declarations.matchAll(/readonly status: '([^']+)'/g)].map((m) => m[1]);
  assert.equal(statuses.length, 6);
  assert.deepEqual(missing(statuses, (status) => `data-status="${status}">${status}<`), [], 'give these statuses an outcome card');
  assert.deepEqual(missing(union('NavigationCause')), [], 'name these causes in docs/index.html');
  const codes = union('RouterErrorCode');
  assert.ok(codes.length >= 16);
  assert.deepEqual(missing(codes, (code) => `<td class="table-cell"><code>${code}</code></td>`), [], 'add these codes to the error table');
});

// docs/index.html is the authoritative text; the README repeats its load-bearing claims and must not drift from them.
test('the README repeats the page\'s outcome descriptions, feature claims and sizes', async () => {
  const readme = (await text('README.md')).replace(/[`*_]/g, '');
  const plain = (fragment) => fragment.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').trim();
  const outcomes = [...page.matchAll(/data-status="\w+">\w+<\/span><p>(.*?)<\/p>/gs)].map((m) => plain(m[1]));
  assert.equal(outcomes.length, 6);
  assert.deepEqual(outcomes.filter((sentence) => !readme.includes(sentence)), [], 'copy these outcome descriptions from docs/index.html into README.md');
  const sizes = [...page.matchAll(/<span class="mk-stat-value">(.*?)<\/span>/gs)].map((m) => plain(m[1]).split(' ')[0]).filter((v) => v.includes(','));
  assert.ok(sizes.length >= 1);
  assert.deepEqual(sizes.filter((size) => !readme.includes(size)), [], 'the README sizes differ from the page');
});
