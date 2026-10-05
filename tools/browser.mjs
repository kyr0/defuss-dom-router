/** Real browser integration; served code is an isolated copy of the distribution, never TS sources. */
import { createServer } from 'node:http';
import { readFile, cp, mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { playwright } from './playwright.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const temporary=await mkdtemp(join(tmpdir(),'defuss-router-browser-'));
await cp(join(root,'dist'),join(temporary,'router'),{recursive:true});
await mkdir(join(root,'output'),{recursive:true});
const server=createServer(async(req,res)=>{
 const path=new URL(req.url,'http://fixture').pathname;
 try{
  if(path==='/suite.mjs'){res.setHeader('content-type','text/javascript');res.end(await readFile(join(root,'tests/browser/suite.mjs')));return;}
  if(path.startsWith('/router/')){const f=resolve(temporary,'.'+path);if(!f.startsWith(temporary+'/'))throw Error('bad path');res.setHeader('content-type','text/javascript');res.end(await readFile(f));return;}
  // This is an explicitly test-owned HTML transport. Not a claim about native Rust serving.
  res.setHeader('content-type','text/html');res.end(path==='/empty.html'?'<html><body>iframe</body></html>':'<!doctype html><html><head><meta charset="utf-8"><title>Router test</title></head><body><script type="module" src="/suite.mjs"></script></body></html>');
 }catch{res.writeHead(404);res.end('missing');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const engines=(process.env.ROUTER_BROWSERS??'chromium').split(',');
const TEST_TIMEOUT_MS=15000;
const all=[];let failed=false;
try{
 const pw=playwright();
 for(const engine of engines){
  let browser;
  try{
   const options={headless:true};
   if(engine==='chromium'&&(process.env.CHROMIUM_PATH||existsSync('/usr/bin/chromium')))options.executablePath=process.env.CHROMIUM_PATH||'/usr/bin/chromium';
   if(engine==='chromium')options.args=['--no-sandbox'];
   browser=await pw[engine].launch(options);
   const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
   if(engine==='chromium')await page.coverage.startJSCoverage({resetOnNavigation:false,reportAnonymousScripts:false});
   // One fresh document per test, started after load (see tests/browser/suite.mjs for why).
   const open=async()=>{await page.goto(origin);await page.waitForFunction(()=>window.__suite,null,{timeout:30000});};
   await open();const names=await page.evaluate(()=>window.__suite.names),results=[];
   for(let i=0;i<names.length;i++){
    await open();let timer;
    // VERIFIED: a test that never settles fails on its own instead of hanging the run (a never-settling probe
    // failed after 15 s and the next test still ran); the next open() abandons its document.
    const limit=new Promise(r=>{timer=setTimeout(()=>r({name:names[i],status:'failed',error:`Timed out after ${TEST_TIMEOUT_MS} ms`}),TEST_TIMEOUT_MS);});
    results.push(await Promise.race([page.evaluate(i=>window.__suite.run(i),i),limit]));clearTimeout(timer);
   }const coverage=engine==='chromium'?await page.coverage.stopJSCoverage():[];
   await writeFile(join(root,`output/browser-coverage-${engine}.json`),JSON.stringify(coverage));
   const report={engine,version:browser.version(),status:results.every(r=>r.status==='passed')&&errors.length===0?'passed':'failed',results,errors};all.push(report);if(report.status!=='passed')failed=true;
   for(const result of results)console.log(`${engine}: ${result.status.toUpperCase()} ${result.name}${result.error?'\n'+result.error:''}`);
   if(errors.length)console.error(errors);
  }catch(error){failed=true;all.push({engine,status:'UNKNOWN',error:String(error)});console.error(`${engine}: UNKNOWN ${error}`);}
  finally{await browser?.close();}
 }
}finally{await new Promise(r=>server.close(r));await rm(temporary,{recursive:true,force:true});}
await writeFile(join(root,'output/browser.json'),JSON.stringify({recordedAt:new Date().toISOString(),reports:all},null,2)+'\n');
if(failed)process.exitCode=1;
