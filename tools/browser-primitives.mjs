/** Real Chromium DOM/History unit tests on its allowed blank document.
 * This does NOT navigate to HTTP, change browser policy, or certify full router integration.
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { playwright } from './playwright.mjs';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
// VERIFIED: internal modules are not package exports (tests/package.test.mjs pins the payload), so `make build`
// bundles the test-only tests/units.ts entry for this harness instead of widening the public API.
const code=Buffer.from(await readFile(`${root}/tmp/units/units.js`)).toString('base64');
const launch={headless:true,args:['--no-sandbox']};
if(process.env.CHROMIUM_PATH)launch.executablePath=process.env.CHROMIUM_PATH;
else if((await import('node:fs')).existsSync('/usr/bin/chromium'))launch.executablePath='/usr/bin/chromium';
const browser=await playwright().chromium.launch(launch);
let result;
try{
 const page=await browser.newPage();await page.evaluate(async source=>{globalThis.__units=await import('data:text/javascript;base64,'+source);},code);
 result=await page.evaluate(async()=>{
  const {BrowserHistory,readEntry,HISTORY_KEY,bindLinks,createRouter}=globalThis.__units;
  const results=[];
  const ok=(c,m='assertion')=>{if(!c)throw Error(m);},equal=(a,b)=>ok(JSON.stringify(a)===JSON.stringify(b),JSON.stringify([a,b]));
  const wait=(type)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('event timeout')),2000);window.addEventListener(type,e=>{clearTimeout(timer);resolve(e);},{once:true});});
  let h;
  const test=async(name,run)=>{try{history.replaceState(null,'','about:blank#initial');document.body.replaceChildren();document.querySelector('base')?.remove();await run();results.push({name,status:'passed'});}catch(e){results.push({name,status:'failed',error:String(e.stack||e)});}finally{h?.release();h=null;}};
  await test('history metadata adopts blank real entry and preserves unrelated object fields',()=>{
   history.replaceState({foreign:7},'','about:blank#initial');h=new BrowserHistory(window,true);h.write(location.href,{x:1},true);
   equal(history.state.foreign,7);equal(history.state[HISTORY_KEY].state,{x:1});equal(h.current.index,0);equal(history.scrollRestoration,'manual');
  });
  await test('owned native back/forward traverses the original stack',async()=>{
   h=new BrowserHistory(window,false);h.write(location.href,null,true);h.write('about:blank#a',{a:1},false);h.write('about:blank#b',{b:2},false);
   let ev=wait('popstate');history.back();await ev;equal(location.hash,'#a');let entry=readEntry(history.state,location.href);equal(entry.state,{a:1});h.accept(entry);
   ev=wait('popstate');history.forward();await ev;equal(location.hash,'#b');equal(readEntry(history.state,location.href).state,{b:2});
  });
  await test('corrective traversal restores blocked entry without truncating Forward',async()=>{
   h=new BrowserHistory(window,false);h.write(location.href,null,true);h.write('about:blank#a',null,false);h.write('about:blank#b',null,false);const origin=h.current,len=history.length;
   const ev=wait('popstate');history.back();await ev;const arrived=readEntry(history.state,location.href);
   const on=()=>h.corrected(location.href,readEntry(history.state,location.href));window.addEventListener('popstate',on);
   try{ok(await h.restore(origin,arrived));equal(history.length,len);equal(location.hash,'#b');}finally{window.removeEventListener('popstate',on);}
   const back=wait('popstate');history.back();await back;equal(location.hash,'#a');const forward=wait('popstate');history.forward();await forward;equal(location.hash,'#b');
  });
  await test('push after a superseded traversal indexes the physical branch, not the stale committed view',async()=>{
   h=new BrowserHistory(window,false);h.write(location.href,null,true);h.write('about:blank#a',null,false);h.write('about:blank#b',null,false);
   let event=wait('popstate');history.back();await event;
   // Deliberately do not accept(): this is the state while the router awaits an async pop guard.
   equal(h.current.href,'about:blank#b');
   h.write('about:blank#replacement',null,false);equal(h.current.index,2);const committed=h.current;
   event=wait('popstate');history.back();await event;const arrived=readEntry(history.state,location.href);equal(arrived.index,1);
   const correction=()=>h.corrected(location.href,readEntry(history.state,location.href));window.addEventListener('popstate',correction);
   try{ok(await h.restore(committed,arrived));equal(location.href,'about:blank#replacement');}
   finally{window.removeEventListener('popstate',correction);}
  });
  await test('primitive foreign state stays unowned and cannot be falsely rolled back',async()=>{
   history.replaceState('foreign','',location.href);h=new BrowserHistory(window,false);h.write('about:blank#other',{x:1},true);equal(history.state,'foreign');equal(h.current,null);equal(await h.restore(null,null),false);
  });
  await test('foreign reserved namespace remains untouched',()=>{
   history.replaceState({[HISTORY_KEY]:{foreign:1},other:2},'',location.href);h=new BrowserHistory(window,false);h.write(location.href,null,true);equal(history.state,{[HISTORY_KEY]:{foreign:1},other:2});equal(h.current,null);
  });
  await test('ownership rejects a second active owner; release enables a new one',()=>{
   h=new BrowserHistory(window,false);let rejected=false;try{new BrowserHistory(window,false);}catch(e){rejected=e.code==='already-owned';}ok(rejected);h.release();h=new BrowserHistory(window,false);
  });
  await test('metadata survives reload-equivalent owner reconstruction without key collision',()=>{
   h=new BrowserHistory(window,false);h.write(location.href,null,true);h.write('about:blank#a',null,false);const old=h.current;h.release();h=new BrowserHistory(window,false);equal(h.current.key,old.key);h.write('about:blank#b',null,false);equal(h.current.index,old.index+1);ok(h.current.key!==old.key);
  });
  await test('malformed metadata is rejected using actual structured-cloned history state',()=>{
   for(const entry of [{},{library:'defuss-dom-router',version:1,state:null}, {[HISTORY_KEY]:'x'}]){history.replaceState(entry,'',location.href);equal(readEntry(history.state,location.href),null);}
  });
  await test('saved scroll metadata is written on accepted push only',()=>{
   h=new BrowserHistory(window,true);h.write(location.href,null,true);h.scrolls.set(h.current.key,[23,75]);const before=history.state;equal(before[HISTORY_KEY].scroll,[0,0]);h.write('about:blank#next',null,false);equal(h.current.scroll,[0,0]);
  });
  await test('cross-realm native History entries retain owned metadata and JSON state',async()=>{
   const iframe=document.createElement('iframe');document.body.append(iframe);const child=iframe.contentWindow;
   const owner=new BrowserHistory(child,false);try{owner.write('about:blank#child',{x:[1,2]},true);equal(readEntry(child.history.state,child.location.href).state,{x:[1,2]});}finally{owner.release();iframe.remove();}
  });
  await test('library imports did not populate router singleton or defuss namespace',()=>{equal(globalThis.__defuss_router__,undefined);equal(globalThis.df$,undefined);});
  async function linksSetup(){const base=document.createElement('base');base.href='https://app.test/console/';document.head.append(base);const r=createRouter({baseUrl:base.href,basePath:'/console/',routes:[{id:'home',path:'/'},{id:'person',path:'/people/:id'}]});const seen=[];const detach=bindLinks(document,url=>r.resolve(url),url=>seen.push(url));return{r,seen,detach};}
  await test('delegated DOM links created after binding resolve through the real URL matcher',async()=>{
   const {r,seen,detach}=await linksSetup();const anchor=document.createElement('a');anchor.href='people/42?x=1#h';anchor.dataset.routerLink='';const span=document.createElement('span');anchor.append(span);document.body.append(anchor);span.click();equal(seen,['https://app.test/console/people/42?x=1#h']);detach();await r.destroy();
  });
  await test('native DOM eligibility respects base target download modifiers and opt-out',async()=>{
   const {r,seen,detach}=await linksSetup();let captured=[];const after=e=>{captured.push(e.defaultPrevented);e.preventDefault();};document.addEventListener('click',after);
   try{for(const spec of [{download:''},{target:'_blank'},{'data-router-ignore':''},{rel:'external'},{href:'https://external.test/x'},{href:'mailto:a@b.test'},{href:'not-owned'}]){
    const a=document.createElement('a');a.href='people/42';a.dataset.routerLink='';for(const[k,v]of Object.entries(spec))a.setAttribute(k,v);document.body.append(a);a.click();a.remove();}
    for(const key of ['ctrlKey','metaKey','shiftKey','altKey']){const a=document.createElement('a');a.href='people/42';a.dataset.routerLink='';document.body.append(a);a.dispatchEvent(new MouseEvent('click',{button:0,bubbles:true,cancelable:true,[key]:true}));a.remove();}
    document.querySelector('base').target='_blank';const a=document.createElement('a');a.href='people/42';a.dataset.routerLink='';document.body.append(a);a.click();a.remove();
    ok(captured.length===12);ok(captured.every(c=>!c));equal(seen,[]);
   }finally{document.removeEventListener('click',after);detach();await r.destroy();}
  });
  await test('disposer removes only the owned listener',async()=>{
   const {r,seen,detach}=await linksSetup();detach();const a=document.createElement('a');a.href='people/42';a.dataset.routerLink='';document.body.append(a);let captured;const observe=e=>{captured=e.defaultPrevented;e.preventDefault();};document.addEventListener('click',observe);a.click();document.removeEventListener('click',observe);equal(captured,false);equal(seen,[]);await r.destroy();
  });
  await test('shadow-root composed paths are handled without piercing closed DOM',async()=>{
   const {r,detach}=await linksSetup();detach();const host=document.createElement('div');document.body.append(host);const shadow=host.attachShadow({mode:'open'});const a=document.createElement('a');a.href='people/42';a.dataset.routerLink='';shadow.append(a);let handled=0;const off=bindLinks(shadow,u=>r.resolve(u),()=>handled++);a.click();equal(handled,1);off();await r.destroy();
  });
  return{scope:'real DOM and History primitives on about:blank; not HTTP router integration',url:location.href,results};
 });
 result.version=browser.version();
}finally{await browser.close();}
await mkdir(`${root}/output`,{recursive:true});await writeFile(`${root}/output/browser-primitives.json`,JSON.stringify({recordedAt:new Date().toISOString(),...result},null,2)+'\n');
for(const r of result.results)console.log(`${r.status.toUpperCase()} ${r.name}${r.error?'\n'+r.error:''}`);
if(result.results.some(r=>r.status!=='passed'))process.exitCode=1;
