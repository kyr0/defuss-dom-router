/** Line coverage of the shipped bundle dist/index.js: Node test V8 coverage merged with Chromium e2e V8 coverage.
 * WHY merged: the navigation coordinator needs a real browser Window (no fakes), so Node alone cannot reach it;
 * the e2e suite runs the same bundle file in Chromium. Not measured: other engines, tools, Python.
 */
import { readdirSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const THRESHOLD = 60, bundle = 'dist/index.js', source = readFileSync(bundle, 'utf8');
const nodeDir = 'tmp/v8-node', browserFile = 'output/browser-coverage-chromium.json';

/** Per-line covered/uncovered from V8 block ranges; nested ranges are applied after their parents and override them. */
function lineCoverage(functions) {
  const counts = new Uint32Array(source.length);
  const ranges = functions.flatMap(f => f.ranges).sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);
  for (const r of ranges) counts.fill(r.count, r.startOffset, Math.min(r.endOffset, source.length));
  const lines = []; let offset = 0;
  for (const text of source.split('\n')) {
    const code = [...text].map((ch, i) => /\S/.test(ch) ? counts[offset + i] : null).filter(c => c !== null);
    lines.push(code.length ? code.some(c => c > 0) : null); // null: blank line, not executable
    offset += text.length + 1;
  }
  return lines;
}
const merge = (sets) => sets[0].map((_, i) => sets.some(s => s[i] === true) ? true : sets[0][i] === null ? null : false);
const percent = lines => { const exec = lines.filter(l => l !== null); return Math.round(10000 * exec.filter(Boolean).length / exec.length) / 100; };

rmSync(nodeDir, { recursive: true, force: true });
const files = readdirSync('tests').filter(n => n.endsWith('.test.mjs')).map(n => 'tests/' + n);
const run = spawnSync(process.execPath, ['--test', ...files], { encoding: 'utf8', env: { ...process.env, NODE_V8_COVERAGE: nodeDir }, maxBuffer: 20 * 1024 * 1024 });
if (run.error) throw run.error;
mkdirSync('output', { recursive: true }); writeFileSync('output/coverage.log', run.stdout + run.stderr);
if (run.status !== 0) { process.stdout.write(run.stdout + run.stderr); console.error('Node tests failed; coverage not computed'); process.exit(1); }
const url = pathToFileURL(join(process.cwd(), bundle)).href;
const nodeFunctions = readdirSync(nodeDir).flatMap(f => JSON.parse(readFileSync(join(nodeDir, f), 'utf8')).result).filter(s => s.url === url).flatMap(s => s.functions);

// The e2e run serves a copy of this exact file; rerun Chromium when its recorded coverage is for a different build.
// Each test runs in its own document, so Chromium reports one script entry per page load; their lines are unioned.
const browserEntries = () => existsSync(browserFile) ? JSON.parse(readFileSync(browserFile, 'utf8')).filter(e => e.url.endsWith('/router/index.js') && e.source === source) : [];
if (!browserEntries().length) {
  const e2e = spawnSync(process.execPath, ['tools/browser.mjs'], { stdio: 'inherit', env: { ...process.env, ROUTER_BROWSERS: 'chromium' } });
  if (e2e.status !== 0 || !browserEntries().length) { console.error('UNKNOWN: Chromium coverage of the current bundle unavailable'); process.exit(2); }
}
const node = lineCoverage(nodeFunctions), browser = merge(browserEntries().map(e => lineCoverage(e.functions))), total = percent(merge([node, browser]));
const coverage = { schema: 1, recordedAt: new Date().toISOString(), file: bundle, scope: 'Line coverage of dist/index.js: Node test V8 merged with Chromium e2e V8; not Firefox/WebKit, tools or Python', node: percent(node), chromium: percent(browser), lines: total, threshold: THRESHOLD };
writeFileSync('output/coverage.json', JSON.stringify(coverage, null, 2) + '\n');
console.log(`Node ${coverage.node}%  Chromium ${coverage.chromium}%  merged ${total}%`);
console.log(`TOTAL ${total}%`);
process.exitCode = total >= THRESHOLD ? 0 : 1;
