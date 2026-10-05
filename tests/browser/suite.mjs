/** Runs inside an actual browser against the copied/built distribution. */
import { createRouter } from '/router/index.js';
const equal = (a,b,message='equality') => { if(JSON.stringify(a)!==JSON.stringify(b)) throw Error(`${message}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); };
const ok = (v,message='assertion') => {if(!v)throw Error(message);};
const gate = () => {let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const next = (router,predicate=()=>true) => new Promise((resolve,reject)=>{const t=setTimeout(()=>{off();reject(Error('Timed out awaiting router state'));},2500); const off=router.subscribe(s=>{if(s.phase==='idle'&&predicate(s)){clearTimeout(t);off();resolve(s);}});});
const frame=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
const waitUntil = async predicate => { const start=performance.now(); while(!predicate()){if(performance.now()-start>2500)throw Error('Condition did not become true');await frame();} };
// Tests only register here; tools/browser.mjs runs each one in a fresh, completely loaded document.
// WHY loaded: during document load, location navigations replace the current entry instead of pushing (HTML spec).
// WHY fresh: WebKit throws SecurityError after 100 history.replaceState/pushState calls per 10 s in one document.
const tests=[];
const defaultRoutes=[{id:'home',path:'/'},{id:'a',path:'/a'},{id:'b',path:'/b'},{id:'person',path:'/people/:id'},{id:'missing',path:'*'}];
let routers=[];
function make(extra={}){const r=createRouter({routes:defaultRoutes,scroll:'manual',...extra});routers.push(r);return r;}
function test(name,fn){tests.push({name,fn});}
async function run(index){
  const {name,fn}=tests[index];
  try{ history.replaceState(null,'','/');document.body.innerHTML='<main id="view"></main>';await fn();return {name,status:'passed'}; }
  catch(e){return {name,status:'failed',error:String(e.stack||e)};}
  finally {await Promise.all(routers.map(r=>r.destroy()));routers=[];history.replaceState(null,'','/');}
}
await test('initial deep route is matched before the first commit',async()=>{
 history.replaceState(null,'','/people/42?tab=history#event-7');let seen;
 const r=make({prepare(ctx){seen=ctx.to;return{commit(){document.querySelector('#view').textContent=ctx.to.params.id;}};}});
 equal((await r.start()).status,'committed');equal(seen.params.id,'42');equal(seen.search,'?tab=history');equal(document.querySelector('#view').textContent,'42');
 equal((await r.ready()).status,'committed');
});
await test('programmatic push replace query hash and same-state equality',async()=>{
 let commits=0;const r=make({prepare(){return{commit(){commits++;}};}});await r.start();const length=history.length;
 await r.navigate('/a',{state:{x:1,y:2}});equal(location.pathname,'/a');equal(history.length,length+1);
 equal((await r.navigate('/a',{state:{y:2,x:1}})).status,'unchanged');equal(history.length,length+1);
 await r.navigate('?q=1');equal(location.pathname,'/a');equal(location.search,'?q=1');const before=commits;
 await r.navigate('#section');equal(commits,before);equal(location.hash,'#section');
 const len=history.length;await r.navigate('/b',{replace:true});equal(history.length,len);equal(location.pathname,'/b');
});
await test('blocked programmatic navigation causes no history or DOM commit',async()=>{
 let writes=0;const r=make({prepare(){return{commit(){writes++;}};}});await r.start();const state=JSON.stringify(history.state),length=history.length;
 r.beforeEach(()=>false);const result=await r.navigate('/a');equal(result.status,'blocked');equal(result.veto,'before-write');equal(location.pathname,'/');equal(JSON.stringify(history.state),state);equal(history.length,length);equal(writes,1);
});
await test('real Back and Forward preserve query fragment and application state',async()=>{
 const r=make();await r.start();await r.navigate('/a?q=1#x',{state:{page:1}});await r.navigate('/b',{state:{page:2}});
 let pending=next(r,s=>s.current.path==='/a');history.back();await pending;equal(location.search,'?q=1');equal(location.hash,'#x');equal(r.getSnapshot().state,{page:1});
 pending=next(r,s=>s.current.path==='/b');history.forward();await pending;equal(r.getSnapshot().state,{page:2});
});
await test('blocked real Back restores entry without truncating Forward',async()=>{
 let commits=0;const r=make({prepare(){return{commit(){commits++;}};}});await r.start();await r.navigate('/a?q=1#one');await r.navigate('/b?q=2#two');
 const length=history.length,before=commits;const off=r.beforeEach(ctx=>ctx.cause!=='traverse');
 const pending=next(r,s=>s.current.path==='/b');history.back();await pending;equal(location.pathname,'/b');equal(location.search,'?q=2');equal(location.hash,'#two');equal(history.length,length);equal(commits,before);
 off();let p=next(r,s=>s.current.path==='/a');history.back();await p;p=next(r,s=>s.current.path==='/b');history.forward();await p;equal(location.pathname,'/b');
});
await test('unowned denied traversal does not render protected content',async()=>{
 let commits=0;history.replaceState('foreign','','/a');const r=make({prepare(){return{commit(){commits++;}};}});await r.start();await r.navigate('/b');
 r.beforeEach(()=>false);const error=gate();r.config({onError(e){if(e.code==='unowned-history')error.resolve(e);}});history.back();await error.promise;
 equal(location.pathname,'/a');equal(commits,2);equal(r.getSnapshot().phase,'error');equal(r.getSnapshot().current.path,'/b');
});
await test('foreign history fields survive; reserved collision is not overwritten',async()=>{
 history.replaceState({other:{keep:1}},'','/');const r=make();await r.start();equal(history.state.other,{keep:1});await r.navigate('/a');equal(history.state.other,{keep:1});await r.destroy();
 const foreign={__defuss_dom_router_v1:{mine:true},other:1};history.replaceState(foreign,'','/');const b=make();await b.start();equal(history.state,foreign);equal(b.getSnapshot().historyOwnership,'unowned');
});
await test('one owner per Window and teardown permits a fresh owner',async()=>{
 const a=make(),b=make();await a.start();equal((await b.start()).error.code,'already-owned');await a.destroy();const c=make();equal((await c.start()).status,'committed');
});
await test('multiple Window instances have isolated history owners',async()=>{
 const iframe=document.createElement('iframe');iframe.src='/empty.html';document.body.append(iframe);await new Promise(r=>iframe.onload=r);
 const a=make(),b=make({window:iframe.contentWindow});await a.start();await b.start();await b.navigate('/b');equal(location.pathname,'/');equal(iframe.contentWindow.location.pathname,'/b');await b.destroy();iframe.remove();
});
await test('superseded preparation ignoring abort never commits and disposes once',async()=>{
 const hold=gate();let oldDisposes=0,oldCommits=0;const r=make({prepare(ctx){if(ctx.to.path==='/a')return hold.promise;return{commit(){document.querySelector('#view').textContent=ctx.to.path;}};}});await r.start();
 const a=r.navigate('/a');const b=r.navigate('/b');equal((await a).status,'superseded');equal((await b).status,'committed');
 hold.resolve({commit(){oldCommits++;},dispose(){oldDisposes++;}});await frame();equal(oldCommits,0);equal(oldDisposes,1);equal(location.pathname,'/b');
});
await test('superseded async guard cannot write history',async()=>{
 const hold=gate();const r=make();await r.start();r.beforeEach(ctx=>ctx.to.path==='/a'?hold.promise:true);const a=r.navigate('/a');await r.navigate('/b');hold.resolve(true);equal((await a).status,'superseded');await frame();equal(location.pathname,'/b');
});
await test('commits serialize; queued intent is latest-wins',async()=>{
 const hold=gate(),entered=gate();const order=[];const r=make({prepare(ctx){return{async commit(){order.push('begin'+ctx.to.path);if(ctx.to.path==='/a'){entered.resolve();await hold.promise;}order.push('end'+ctx.to.path);}};}});await r.start();
 const a=r.navigate('/a');await entered.promise;const b=r.navigate('/b');const c=r.navigate('/people/3');equal((await b).status,'superseded');equal(location.pathname,'/a');hold.resolve();await a;await c;equal(order,['begin/','end/','begin/a','end/a','begin/people/3','end/people/3']);
});
await test('render has no guards or history writes and replaces its resource scope',async()=>{
 let commits=0,disposes=0,guardCalls=0;const r=make({prepare(){return{commit(){commits++;},dispose(){disposes++;}};}});await r.start();r.beforeEach(()=>{guardCalls++;return false;});const before=JSON.stringify(history.state),len=history.length;await r.render();equal(guardCalls,0);equal(commits,2);equal(disposes,1);equal(history.length,len);equal(JSON.stringify(history.state),before);await r.destroy();equal(disposes,2);
});
await test('same-path query updates replace scopes without accumulating leave hooks',async()=>{
 let disposeCount=0,leaveCount=0;const r=make({prepare(){return{commit(){},beforeLeave(){leaveCount++;},dispose(){disposeCount++;}};}});await r.start();await r.navigate('?q=1');await r.navigate('?q=2');await r.navigate('/a');equal(leaveCount,1);equal(disposeCount,3);
});
await test('prepare and commit failures settle as errors without false success',async()=>{
 const r=make();await r.start();r.config({prepare(){throw Error('private token');}});let result=await r.navigate('/a');equal(result.error.code,'prepare-error');equal(result.commitStarted,false);equal(location.pathname,'/');ok(!result.error.message.includes('private'));
 r.config({prepare(){return{commit(){document.querySelector('#view').textContent='partial';throw Error('secret');}};}});result=await r.navigate('/b');equal(result.error.code,'commit-error');equal(result.commitStarted,true);equal(location.pathname,'/b');equal(r.getSnapshot().phase,'error');
});
await test('guard errors are caught and callbacks can recover by rerendering',async()=>{
 const r=make();await r.start();const off=r.beforeEach(()=>{throw Error('secret');});equal((await r.navigate('/a')).error.code,'guard-error');off();r.config({prepare(){return{commit(){}};}});equal((await r.render()).status,'committed');
});
await test('destroy settles abandoned work and waits for the active commit',async()=>{
 const hold=gate(),entered=gate();let disposed=0;const r=make({prepare(ctx){return{async commit(){if(ctx.to.path==='/a'){entered.resolve();await hold.promise;}},dispose(){disposed++;}};}});await r.start();const a=r.navigate('/a');await entered.promise;let ended=false;const destroyed=r.destroy().then(()=>ended=true);await frame();equal(ended,false);hold.resolve();await destroyed;await a;equal(r.getSnapshot().phase,'destroyed');equal(disposed,2);
});
await test('initialHref replaces adopted entry, not pushes it',async()=>{
 const len=history.length;const r=make();await r.start('/people/44?x=1#a');equal(history.length,len);equal(location.pathname,'/people/44');equal(r.getSnapshot().current.params.id,'44');
});
await test('hash mode runs full router semantics on a fixed shell',async()=>{
 history.replaceState(null,'','/shell.html?outer=1#/people/3?q=x#anchor');const r=make({mode:'hash'});await r.start();equal(r.getSnapshot().current.path,'/people/3');equal(r.getSnapshot().current.search,'?q=x');
 await r.navigate(r.href({id:'a',query:[['tag','1'],['tag','2']],hash:'h'}));equal(location.pathname,'/shell.html');equal(location.search,'?outer=1');equal(r.getSnapshot().current.query,[['tag','1'],['tag','2']]);
 equal((await r.navigate('?changed=1')).error.code,'outside-shell');const pending=next(r,s=>s.current.path==='/people/3');history.back();await pending;equal(r.getSnapshot().current.hash,'#anchor');
});
await test('hash-mode native hash assignment is handled once',async()=>{
 history.replaceState(null,'','/shell.html#/');let commits=0;const r=make({mode:'hash',prepare(){return{commit(){commits++;}};}});await r.start();const pending=next(r,s=>s.current.path==='/a');location.hash='/a';await pending;await frame();equal(commits,2);
});
await test('state validation happens before mutations and does not escape click dispatch',async()=>{
 const r=make();await r.start();const before=history.length;const result=await r.navigate('/a',{state:Infinity});equal(result.error.code,'invalid-state');equal(history.length,before);equal(location.pathname,'/');
});
await test('subscriber and link disposers remove only their own handlers',async()=>{
 const r=make();let events=0;const unsub=r.subscribe(()=>events++);await r.start();unsub();const before=events;await r.navigate('/a');equal(events,before);
 const detach=r.attachLinks(document);detach();const a=document.createElement('a');a.href='/b';a.dataset.routerLink='';document.body.append(a);const ev=new MouseEvent('click',{bubbles:true,cancelable:true,button:0});let prevented;const observe=e=>{prevented=e.defaultPrevented;e.preventDefault();};document.addEventListener('click',observe);a.dispatchEvent(ev);document.removeEventListener('click',observe);equal(prevented,false);
 // The observer prevented the native default action only after recording the router decision.
 a.remove();
});
await test('delegated links created after binding navigate without reload',async()=>{
 const r=make();await r.start();r.attachLinks(document);document.querySelector('#view').innerHTML='<a data-router-link href="/a?x=1#h"><span>Go</span></a>';
 const pending=next(r,s=>s.current.path==='/a');document.querySelector('span').click();await pending;equal(location.search,'?x=1');equal(location.hash,'#h');
});
await test('link eligibility respects native modifiers targets downloads and opt-out',async()=>{
 const r=make();await r.start();r.attachLinks(document);
 const check=(attrs,init={},baseTarget)=>{const a=document.createElement('a');a.textContent='link';a.setAttribute('data-router-link','');a.href='/a';for(const[k,v]of Object.entries(attrs))a.setAttribute(k,v);document.body.append(a);
 let base;if(baseTarget){base=document.createElement('base');base.target=baseTarget;document.head.append(base);}const ev=new MouseEvent('click',{bubbles:true,cancelable:true,button:0,...init});
 // Block navigation after the router observes the event; record its actual prevention decision.
 let routed;const observe=e=>{routed=e.defaultPrevented;e.preventDefault();};document.addEventListener('click',observe);a.dispatchEvent(ev);document.removeEventListener('click',observe);a.remove();base?.remove();return routed;};
 for(const [attrs,init,baseTarget]of [[{}, {ctrlKey:true}],[{}, {metaKey:true}],[{}, {altKey:true}],[{}, {shiftKey:true}],[{}, {button:1}],[{target:'_blank'}],[{download:''}],[{'data-router-ignore':''}],[{href:'https://external.test/a'}],[{href:'mailto:a@b.test'}],[{}, {}, '_blank'],[{rel:'external'}]])equal(check(attrs,init,baseTarget),false);
});
await test('defaultPrevented events and unmatched routes are not captured',async()=>{
 const r=make({routes:[{id:'home',path:'/'}]});await r.start();r.attachLinks(document);const a=document.createElement('a');a.href='/not-owned';a.dataset.routerLink='';document.body.append(a);let routed;const block=e=>{routed=e.defaultPrevented;e.preventDefault();};document.addEventListener('click',block);a.click();document.removeEventListener('click',block);equal(routed,false);
});
await test('open shadow-root links use the composed path',async()=>{
 const r=make();await r.start();const host=document.createElement('section');document.body.append(host);const shadow=host.attachShadow({mode:'open'});shadow.innerHTML='<a href="/b" data-router-link>Go</a>';r.attachLinks(shadow);const pending=next(r,s=>s.current.path==='/b');shadow.querySelector('a').click();await pending;equal(location.pathname,'/b');
});
await test('basePath navigation stays in segment boundaries',async()=>{
 history.replaceState(null,'','/console/');const r=make({basePath:'/console/'});await r.start();await r.navigate(r.href({id:'person',params:{id:'a/b'}}));equal(location.pathname,'/console/people/a%2Fb');equal(r.getSnapshot().current.params.id,'a/b');equal((await r.navigate('/console-other/a')).error.code,'outside-base');
});
await test('auto-scroll anchor waits for the committed view; restore is entry-specific',async()=>{
 const r=make({scroll:'auto',prepare(){return{commit(){document.querySelector('#view').innerHTML='<div style="height:1800px"></div><h2 id="bottom">Target</h2><div style="height:1500px"></div>';}};}});await r.start();await r.navigate('/a#bottom');await frame();ok(scrollY>1000,'anchor scroll');const saved=scrollY;
 await r.navigate('/b');await frame();equal(scrollY,0);const pending=next(r,s=>s.current.path==='/a');history.back();await pending;await frame();ok(Math.abs(scrollY-saved)<4,'restored scroll');
});
await test('full physical URI remains coherent for double-slash base-relative paths',async()=>{
 history.replaceState(null,'','/console/');const r=make({basePath:'/console/'});const q=r.resolve('/console//other');equal(q.path,'//other');equal(q.origin,location.origin);
});
await test('superseding with the current location clears pending phase',async()=>{
 const hold=gate();const r=make({prepare(ctx){return ctx.to.path==='/a'?hold.promise:{commit(){}};}});await r.start();const first=r.navigate('/a');equal((await r.navigate('/')).status,'unchanged');equal(r.getSnapshot().phase,'idle');equal(r.getSnapshot().pending,null);hold.resolve({commit(){}});await first;
});
await test('push after an unowned fragment entry starts a new session; blocked Back never lands on a third entry',async()=>{
 const r=make();await r.start();await r.navigate('/a');
 location.hash='x';await waitUntil(()=>r.getSnapshot().historyOwnership==='unowned'&&r.getSnapshot().phase==='idle');
 await r.navigate('/b');equal(r.getSnapshot().historyOwnership,'owned');
 r.beforeEach(ctx=>ctx.cause!=='traverse');const error=gate();r.config({onError(e){if(e.code==='unowned-history')error.resolve(e);}});
 history.go(-2);await error.promise;await frame();equal(location.pathname+location.hash,'/a');equal(r.getSnapshot().current.path,'/b');
});
await test('links attached before start stay native instead of being swallowed',async()=>{
 const r=make();r.attachLinks(document);const a=document.createElement('a');a.href='/a';a.dataset.routerLink='';document.body.append(a);
 let routed;const observe=e=>{routed=e.defaultPrevented;e.preventDefault();};document.addEventListener('click',observe);a.click();document.removeEventListener('click',observe);a.remove();equal(routed,false);
});
window.__suite={names:tests.map(t=>t.name),run};
