// Real UI regression of an archived, unmodified main checkout; loopback services only.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, createWriteStream } from 'node:fs';
import { randomUUID, randomBytes } from 'node:crypto';
import { chromium } from '@playwright/test';
import { snapshotQuery, emptyDatabaseAssertion, buildApply, buildRollback, quote } from './permission-batch-a.mjs';
const directory=process.env.DYDATA_BATCH_A_LOCAL_DIR, app=process.env.DYDATA_BATCH_A_APP_DIR;
assert(directory?.startsWith('/tmp/dydata-supabase-batch-a-')&&app?.startsWith('/tmp/dydata-supabase-batch-a-'));
const cfg=readFileSync(directory+'/supabase/config.toml','utf8'),project=cfg.match(/^project_id = "([^"]+)"/m)[1];assert.match(project,/^dydata-supabase-batch-a-[a-z0-9-]+$/);
const container='supabase_db_'+project;
const keys=JSON.parse(execFileSync('supabase',['status','--workdir',directory,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));assert.equal(new URL(keys.API_URL).hostname,'127.0.0.1');
const sql=s=>execFileSync('docker',['exec','-i',container,'psql','-U','postgres','-XAtq','-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const query=s=>JSON.parse(sql(s)),snapshot=()=>query(snapshotQuery);
const output=directory+'/pages-'+Date.now();mkdirSync(output,{mode:0o700});const save=(n,x)=>writeFileSync(output+'/'+n,JSON.stringify(x,null,2),{mode:0o600});
const records=[],actors={},password=randomBytes(28).toString('base64url')+'Aa1!';let server,browser;let original;
async function request(path,body,method='POST'){const r=await fetch(keys.API_URL+path,{method,headers:{apikey:keys.SERVICE_ROLE_KEY,Authorization:'Bearer '+keys.SERVICE_ROLE_KEY,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const raw=await r.text();assert(r.ok,`${r.status}: ${raw}`);return raw?JSON.parse(raw):null;}
const team=randomUUID();
try{
 sql(emptyDatabaseAssertion);
 assert.equal(sql('SELECT count(*) FROM auth.users'),'0');original=snapshot();save('original.json',original);
 sql(`INSERT INTO public.teams(id,name) VALUES(${quote(team)},'Synthetic UI team')`);
 for(const role of ['member','admin','owner','applicant']){
  const email=`batch-a-ui-${role}@example.test`;const u=await request('/auth/v1/admin/users',{email,password,email_confirm:true});actors[role]={id:u.id,email};
  sql(`INSERT INTO public.profiles(id,name,role,company_role,team_id) VALUES(${quote(u.id)},${quote('Synthetic UI '+role)},${quote(role==='owner'?'owner':role==='admin'?'admin':'member')},${quote(role==='owner'?'company_owner':role==='admin'?'admin':'member')},${role==='applicant'?'NULL':quote(team)})`);
 }
 save('synthetic-credentials.private.json',{actors,password});
 const account=randomUUID();sql(`INSERT INTO public.accounts(id,profile_id,name,content_direction) VALUES(${quote(account)},${quote(actors.member.id)},'Synthetic UI account','Synthetic'); INSERT INTO public.daily_reports(user_id,account_id,report_date,title,submitter,play_count) VALUES(${quote(actors.member.id)},${quote(account)},'2026-11-01','Synthetic UI report','Synthetic',321); INSERT INTO public.remind_logs(user_id,target_date,status) VALUES(${quote(actors.member.id)},'2026-11-01','success');`);
 const safeEnv={PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,NODE_ENV:'development',NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_SUPABASE_URL:keys.API_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY:keys.ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:keys.SERVICE_ROLE_KEY,DYDATA_BACKEND:'supabase',NEXT_PUBLIC_DYDATA_BACKEND:'supabase'};
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','-p','3389'],{cwd:app,env:safeEnv,stdio:['ignore','pipe','pipe']});const log=createWriteStream(output+'/server.private.log',{mode:0o600});server.stdout.pipe(log);server.stderr.pipe(log);
 let ready=false;for(let i=0;i<90;i++){try{const r=await fetch('http://127.0.0.1:3389/login');if(r.status===200){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}assert(ready,'Local app did not start');
 browser=await chromium.launch({headless:true});
 const baselines={};
 for(const phase of ['before','after']){
  if(phase==='after'){sql(buildApply(original));sql("NOTIFY pgrst,'reload schema'");}
  for(const role of ['member','admin','owner']){
   const context=await browser.newContext();const page=await context.newPage();const errors=[],external=[];
   await context.route('**/*',route=>{const host=new URL(route.request().url()).hostname;if(!['127.0.0.1','localhost'].includes(host)){external.push(route.request().url());return route.abort();}return route.continue();});
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:3389/login');await page.getByLabel('邮箱',{exact:true}).fill(actors[role].email);await page.getByLabel('密码',{exact:true}).fill(password);await page.getByRole('button',{name:'登录',exact:true}).click();await page.waitForURL(u=>!u.pathname.startsWith('/login'),{timeout:60000});
   for(const path of ['/dashboard','/admin/modules']){const r=await page.goto('http://127.0.0.1:3389'+path);assert(r&&r.status()<400,`${phase}/${role}/${path}`);await page.locator('body').innerText();assert(!new URL(page.url()).pathname.startsWith('/login'));records.push({phase,role,path,status:r.status(),finalPath:new URL(page.url()).pathname});}
   const results={};for(const path of ['/api/remind/count?date=2026-11-01','/api/dashboard/leaderboard']){const r=await context.request.get('http://127.0.0.1:3389'+path);assert.equal(r.status(),200);results[path]=await r.json();records.push({phase,role,path,status:r.status(),data:results[path]});}
   if(phase==='before'){baselines[role]=results;assert.equal(results['/api/dashboard/leaderboard'].leaderboardData.length,1,'Nonempty old session-client leaderboard required');}
   else assert.deepEqual(results,baselines[role],`${role}: existing app results changed`);
   if(phase==='after'&&role==='admin'){
    const id=randomUUID();sql(`INSERT INTO public.team_join_requests(id,applicant_user_id,target_team_id) VALUES(${quote(id)},${quote(actors.applicant.id)},${quote(team)})`);
    await page.goto('http://127.0.0.1:3389/admin/modules');await page.getByRole('button',{name:'同意入团',exact:true}).click();
    let approved=false;for(let i=0;i<60;i++){if(sql(`SELECT status FROM public.team_join_requests WHERE id=${quote(id)}`)==='approved'){approved=true;break;}await new Promise(r=>setTimeout(r,200));}assert(approved,'Real member-management approval failed');assert.equal(sql(`SELECT team_id FROM public.profiles WHERE id=${quote(actors.applicant.id)}`),team);await page.reload();await page.getByText('Synthetic UI applicant',{exact:true}).waitFor({state:'visible'});records.push({phase,role,path:'/admin/modules',interaction:'approve first join',databaseStatus:'approved',teamMatched:true,newMemberVisibleAfterReload:true});
   }
   save(`${phase}-${role}-console.json`,errors);assert.deepEqual(errors,[]);save(`${phase}-${role}-external-blocked.json`,external);assert.deepEqual(external,[],'Browser attempted nonlocal traffic');
   await page.screenshot({path:output+`/${phase}-${role}.png`,fullPage:true});await context.close();
  }
 }
 sql(buildRollback(original,snapshot()));assert.deepEqual(snapshot(),original);
 // Entire NEW local project is synthetic-only, asserted empty before setup.
 sql("DO $c$ DECLARE r record; BEGIN FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP EXECUTE format('TRUNCATE public.%I CASCADE',r.tablename); END LOOP; END $c$;");
 for(const a of Object.values(actors))await request('/auth/v1/admin/users/'+a.id,undefined,'DELETE');assert.equal(sql('SELECT count(*) FROM auth.users'),'0');assert.deepEqual(snapshot(),original);
 save('summary.json',{status:'PASS',project,output,batch:'A',productionAccessed:false,appSource:process.env.DYDATA_BATCH_A_APP_SHA,roles:3,phases:2,records,cleanup:true});console.log(JSON.stringify({status:'PASS',output,records:records.length}));
}catch(e){save('failure.json',{message:e.message,stack:e.stack});save('records.json',records);console.error(JSON.stringify({status:'FAIL',output,message:e.message}));process.exitCode=1;}
finally{await browser?.close();server?.kill('SIGTERM');}
