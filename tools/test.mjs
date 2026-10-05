/** Run test sources against the current build, with real subprocesses.
 * VERIFIED: test files import dist/ or the test-only tmp/units/ bundle, never src/, so they exercise built output. */
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const files=readdirSync('tests').filter(n=>n.endsWith('.test.mjs')).map(n=>'tests/'+n);
const run=spawnSync(process.execPath,['--test',...files],{stdio:'inherit'});if(run.error)throw run.error;process.exitCode=run.status??2;
