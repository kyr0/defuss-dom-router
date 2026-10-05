/** Resolve the installed Playwright distribution; Python's package bundles the same Node driver. */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
export function playwright() {
  try { return require('playwright'); }
  catch (first) {
    if (process.env.PLAYWRIGHT_MODULE) return require(process.env.PLAYWRIGHT_MODULE);
    try {
      const path = execFileSync('python3', ['-c', 'import pathlib,playwright;print(pathlib.Path(playwright.__file__).parent/"driver"/"package")'], { encoding: 'utf8' }).trim();
      return require(path);
    } catch { throw new Error('Install Playwright with make setup; no browser tests were run.', { cause: first }); }
  }
}
