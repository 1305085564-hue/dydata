// Real-browser measurements for the content list. Uses an ignored env file for credentials.
// Example: node --env-file=.env.content-perf.local scripts/audit/content-open-performance.mjs --url http://localhost:3217 --cases /tmp/content-cases.json --phase before --runs 15 --batch 1 --managed-server true --output output/content-before-1.json
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { performance } from 'node:perf_hooks';
import { resolve, dirname } from 'node:path';
const argv = process.argv.slice(2);
const option = (key, fallback) => { const i = argv.indexOf(`--${key}`); return i < 0 ? fallback : argv[i+1]; };
const base = new URL(option('url', 'http://localhost:3217'));
const managed = option('managed-server', 'false') === 'true';
if (managed && !['localhost','127.0.0.1','[::1]'].includes(base.hostname)) throw new Error('Managed server requires localhost');
const cases = JSON.parse(await readFile(option('cases', ''), 'utf8'));
const runs = Number(option('runs', '5'));
if (!Number.isInteger(runs) || runs < 1 || runs > 100) throw new Error('runs must be 1..100');
const email = process.env.DYDATA_E2E_EMAIL || process.env.DYDATA_TEST_EMAIL || process.env.DYDATA_TEST_LEADER_EMAIL;
const password = process.env.DYDATA_E2E_PASSWORD || process.env.DYDATA_TEST_PASSWORD || process.env.DYDATA_TEST_LEADER_PASSWORD;
if (!email || !password) throw new Error('Missing test credentials in ignored env');
const browser = await chromium.launch({headless:true});
let server;
async function start() {
 if (!managed) return;
 server = spawn(process.execPath, ['node_modules/next/dist/bin/next','start','-p',base.port], {env: process.env, stdio:['ignore','ignore','ignore']});
 for (let i=0; i<100; i++) {
  if (server.exitCode !== null) throw new Error('Local production server exited');
  try { if ((await fetch(new URL('/login',base))).ok) return; } catch { /* wait for local server */ }
  await new Promise((r)=>setTimeout(r,100));
 }
 throw new Error('Local server did not start');
}
async function stop() { if (!server) return; const child=server; server=null; child.kill('SIGTERM'); await once(child,'exit'); }
const ready = async (page) => {
 await page.locator('#content-review-list[data-content-ready="true"][aria-busy="false"]').waitFor({timeout:30000});
 await page.getByRole('button',{name:/^查看作品详情：/}).first().waitFor({timeout:30000});
 if (!(await page.getByRole('button',{name:'前一天',exact:true}).isEnabled())) throw new Error('Fixture requires adjacent date');
};
const samples=[];
let runError=null;
async function measure(page,scenario,action,finish) {
 const requests = new Map(); const pending=[];
 const onRequest=(request)=>requests.set(request,{path:new URL(request.url()).pathname,start:performance.now(),method:request.method()});
 const onResponse=(response)=>{const item=requests.get(response.request());if(item){item.status=response.status();item.serverTiming=response.headers()['server-timing'] || null;item.cache=response.headers()['x-content-cache'] || null;}};
 const onFinish=(request)=>{const item=requests.get(request);if(item){item.ms=performance.now()-item.start;pending.push(request.sizes().then((sizes)=>{item.bytes=sizes.responseBodySize;}).catch(()=>{}));}};
 const onFailure=(request)=>{const item=requests.get(request);if(item){item.failed=true;item.ms=performance.now()-item.start;}};
 page.on('request',onRequest);page.on('response',onResponse);page.on('requestfinished',onFinish);page.on('requestfailed',onFailure);
 const t=performance.now(); let error=null; let ms=null;
 try {await action();await finish();ms=performance.now()-t;} catch {error='scenario_failed';}
 // Record in-flight requests as pending, rather than silently treating them as successful.
 await Promise.all(pending);
 page.off('request',onRequest);page.off('response',onResponse);page.off('requestfinished',onFinish);page.off('requestfailed',onFailure);
 const all=[...requests.values()];const business=all.filter((x)=>x.path.startsWith('/api/')&&x.path!='/api/usage-events');
 samples.push({scenario,ms,error,requests:business.map((item)=>({path:item.path,method:item.method,status:item.status,ms:item.ms,bytes:item.bytes,failed:item.failed,serverTiming:item.serverTiming,cache:item.cache})),businessRequests:business.length,bytes:all.reduce((n,r)=>n+(r.bytes||0),0),httpErrors:all.filter((r)=>r.failed||r.status>=400).length,pendingRequests:all.filter((r)=>r.ms===undefined).length,slowest:all.filter((r)=>r.ms!==undefined).sort((a,b)=>b.ms-a.ms).slice(0,3).map((r)=>({path:r.path,status:r.status,ms:r.ms,bytes:r.bytes}))});
 if(error) throw new Error(`Scenario failed: ${scenario}`);
}
try {
 await start();
 const loginContext=await browser.newContext();const login=await loginContext.newPage();
 await login.goto(new URL('/login',base).href);
 await login.getByRole('textbox',{name:'邮箱',exact:true}).fill(email);
 await login.getByRole('textbox',{name:'密码',exact:true}).fill(password);
 await Promise.all([login.waitForURL('**/dashboard'),login.locator('button[type="submit"]').click()]);
 const storageState=await loginContext.storageState(); // memory only; never written to report
 await loginContext.close();await stop();
 for(const scenarioCase of cases) {
  const target=new URL(scenarioCase.path,base);
  if(target.origin!==base.origin || target.pathname!='/admin/content') throw new Error('Only content paths on configured origin');
  for(let run=0;run<runs;run++) {
   await start();
   const context=await browser.newContext({storageState});
   // Dismiss only the existing first-visit tutorial, without changing authentication state.
   await context.addInitScript(()=>localStorage.setItem('content-review-onboarding-seen','true'));
   const page=await context.newPage();
   await measure(page,`${scenarioCase.name}:first`,()=>page.goto(target.href,{waitUntil:'commit'}),()=>ready(page));
   await measure(page,`${scenarioCase.name}:reopen`,()=>page.goto(target.href,{waitUntil:'commit'}),()=>ready(page));
   // First visit to the neighbouring date is kept separate from the repeat-date target.
   await measure(page,`${scenarioCase.name}:new-date`,async()=>{
    const response=page.waitForResponse((r)=>new URL(r.url()).pathname==='/api/admin/content/list');
    await page.getByRole('button',{name:'前一天',exact:true}).click();await response;
   },()=>ready(page));
   await measure(page,`${scenarioCase.name}:date-return`,async()=>{
    const response=page.waitForResponse((r)=>new URL(r.url()).pathname==='/api/admin/content/list');
    await page.getByRole('button',{name:'后一天',exact:true}).click();await response;
   },()=>ready(page));
   await page.getByRole('button',{name:/^查看作品详情：/}).first().click();
   await page.getByRole('dialog').waitFor({timeout:30000});
   await measure(page,`${scenarioCase.name}:detail-return`,()=>page.keyboard.press('Escape'),async()=>{await page.getByRole('dialog').waitFor({state:'hidden'});await ready(page);});
   await context.close();await stop();
  }
 }
} catch {
 runError='browser_scenario_or_login_failed';
 process.exitCode=1;
} finally {
 await stop();await browser.close();
 const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.ceil(p*values.length)-1]??null;
 const summary=Object.fromEntries([...new Set(samples.map((s)=>s.scenario))].map((scenario)=>{
  const group=samples.filter((s)=>s.scenario===scenario);const values=group.filter((s)=>s.ms!==null).map((s)=>s.ms);
  return [scenario,{n:group.length,errors:group.filter((s)=>s.error).length,httpErrors:group.reduce((n,s)=>n+s.httpErrors,0),p50:percentile(values,.5),p95:percentile(values,.95),max:values.length?Math.max(...values):null}];
 }));
 const output=resolve(option('output','output/content-performance.json'));await mkdir(dirname(output),{recursive:true});
 await writeFile(output,JSON.stringify({runError,phase:option('phase','diagnostic'),batch:option('batch','1'),at:new Date().toISOString(),release:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),browser:browser.version(),environment:managed?'local-production-fresh-process':'external-server-cache-uncontrolled',network:{location:'local-host',proxy:'no-proxy-loopback',region:'local'},cases,samples,summary},null,2));
 console.log(JSON.stringify({output,runError,summary}));
}
