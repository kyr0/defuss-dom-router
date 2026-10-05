/** End-to-end npm payload consumer. Real pack, isolated extraction and actual exports; no install/network. */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const require=createRequire(import.meta.url);
let consumer, evidence;
function node(code) { return execFileSync(process.execPath,['--input-type=module','-e',code],{cwd:consumer,encoding:'utf8',env:{...process.env,NODE_PATH:''}}); }
before(async()=>{
 consumer=await mkdtemp(join(tmpdir(),'defuss-isolated-consumer-'));
 await mkdir(join(consumer,'node_modules'));
 await writeFile(join(consumer,'package.json'),' {"private":true,"type":"module"}\n');
 const filename=execFileSync('bun',['pm','pack','--quiet','--ignore-scripts','--destination',consumer],{cwd:root,encoding:'utf8'}).trim().split('\n').at(-1);
 const tar=join(consumer,filename.split('/').at(-1));
 execFileSync('python3',[join(root,'tools/unpack_tar.py'),tar,join(consumer,'node_modules/defuss-dom-router')]);
 const listing=execFileSync('tar',['-tzf',tar],{encoding:'utf8'}).trim().split('\n').sort();
 evidence={name:'defuss-dom-router',filename:filename.split('/').at(-1),files:listing,sha256:createHash('sha256').update(await readFile(tar)).digest('hex')};
});
after(async()=>{
 await mkdir(join(root,'output'),{recursive:true});
 await writeFile(join(root,'output/package-consumer.json'),JSON.stringify({schema:1,recordedAt:new Date().toISOString(),package:evidence,scope:'Actual npm payload, Node ESM/CJS and declarations; not browser navigation'},null,2)+'\n');
 await rm(consumer,{recursive:true,force:true});
});
test('payload contains only the built bundle, declarations and package documents',()=>{
 assert.deepEqual(evidence.files,['package/LICENSE','package/README.md','package/SKILL.md','package/dist/index.cjs','package/dist/index.d.cts','package/dist/index.d.ts','package/dist/index.js','package/package.json']);
});
test('packed ESM and CommonJS entries have equivalent pure behavior and no import side effects',()=>{
 const stdout=node(`
 import assert from 'node:assert/strict';
 import {createRequire} from 'node:module';
 const before=new Set(Reflect.ownKeys(globalThis));
 const esm=await import('defuss-dom-router');
 const cjs=createRequire(import.meta.url)('defuss-dom-router');
 assert.deepEqual(Reflect.ownKeys(globalThis).filter(k=>!before.has(k)),[]);
 const answers=[];
 for(const api of [esm,cjs]) {
  const router=api.createRouter({baseUrl:'https://example.test/console/',basePath:'/console/',routes:[{id:'record',path:'/records/:id'},{id:'all',path:'*'}]});
  const href=router.href({id:'record',params:{id:'雪/a'},query:[['tag','a'],['tag','b']],hash:'event 7'});
  const request=router.resolve(href);
  assert.equal(request.params.id,'雪/a'); assert.deepEqual(request.query,[['tag','a'],['tag','b']]);
  assert.equal(request.hash,'#event%207'); assert.equal(router.getSnapshot().current,null);
  assert.throws(()=>router.resolve('https://foreign.test/'),api.RouterInputError);
  answers.push(request); await router.destroy();
 }
 assert.deepEqual(answers[1],answers[0]);
 console.log('isolated exports passed');
 `);
 assert.match(stdout,/isolated exports passed/);
});
test('the ESM bundle is self-contained for direct browser use',async()=>{
 const bundle=await readFile(join(consumer,'node_modules/defuss-dom-router/dist/index.js'),'utf8');
 assert.doesNotMatch(bundle,/^\s*import\s|\brequire\(|\bimport\(/m);
});
test('packed ESM/CJS declarations resolve without workspace aliases or renderer type dependencies',async()=>{
 await writeFile(join(consumer,'consumer.mts'),`
 import {createRouter,type NavigationResult} from 'defuss-dom-router';
 const router=createRouter({baseUrl:'https://example.test/',routes:[{id:'home',path:'/'}],prepare:()=>({commit(){}})});
 const result:Promise<NavigationResult>=router.navigate('/');
 void result;
 // @ts-expect-error domain objects are not JSON history state
 router.navigate('/',{state:new Date()});
 // @ts-expect-error structural options cannot be reconfigured after construction
 router.config({mode:'hash'});
 `);
 await writeFile(join(consumer,'consumer.cts'),`import Router = require('defuss-dom-router');
 const router:Router.Router=Router.createRouter({baseUrl:'https://example.test/',routes:[]});
 void router;
 `);
 execFileSync(process.execPath,[require.resolve('typescript/bin/tsc'),'--noEmit','--strict','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','--lib','ES2022,DOM,DOM.Iterable','consumer.mts','consumer.cts'],{cwd:consumer,encoding:'utf8',stdio:'inherit'});
});
