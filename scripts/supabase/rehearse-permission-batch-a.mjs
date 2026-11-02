// This runner has no remote database mode. Auth/RPC requests are loopback only.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID, randomBytes } from 'node:crypto';
import { targets, snapshotQuery, emptyDatabaseAssertion, quote, buildApply, buildRollback } from './permission-batch-a.mjs';
const directory = process.env.DYDATA_BATCH_A_LOCAL_DIR;
assert(directory && directory.startsWith('/tmp/dydata-supabase-batch-a-'), 'Explicit private local rehearsal directory required');
const cfg = readFileSync(`${directory}/supabase/config.toml`,'utf8');
const project = cfg.match(/^project_id = "([^"]+)"/m)?.[1];
assert.match(project,/^dydata-supabase-batch-a-[a-z0-9-]+$/);
const container = `supabase_db_${project}`;
const keys = JSON.parse(execFileSync('supabase',['status','--workdir',directory,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
const url = new URL(keys.API_URL);
assert(['127.0.0.1','localhost'].includes(url.hostname) && url.protocol==='http:','Loopback HTTP only');
const output = `${directory}/evidence-${Date.now()}`; mkdirSync(output,{mode:0o700});
const records=[]; let stage='setup';
const save=(name,obj)=>writeFileSync(`${output}/${name}`,JSON.stringify(obj,null,2),{mode:0o600});
function sql(text) {return execFileSync('docker',['exec','-i',container,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-XAtq'],{input:text,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();}
const query=text=>JSON.parse(sql(text));
const snapshot=()=>query(snapshotQuery);
const dataDigest=()=>query(`SELECT jsonb_object_agg(name,digest) FROM (SELECT tablename name,query_to_xml(format('select md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,''[]'')) as digest from public.%I t',tablename),false,true,'')::text digest FROM pg_tables WHERE schemaname='public') s;`);
function runSql(name,text,expectedFailure=false){
 writeFileSync(`${output}/${name}.sql`,text,{mode:0o600});
 let failure;try{sql(text);}catch(e){failure=e;save(`${name}.error.json`,{message:String(e.stderr||e.message)});}
 if(expectedFailure)assert(failure,`${name} unexpectedly committed`);else if(failure)throw failure;
 records.push({stage,name,status:'PASS',...(expectedFailure?{expectedFailure:true}:{})});
}
async function http(actor,path,{method='GET',body,prefer}={}){
 const token=actor==='service'?keys.SERVICE_ROLE_KEY:actor==='anon'?null:actors[actor]?.token;
 assert(actor==='anon'||token,`Missing real credential: ${actor}`);
 const response=await fetch(new URL(path,url),{method,headers:{apikey:actor==='service'?keys.SERVICE_ROLE_KEY:keys.ANON_KEY,...(token?{Authorization:`Bearer ${token}`}:{ }),'content-type':'application/json',...(prefer?{Prefer:prefer}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const raw=await response.text();let data;try{data=JSON.parse(raw);}catch{data=raw;}
 records.push({stage,actor,method,path,status:response.status,...(response.ok?{}:{code:data?.code,message:data?.message})});
 return {status:response.status,data,ok:response.ok};
}
const rpc=(actor,name,body={})=>http(actor,`/rest/v1/rpc/${name}`,{method:'POST',body});
const table=(actor,name,options={})=>http(actor,`/rest/v1/${name}`,options);
const ok=r=>{assert(r.ok,JSON.stringify(r));return r.data;};
const denied=r=>{assert([401,403].includes(r.status),JSON.stringify(r));assert.equal(r.data.code,'42501');};
const actors={};const pass=randomBytes(28).toString('base64url')+'Aa1!';
const teamA=randomUUID(),teamB=randomUUID();
function asService(text){sql(`BEGIN; SELECT set_config('request.jwt.claims','{"role":"service_role"}',true); ${text}; COMMIT;`);}
function profile(actor,changes){asService(`UPDATE public.profiles SET ${Object.entries(changes).map(([k,v])=>`"${k}"=${v===null?'NULL':quote(v)}`).join(',')} WHERE id=${quote(actors[actor].id)}::uuid`);}
async function identity(name,role='member',team=teamA,membership='active',legacy={}){
 const email=`batch-a-${name}@example.test`;
 const created=ok(await http('service','/auth/v1/admin/users',{method:'POST',body:{email,password:pass,email_confirm:true,user_metadata:{full_name:name}}}));
 actors[name]={id:created.id,email,role};
 sql(`INSERT INTO public.profiles(id,name,role,company_role,team_id,membership_status,permissions) VALUES(${quote(created.id)},${quote(name)},${quote(role==='company_owner'?'owner':role)},${quote(role)},${team?quote(team):'NULL'},${quote(membership)},${quote(JSON.stringify(legacy))}::jsonb)`);
 const logged=await fetch(new URL('/auth/v1/token?grant_type=password',url),{method:'POST',headers:{apikey:keys.ANON_KEY,'content-type':'application/json'},body:JSON.stringify({email,password:pass})});
 const session=await logged.json();assert.equal(logged.status,200);actors[name].token=session.access_token;
 const verified=ok(await http(name,'/auth/v1/user'));assert.equal(verified.id,created.id);
}
async function test(name,fn,{red=false}={}){
 let failure;
 try{await fn();}catch(e){failure=e;}
 if(red){assert(failure,`${name}: expected pre-fix failure but passed`);records.push({stage,name,status:'EXPECTED_PRE_FIX_FAILURE',error:failure.message});}
 else if(failure){records.push({stage,name,status:'FAIL',error:failure.message});throw failure;}
 else records.push({stage,name,status:'PASS'});
 save('requests-and-assertions.json',records);
}
function selectOne(table,id){return query(`SELECT to_jsonb(t) FROM public.${table} t WHERE id=${quote(id)}::uuid`);}
const seedCase=(id,who='member',status='verified')=>sql(`INSERT INTO public.violation_cases(id,submitted_by,script_text,status,team_id) VALUES(${quote(id)},${quote(actors[who].id)},${quote('synthetic '+id)},${quote(status)},${quote(teamA)})`);
let original;
try{
 sql(emptyDatabaseAssertion);
 assert.equal(sql('SELECT count(*) FROM auth.users'),'0','Fresh synthetic-only Auth database required');
 original=snapshot();save('original-metadata.json',original);
 const inventory=query(`SELECT jsonb_build_object('version',version(),'tables',(SELECT count(*) FROM pg_tables WHERE schemaname='public'),'policies',(SELECT count(*) FROM pg_policies WHERE schemaname='public'),'triggers',(SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal),'auth_uid',pg_get_functiondef('auth.uid()'::regprocedure),'auth_role',pg_get_functiondef('auth.role()'::regprocedure),'auth_jwt',pg_get_functiondef('auth.jwt()'::regprocedure),'images',null)`);
 assert.equal(inventory.tables,99);assert.equal(inventory.policies,240);assert.equal(inventory.triggers,24);save('inventory.json',inventory);
 sql(`INSERT INTO public.teams(id,name) VALUES(${quote(teamA)},'synthetic A'),(${quote(teamB)},'synthetic B')`);
 for(const args of [['member'],['other'],['admin','admin'],['owner','company_owner'],['foreignAdmin','admin',teamB],['archivedAdmin','admin',teamA,'archived',{manage_violations:true}],['archivedOwner','company_owner',teamA,'archived'],['applicant','member',null],['pendingAdmin','admin',null],['archivedApplicant','member',null,'archived']])await identity(...args);
 save('synthetic-credentials.private.json',{actors,password:pass});
 sql(`INSERT INTO public.remind_logs(user_id,target_date,status) VALUES (${quote(actors.member.id)},'2026-10-25','success'),(${quote(actors.member.id)},'2026-10-26','success'),(${quote(actors.member.id)},'2026-11-01','success'),(${quote(actors.member.id)},'2026-11-02','success')`);
 const remind={p_user_id:actors.member.id,p_target_date:'2026-11-01',p_days:7};
 const leaderboardBefore={};
 const leaderboardAccount=randomUUID();sql(`INSERT INTO public.accounts(id,profile_id,name,content_direction) VALUES(${quote(leaderboardAccount)},${quote(actors.member.id)},'Synthetic leaderboard','Synthetic'); INSERT INTO public.daily_reports(user_id,account_id,report_date,title,submitter,play_count,likes) VALUES(${quote(actors.member.id)},${quote(leaderboardAccount)},'2026-11-01','Synthetic daily','Synthetic',123,4)`);
 for(const actor of ['member','admin','owner']){leaderboardBefore[actor]=ok(await rpc(actor,'get_leaderboard_rows',{since_date:'2026-11-01'}));assert.equal(leaderboardBefore[actor].length,1);}
 stage='before';
 await test('RED reminder cannot query another employee',async()=>denied(await rpc('other','count_remind_logs_for_user',remind)),{red:true});
 await test('RED archived legacy owner is not authorized',async()=>assert.equal(ok(await rpc('archivedOwner','has_violation_permission')),false),{red:true});
 await test('RED fixed-role admin does not need editable legacy permission JSON',async()=>assert.equal(ok(await rpc('admin','has_violation_permission')),true),{red:true});
 await test('RED archived owner cannot archive AI config',async()=>denied(await rpc('archivedOwner','manage_ai_feature_lifecycle',{p_feature_key:'content_tools',p_label:'Synthetic',p_action:'archive'})),{red:true});
 // Remove only the preceding synthetic AI mutation, never production data.
 sql("DELETE FROM public.ai_feature_config_archives; DELETE FROM public.ai_feature_bindings; DELETE FROM public.ai_feature_config;");
 stage='transaction';
 const beforeData=dataDigest();const apply=buildApply(original);
 runSql('injected-failure',apply.replace(/COMMIT;\s*$/,"SELECT 1/0;\nCOMMIT;"),true);
 assert.deepEqual(snapshot(),original);assert.deepEqual(dataDigest(),beforeData);
 // Metadata drift is a hard failure even if every target still exists.
 sql("ALTER FUNCTION public.has_violation_permission() SET statement_timeout='4999ms'");
 const drifted=snapshot();runSql('reject-metadata-drift',apply,true);assert.deepEqual(snapshot(),drifted);
 sql(original.functions.find(f=>f.signature==='public.has_violation_permission()').definition+';');assert.deepEqual(snapshot(),original);
 runSql('batch-a-apply',apply);const applied=snapshot();save('applied-metadata.json',applied);assert.deepEqual(dataDigest(),beforeData);
 sql("NOTIFY pgrst,'reload schema'");
 stage='after';
 // PostgREST reconnects after a transactional schema replacement; retry only cache readiness.
 for(let i=0;i<20;i++){const r=await rpc('member','count_remind_logs_for_user',remind);if(r.ok){assert.equal(r.data,2);break;}if(i===19)throw new Error('REST schema cache not ready');await new Promise(r=>setTimeout(r,100));}
 await test('reminder preserves exact 7-day count and self-only scope',async()=>{assert.equal(ok(await rpc('member','count_remind_logs_for_user',remind)),2);denied(await rpc('other','count_remind_logs_for_user',remind));assert.equal(ok(await rpc('service','count_remind_logs_for_user',remind)),2);assert.equal(ok(await rpc('admin','count_remind_logs_for_user',{...remind,p_user_id:actors.admin.id})),0);denied(await rpc('archivedOwner','count_remind_logs_for_user',{...remind,p_user_id:actors.archivedOwner.id}));});
 await test('legacy violation helper uses active fixed roles',async()=>{for(const [actor,want] of [['member',false],['admin',true],['owner',true],['archivedOwner',false],['archivedAdmin',false]])assert.equal(ok(await rpc(actor,'has_violation_permission')),want);denied(await rpc('anon','has_violation_permission'));});
 const request=async(applicant,target=teamA,status='pending')=>{const id=randomUUID();sql(`INSERT INTO public.team_join_requests(id,applicant_user_id,target_team_id,status) VALUES(${quote(id)},${quote(actors[applicant].id)},${quote(target)},${quote(status)})`);return id;};
 const removeRequest=id=>sql(`DELETE FROM public.team_join_requests WHERE id=${quote(id)}`);
 await test('join rejection cases change neither request nor applicant',async()=>{
  for(const [reviewer,applicant,target,action,status] of [['member','applicant',teamA,'approve','pending'],['foreignAdmin','applicant',teamA,'approve','pending'],['admin','admin',teamA,'approve','pending'],['admin','archivedApplicant',teamA,'approve','pending'],['admin','member',teamA,'approve','pending'],['admin','pendingAdmin',teamA,'approve','pending'],['owner','pendingAdmin',teamA,'approve','pending'],['archivedAdmin','applicant',teamA,'approve','pending'],['archivedOwner','applicant',teamA,'approve','pending'],['admin','applicant',teamA,null,'pending'],['admin','applicant',teamA,'unknown','pending'],['admin','applicant',teamA,'approve','rejected']]){
   const id=await request(applicant,target,status);const before=selectOne('team_join_requests',id);const p=selectOne('profiles',actors[applicant].id);
   const r=ok(await rpc(reviewer,'review_team_join_request',{p_request_id:id,p_action:action,p_note:'synthetic'}));assert.equal(r.ok,false);assert.deepEqual(selectOne('team_join_requests',id),before);assert.deepEqual(selectOne('profiles',actors[applicant].id),p);removeRequest(id);
  }
  // Existing foreign team: only member management may ever transfer membership.
  profile('applicant',{team_id:teamB});const id=await request('applicant');assert.equal(ok(await rpc('owner','review_team_join_request',{p_request_id:id,p_action:'approve'})).ok,false);assert.equal(selectOne('profiles',actors.applicant.id).team_id,teamB);removeRequest(id);profile('applicant',{team_id:null});
 });
 await test('admin and owner can approve/reject a first-join active member',async()=>{
  for(const reviewer of ['admin','owner']){const id=await request('applicant');const r=ok(await rpc(reviewer,'review_team_join_request',{p_request_id:id,p_action:'approve',p_note:'Synthetic approved'}));assert.equal(r.ok,true);const after=selectOne('team_join_requests',id);assert.equal(after.status,'approved');assert.equal(after.reviewed_by,actors[reviewer].id);assert(after.reviewed_at);assert.equal(after.review_note,'Synthetic approved');assert.equal(selectOne('profiles',actors.applicant.id).team_id,teamA);assert.equal(ok(await rpc(reviewer,'review_team_join_request',{p_request_id:id,p_action:'approve'})).ok,false);removeRequest(id);profile('applicant',{team_id:null});
   const rejected=await request('applicant');assert.equal(ok(await rpc(reviewer,'review_team_join_request',{p_request_id:rejected,p_action:'reject'})).status,'rejected');assert.equal(selectOne('profiles',actors.applicant.id).team_id,null);removeRequest(rejected);}
 });
 const ai={p_feature_key:'content_tools',p_label:'Synthetic tool',p_action:'archive'};
 sql("INSERT INTO public.ai_feature_bindings(feature_key,label,is_enabled) VALUES('content_tools','Synthetic tool',false); INSERT INTO public.ai_feature_config(feature_key,label,is_enabled) VALUES('content_tools','Synthetic tool',true)");
 await test('AI lifecycle rejects unauthorized actors and invalid arguments without writes',async()=>{
  for(const actor of ['member','admin','archivedOwner','archivedAdmin']){const before=dataDigest();denied(await rpc(actor,'manage_ai_feature_lifecycle',ai));assert.deepEqual(dataDigest(),before);}
  for(const body of [{...ai,p_action:null},{...ai,p_action:'drop'},{...ai,p_feature_key:null},{...ai,p_feature_key:'unknown'},{...ai,p_label:'  '}]){const before=dataDigest();const r=await rpc('owner','manage_ai_feature_lifecycle',body);assert.equal(r.ok,false);assert.equal(r.data.code,'P0001');assert.deepEqual(dataDigest(),before);}
 });
 await test('owner/service AI archive/restore preserves states, snapshots and lock behavior',async()=>{
  ok(await rpc('owner','manage_ai_feature_lifecycle',ai));assert.equal(sql("SELECT count(*) FROM public.ai_feature_config_archives"),'2');
  assert.equal(sql("SELECT lifecycle_state||':'||is_enabled FROM public.ai_feature_bindings WHERE feature_key='content_tools'"),'archived:false');
  ok(await rpc('owner','manage_ai_feature_lifecycle',ai));assert.equal(sql("SELECT count(*) FROM public.ai_feature_config_archives"),'2');
  ok(await rpc('owner','manage_ai_feature_lifecycle',{...ai,p_action:'restore'}));assert.equal(sql("SELECT lifecycle_state||':'||is_enabled FROM public.ai_feature_bindings WHERE feature_key='content_tools'"),'active:false');assert.equal(sql("SELECT lifecycle_state||':'||is_enabled FROM public.ai_feature_config WHERE feature_key='content_tools'"),'active:true');
  ok(await rpc('service','manage_ai_feature_lifecycle',ai));ok(await rpc('service','manage_ai_feature_lifecycle',{...ai,p_action:'restore'}));
  const lock=spawn('docker',['exec','-i',container,'psql','-U','postgres','-XAtq'],{stdio:['pipe','pipe','pipe']});
  lock.stdin.end("BEGIN; SELECT pg_advisory_xact_lock(hashtext('content_tools')); SELECT 'LOCKED'; SELECT pg_sleep(1.5); COMMIT;");
  await new Promise((resolve,reject)=>{lock.stdout.on('data',b=>{if(b.toString().includes('LOCKED'))resolve();});lock.on('error',reject);});
  const started=Date.now();ok(await rpc('owner','manage_ai_feature_lifecycle',ai));const elapsed=Date.now()-started;assert(elapsed>1000,'Expected advisory lock serialization');save('ai-lock.json',{elapsedMs:elapsed,minimumRequiredMs:1000});

 });
 const caseA=randomUUID(),caseB=randomUUID(),usageA=randomUUID(),usageB=randomUUID();seedCase(caseA);seedCase(caseB);
 await test('script-usage trigger works after API revocation on insert/update/move/delete',async()=>{
  ok(await table('member','script_usage_records',{method:'POST',body:{id:usageA,case_id:caseA,recorded_by:actors.member.id,used_at:'2026-11-01',views:100,follows:10,source:'manual'}}));
  ok(await table('member','script_usage_records',{method:'POST',body:{id:usageB,case_id:caseA,recorded_by:actors.member.id,used_at:'2026-11-01',views:10,follows:5,source:'manual'}}));
  const sums=(id,views,follows,count,rate)=>{const v=selectOne('violation_cases',id);assert.equal(v.total_views,views);assert.equal(v.total_follows,follows);assert.equal(v.usage_count,count);if(rate===null)assert.equal(v.weighted_conversion_rate,null);else assert(Math.abs(v.weighted_conversion_rate-rate)<1e-8);};
  sums(caseA,110,15,2,15/110);
  ok(await table('admin',`script_usage_records?id=eq.${usageA}`,{method:'PATCH',body:{views:200},prefer:'return=representation'}));sums(caseA,210,15,2,15/210);
  ok(await table('admin',`script_usage_records?id=eq.${usageA}`,{method:'PATCH',body:{case_id:caseB},prefer:'return=representation'}));sums(caseA,10,5,1,.5);sums(caseB,200,10,1,.05);
  ok(await table('admin',`script_usage_records?id=eq.${usageA}`,{method:'DELETE'}));ok(await table('admin',`script_usage_records?id=eq.${usageB}`,{method:'DELETE'}));sums(caseA,0,0,0,null);sums(caseB,0,0,0,null);
 });
 await test('message insert trigger updates its conversation after API revocation',async()=>{
  const conversation=randomUUID(),message=randomUUID();
  ok(await table('member','rewrite_conversations',{method:'POST',body:{id:conversation,user_id:actors.member.id,title:'Synthetic',last_message_at:'2020-01-01T00:00:00Z'}}));
  ok(await table('member','rewrite_messages',{method:'POST',body:{id:message,conversation_id:conversation,user_id:actors.member.id,role:'user',content:'Synthetic local message',created_at:'2026-11-01T04:05:06Z'}}));
  assert.equal(new Date(selectOne('rewrite_conversations',conversation).last_message_at).toISOString(),'2026-11-01T04:05:06.000Z');
  assert(new Date(selectOne('rewrite_conversations',conversation).updated_at)>new Date('2020-01-01'));
 });
 const account=randomUUID(),event=randomUUID(),decision=randomUUID(),tag=randomUUID();
 sql(`INSERT INTO public.accounts(id,profile_id,name) VALUES(${quote(account)},${quote(actors.member.id)},'Synthetic account'); INSERT INTO public.violation_events(id,account_id,event_type,occurred_at,reported_by) VALUES(${quote(event)},${quote(account)},'其他',now(),${quote(actors.member.id)}); INSERT INTO public.weekly_decisions(id,week_start) VALUES(${quote(decision)},'2026-10-26'); INSERT INTO public.violation_reason_tags(id,name) VALUES(${quote(tag)},'Synthetic tag'); INSERT INTO public.violation_case_reason_tags(case_id,tag_id) VALUES(${quote(caseA)},${quote(tag)}); INSERT INTO public.script_purposes(key,label) VALUES('synthetic_batch_a','Synthetic purpose'); INSERT INTO public.script_usage_records(id,case_id,recorded_by,used_at,views,follows) VALUES(${quote(usageA)},${quote(caseA)},${quote(actors.member.id)},'2026-11-01',100,10);`);
 const rls=[['script_usage_records',`id=eq.${usageA}`,{note:'Authorized'},{note:'Unauthorized'}],['violation_events',`id=eq.${event}`,{note:'Authorized'},{note:'Unauthorized'}],['weekly_decisions',`id=eq.${decision}`,{generated_by:'manual'},{generated_by:'ai'}],['violation_case_reason_tags',`case_id=eq.${caseA}&tag_id=eq.${tag}`,null,null],['violation_reason_tags',`id=eq.${tag}`,{name:'Authorized tag'},{name:'Unauthorized tag'}],['script_purposes','key=eq.synthetic_batch_a',{label:'Authorized purpose'},{label:'Unauthorized purpose'}],['violation_cases',`id=eq.${caseA}`,{admin_conclusion:'Authorized'},{admin_conclusion:'Unauthorized'}]];
 await test('all seven legacy RLS tables retain allowed paths and deny archived writes',async()=>{
  for(const [name,filter,positive,negative] of rls){
   const rows=ok(await table('admin',`${name}?${filter}`));assert.equal(rows.length,1,`${name}: admin SELECT`);
   const before=dataDigest();
   const bad=await table('archivedAdmin',`${name}?${filter}`,{method:'PATCH',body:negative||{case_id:caseA},prefer:'return=representation'});
   if(bad.ok)assert.deepEqual(bad.data,[]);else denied(bad);
   assert.deepEqual(dataDigest(),before,`${name}: archived write changed rows`);
   const good=await table('admin',`${name}?${filter}`,{method:'PATCH',body:positive||{case_id:caseA},prefer:'return=representation'});assert.equal(ok(good).length,1,`${name}: admin UPDATE`);
  }
 });
 await test('seven legacy RLS DELETE policies permit admin and reject archived admin',async()=>{
  // Exact synthetic keys only; linking rows before their parents.
  for(const [name,filter] of [rls[3],rls[0],rls[1],rls[2],rls[4],rls[5],rls[6]]){
   const before=dataDigest();const bad=await table('archivedAdmin',`${name}?${filter}`,{method:'DELETE',prefer:'return=representation'});if(bad.ok)assert.deepEqual(bad.data,[]);else denied(bad);assert.deepEqual(dataDigest(),before);
   assert.equal(ok(await table('admin',`${name}?${filter}`,{method:'DELETE',prefer:'return=representation'})).length,1,`${name}: admin DELETE`);
  }
 });
 const functions=query(`SELECT jsonb_agg(jsonb_build_object('name',p.proname,'returns_trigger',p.prorettype='trigger'::regtype,'names',p.proargnames[1:p.pronargs],'types',(SELECT jsonb_agg(t::regtype::text ORDER BY ord) FROM unnest(p.proargtypes) WITH ORDINALITY a(t,ord)))) FROM pg_proc p WHERE p.oid IN (${targets.map(t=>`${quote(t.signature)}::regprocedure`).join(',')})`);
 const argsFor=f=>Object.fromEntries((f.names||[]).map((name,i)=>[name,f.types[i]==='uuid'?actors.member.id:f.types[i]==='uuid[]'?[actors.member.id]:f.types[i]==='date'?'2026-11-01':f.types[i]==='integer'?1:f.types[i]==='boolean'?false:null]));
 await test('31 ACL targets and real gateway denial results match batch A',async()=>{
  let gatewayDenied=0,triggerNotExposed=0,serviceOnlyDenied=0;
  for(const f of functions){const r=await rpc('anon',f.name,argsFor(f));if(f.returns_trigger){assert.equal(r.status,404);assert.equal(r.data.code,'PGRST202');triggerNotExposed++;}else{denied(r);gatewayDenied++;}
   if(targets.find(t=>t.signature.startsWith(`public.${f.name}(`)).access==='S'){denied(await rpc('member',f.name,argsFor(f)));serviceOnlyDenied++;}}
  assert.equal(gatewayDenied,29);assert.equal(triggerNotExposed,2);assert.equal(serviceOnlyDenied,15);
  save('acl-gateway-summary.json',{targets:31,anonGatewayDenied:gatewayDenied,triggerNotExposed,authenticatedServiceOnlyDenied:serviceOnlyDenied,triggerPermissionProof:'Catalog EXECUTE=false, 404 is structural and not counted as privilege denial'});
 });
 await test('remaining employee read RPC entrypoints preserve legitimate identity scope',async()=>{
  for(const name of ['case_library_actor_scope','case_library_inbox','case_library_inbox_counts','case_library_processed','publish_draft_actor_scope','publish_drafts_review_queue']){const f=functions.find(f=>f.name===name);ok(await rpc('member',name,argsFor(f)));}
 });
 // Re-run an old session-client leaderboard path: no B adaptation or service-only assumption.
 await test('leaderboard keeps session access for member/admin/owner',async()=>{
  for(const actor of ['member','admin','owner']){const f=functions.find(f=>f.name==='get_leaderboard_rows');const r=await rpc(actor,f.name,argsFor(f));ok(r);assert.deepEqual(r.data,leaderboardBefore[actor]);save(`leaderboard-${actor}.json`,r.data);}
 });
 stage='rollback';
 const dataBeforeRollback=dataDigest();const rollback=buildRollback(original,snapshot());
 runSql('batch-a-rollback',rollback);assert.deepEqual(snapshot(),original);assert.deepEqual(dataDigest(),dataBeforeRollback);
 records.push({stage,name:'exact definition/ACL/config/owner/dependency restore with zero data changes',status:'PASS'});
 // An unchanged old snapshot can apply again; no migration history or drift relaxation.
 runSql('batch-a-repeat-apply',buildApply(original));assert.deepEqual(snapshot(),applied);
 runSql('batch-a-final-rollback',buildRollback(original,snapshot()));assert.deepEqual(snapshot(),original);
 stage='cleanup';
 // This is a newly created whole local project containing only generated synthetic rows.
 // Keep the environment and logs for review; remove synthetic business rows before Auth users.
 sql(`DO $clean$ DECLARE r record; BEGIN FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP EXECUTE format('TRUNCATE TABLE public.%I CASCADE',r.tablename); END LOOP; END $clean$;`);
 for(const a of Object.values(actors))ok(await http('service',`/auth/v1/admin/users/${a.id}`,{method:'DELETE'}));
 assert.equal(sql('SELECT count(*) FROM auth.users'),'0');assert.deepEqual(snapshot(),original);
 runSql('cleanup-hard-assert',`DO $assert_empty$ DECLARE r record; n bigint; BEGIN FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP EXECUTE format('SELECT count(*) FROM public.%I',r.tablename) INTO n; IF n<>0 THEN RAISE EXCEPTION 'Synthetic rows remain in %',r.tablename; END IF; END LOOP; END $assert_empty$;`);
 save('summary.json',{status:'PASS',project,api:url.origin,output,productionAccessed:false,identitiesCreated:Object.keys(actors).length,originalIdentities:0,remainingIdentities:0,restoredOriginalFunctions:true,batch:'A',classes:{R:11,S:15,O:5},assertions:records.filter(r=>r.name),hostedProductionTested:false,supabaseAuthAndGatewayVerified:true});
 console.log(JSON.stringify({status:'PASS',output,assertions:records.filter(r=>r.name).length}));
}catch(e){save('failure.json',{stage,message:e.message,stack:e.stack});console.error(JSON.stringify({status:'FAIL',stage,output,message:e.message}));process.exitCode=1;}
finally{save('requests-and-assertions.json',records);}
