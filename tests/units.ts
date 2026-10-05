/** Test-only entry: internal modules for Node and blank-page browser unit tests. Never part of the package. */
export { BrowserHistory, readEntry, HISTORY_KEY } from '../src/history.ts';
export { bindLinks } from '../src/links.ts';
export { jsonState } from '../src/state.ts';
export { createRouter } from '../src/index.ts';
export { RouterInputError } from '../src/errors.ts';
