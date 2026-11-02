import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execute, quote, uuid, readManifest, manifestPath, ENV_ID } from './permission-fixtures.mjs';
import { buildWriteFixtures } from './write-fixtures.mjs';

const PREFIX='dydata-permission-v2-b05';
const HELPER='dydata_b05_private_probe_v2';
const fail=(condition,message)=>{if(!condition)throw new Error(message);};
const ident=value=>{fail(/^[a-z][a-z0-9_]*$/.test(value),'Unsafe acceptance identifier');return `"${value}"`;};
const json=value=>quote(JSON.stringify(value));
const keyWhere=key=>Object.entries(key).map(([k,v])=>`${ident(k)}=${quote(v)}`).join(' AND ');
const privatePath=()=>join(dirname(manifestPath()),'write-fixtures.json');
const readJournal=()=>JSON.parse(readFileSync(privatePath(),'utf8'));
const save=journal=>writeFileSync(privatePath(),JSON.stringify(journal),{mode:0o600});
function record(field,value){const journal=readJournal();journal[field]??=[];journal[field].push(value);save(journal);}
const same=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
export function validateWriteFixtures(fixtures){
  fail(Array.isArray(fixtures)&&fixtures.length>=80&&fixtures.length<=100,'B05 fixture inventory is incomplete');
  const seen=new Set();
  for(const fixture of fixtures){
    ident(fixture.table);fail(!seen.has(fixture.table),'Duplicate table fixture');seen.add(fixture.table);
    fail(fixture.key&&Object.keys(fixture.key).length>0&&fixture.insert&&(fixture.support||(fixture.patch&&Object.keys(fixture.patch).length>0)),'Missing fixture key/payload/patch');
    for(const [key,value]of Object.entries(fixture.key)){
      ident(key);fail(Object.hasOwn(fixture.insert,key)&&String(fixture.insert[key])===String(value),'Fixture key/payload mismatch');
      fail(typeof value==='string'&&(value.startsWith('f0cba501-2026-4111-a001-')||value.startsWith(PREFIX)||/^-62026\d+$/.test(value)),'Fixture key outside synthetic namespace');
    }
    for(const [key,value]of Object.entries(fixture.patch??{})){
      ident(key);if(Object.hasOwn(fixture.key,key))fail(value===fixture.key[key],'Acceptance must not move a composite primary key');
    }
    for(const key of Object.keys(fixture.insert))ident(key);
  }
  return fixtures;
}
export function insertSql(fixture){
  const columns=Object.keys(fixture.insert).map(ident).join(',');
  return `INSERT INTO public.${ident(fixture.table)} (${columns}) ${fixture.table==='usage_events'?'OVERRIDING SYSTEM VALUE ':''}SELECT ${columns} FROM jsonb_populate_record(NULL::public.${ident(fixture.table)},${json(fixture.insert)}::jsonb);`;
}
function snapshotSelect(fixture){
  return `SELECT ${quote(fixture.table)} AS table_name,count(*)::text AS count,min(md5(to_jsonb(t)::text)) AS digest,min(t.xmin::text) AS version FROM public.${ident(fixture.table)} t WHERE ${keyWhere(fixture.key)}`;
}
async function snapshots(fixtures){return execute(fixtures.map(snapshotSelect).join(' UNION ALL '));}
async function publicSnapshot(){
  const catalog=await execute(`SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname`);
  fail(catalog.rows.length===99,'Public table catalog changed; stop B05');
  const result=await execute(catalog.rows.map(({name})=>`SELECT ${quote(name)} AS table_name,count(*)::text AS count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) AS digest FROM public.${ident(name)} t`).join(' UNION ALL '));
  return {...result,rows:result.rows.sort((a,b)=>a.table_name.localeCompare(b.table_name))};
}
export function validateWriteJournal(journal){
  fail(journal.environment===ENV_ID&&journal.namespace===PREFIX,'Foreign write-fixture journal');
  validateWriteFixtures(journal.fixtures);
  fail(same(journal.fixtures,buildWriteFixtures()),'B05 canonical fixture list changed; do not reinterpret this recovery journal');
}
const parsedCode=body=>body&&typeof body==='object'?String(body.code??body.error?.code??''):'';
function permissionDenial(status,body,operation){
  if(status===401||status===403)return `http-${status}`;
  if(['42501','DATABASE_42501'].includes(parsedCode(body)))return 'postgres-42501';
  if(operation!=='insert'&&status===200&&Array.isArray(body)&&body.length===0)return 'rls-zero-rows';
  return null;
}
async function http(jwt,path,method,body,details){
  const startedAt=Date.now();record('attempts',{...details,startedAt,phase:'request-started'});
  try{
    const response=await fetch(`https://${ENV_ID}.api.tcloudbasegateway.com/v1/rdb/rest/${path}`,{method,headers:{authorization:`Bearer ${jwt}`,'content-type':'application/json',prefer:'return=representation'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});
    const text=await response.text();let payload;try{payload=JSON.parse(text);}catch{payload=null;}
    const receipt={...details,startedAt,finishedAt:Date.now(),httpStatus:response.status,code:parsedCode(payload),requestId:response.headers.get('x-request-id')??response.headers.get('x-tc-requestid')??null};
    record('responses',receipt);return {receipt,payload};
  }catch(error){record('errors',{...details,startedAt,finishedAt:Date.now(),phase:'http-or-response-body',requestId:null,message:String(error.message)});throw error;}
}
async function bounded(items,operation){
  // No cleanup starts until all in-flight requests settle, including a failed batch.
  for(let start=0;start<items.length;start+=4){
    const settled=await Promise.allSettled(items.slice(start,start+4).map(operation));
    const failure=settled.find(r=>r.status==='rejected');if(failure)throw failure.reason;
  }
}
function insertCandidate(fixture){
  if(fixture.existing)return {...fixture,key:{id:uuid(29999)},insert:{id:uuid(29999),name:`${PREFIX}-ungranted`,role:'member',company_role:'member'}};
  if(fixture.table==='usage_events'){
    const candidate={...fixture,key:{user_id:uuid(6),path:fixture.insert.path},insert:{...fixture.insert}};delete candidate.insert.id;return candidate;
  }
  return fixture;
}
async function rejectWrite(jwt,fixture,operation){
  const candidate=operation==='insert'?insertCandidate(fixture):fixture;
  const params=new URLSearchParams();if(operation!=='insert')for(const [key,value]of Object.entries(candidate.key))params.set(key,`eq.${value}`);
  const {receipt,payload}=await http(jwt,`${fixture.table}${params.size?'?'+params:''}`,{insert:'POST',update:'PATCH',delete:'DELETE'}[operation],operation==='delete'?undefined:operation==='insert'?candidate.insert:fixture.patch,{table:fixture.table,operation});
  const denial=permissionDenial(receipt.httpStatus,payload,operation);
  const result={...receipt,denial};record('probes',result);
  fail(denial,`B05 lacks an authorization rejection: ${fixture.table}/${operation} (${receipt.httpStatus}/${receipt.code})`);
  return result;
}
function ownershipCheck(fixture,owned){
  return `IF NOT EXISTS (SELECT 1 FROM public.${ident(fixture.table)} t WHERE ${keyWhere(fixture.key)} AND t.xmin::text=${quote(owned.version)} AND md5(to_jsonb(t)::text)=${quote(owned.digest)}) THEN RAISE EXCEPTION 'B05 ownership changed: ${fixture.table}'; END IF;`;
}
export async function recoverWriteFixtures(){
  if(!existsSync(privatePath()))return;
  const journal=readJournal();validateWriteJournal(journal);if(journal.cleaned)return;
  // Only ACKed insert transactions belong to this run. Unknown outcomes stay BLOCKED.
  const owned=journal.owned??{};
  const pending=journal.fixtures.filter(f=>!f.existing&&!owned[f.table]);
  if(pending.length){const state=await snapshots(pending);fail(state.rows.every(r=>r.count==='0'),'Unacknowledged occupied fixture; no destructive recovery');}
  // A rejected generated-id insert must leave no rows. Never delete by a nonunique key.
  const generated=await execute(`SELECT count(*)::text AS count FROM public.usage_events WHERE user_id=${quote(uuid(6))} AND path='/__fixture__/dydata-permission-v2-b05' AND id<>-620260001`);
  fail(generated.rows[0].count==='0','Unexpected generated-ID row; preserve evidence for exact-ID recovery');
  const auth=await execute(`SELECT status::text AS status,md5(to_jsonb(u)::text) AS digest,md5((to_jsonb(u)-'status')::text) AS nonstatus_digest FROM auth.users u WHERE sub=${quote(uuid(6))} AND username LIKE 'dydata-permission-v2-%'`);
  fail(auth.rows.length===1,'Synthetic recovery identity missing');
  if(!same(auth.rows[0],journal.authBefore)){
    fail(journal.authStatusTouched===true&&auth.rows[0].nonstatus_digest===journal.authBefore.nonstatus_digest&&auth.rows[0].status==='1','Unexpected synthetic identity mutation; no blind restoration');
    await setFixtureAuthStatus(Number(journal.authBefore.status));
  }
  const authAfter=await execute(`SELECT status::text AS status,md5(to_jsonb(u)::text) AS digest,md5((to_jsonb(u)-'status')::text) AS nonstatus_digest FROM auth.users u WHERE sub=${quote(uuid(6))} AND username LIKE 'dydata-permission-v2-%'`);
  fail(same(authAfter.rows,[journal.authBefore]),'Synthetic Auth baseline did not restore');
  journal.authVerification={protectedAndActivityDifferences:0,requestId:authAfter.requestId};save(journal);
  const ownedFixtures=journal.fixtures.filter(f=>!f.existing&&owned[f.table]);
  const helper=await helperCatalog();
  fail(helper.rows.length===0||(journal.helperOwnership&&same(helper.rows[0],journal.helperOwnership)),'Temporary helper ownership changed/unacknowledged; retain evidence');
  if(ownedFixtures.length||helper.rows.length){
    const checks=ownedFixtures.map(f=>`PERFORM 1 FROM public.${ident(f.table)} WHERE ${keyWhere(f.key)} FOR UPDATE; ${ownershipCheck(f,owned[f.table])}`).join('\n');
    const deletes=[...ownedFixtures].reverse().map(f=>`DELETE FROM public.${ident(f.table)} WHERE ${keyWhere(f.key)};`).join('\n');
    const helperCheck=helper.rows.length?`IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=${quote(journal.helperOwnership.oid)}::oid AND oid=to_regprocedure('public.${HELPER}(text)') AND proowner::regrole::text=${quote(journal.helperOwnership.owner)} AND proacl::text=${quote(journal.helperOwnership.acl)} AND prosrc=${quote(journal.helperOwnership.source)} AND NOT prosecdef) THEN RAISE EXCEPTION 'Temporary helper changed'; END IF; DROP FUNCTION public.${HELPER}(text);`:'';
    // All ownership checks, reverse deletes and temporary DDL share one transaction.
    const result=await execute(`DO $b05cleanup$ BEGIN ${helperCheck} ${checks} ${deletes} END $b05cleanup$;`);
    journal.cleanupRequestId=result.requestId;save(journal);
  }
  const zero=await snapshots(journal.fixtures.filter(f=>!f.existing));fail(zero.rows.every(r=>r.count==='0'),'B05 cleanup rows remain');
  const after=await publicSnapshot();journal.after=after;journal.zeroRequestId=zero.requestId;save(journal);
  fail(same(after.rows,journal.before.rows),'Non-fixture public data changed during B05; retain full journal');
  journal.cleaned=true;journal.finishedAt=new Date().toISOString();save(journal);
}
async function helperCatalog(){return execute(`SELECT oid::text AS oid,proowner::regrole::text AS owner,proacl::text AS acl,prosrc AS source,prosecdef::text AS definer FROM pg_proc WHERE oid=to_regprocedure('public.${HELPER}(text)')`);}
async function prepareHelper(){
  fail((await helperCatalog()).rows.length===0,'B05 temporary helper name is occupied');
  const source=` DECLARE allowed boolean; BEGIN
    IF auth.uid()::text IS DISTINCT FROM '${uuid(6)}' THEN RAISE EXCEPTION 'Exact synthetic actor only' USING ERRCODE='42501'; END IF;
    CASE p_helper
      WHEN 'can_read_team_topic' THEN allowed:=private.can_read_team_topic('${uuid(401)}'::uuid);
      WHEN 'is_active_topic_member' THEN allowed:=private.is_active_topic_member();
      WHEN 'can_read_team_actor' THEN allowed:=private.can_read_team_actor('${uuid(6)}'::uuid);
      WHEN 'can_read_team_claim' THEN allowed:=private.can_read_team_claim('${uuid(26001)}'::uuid);
      ELSE RAISE EXCEPTION 'Unknown acceptance helper' USING ERRCODE='22023';
    END CASE;
    RETURN jsonb_build_object('subject',auth.uid(),'helper',p_helper,'allowed',allowed);
  END `;
  const journal=readJournal();journal.helperPlanned=true;journal.helperSource=source;save(journal);
  const result=await execute(`CREATE FUNCTION public.${HELPER}(p_helper text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $b05$${source}$b05$; REVOKE ALL ON FUNCTION public.${HELPER}(text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.${HELPER}(text) TO authenticated; SELECT oid::text AS oid,proowner::regrole::text AS owner,proacl::text AS acl,prosrc AS source,prosecdef::text AS definer FROM pg_proc WHERE oid=to_regprocedure('public.${HELPER}(text)');`);
  fail(result.rows.length===1&&result.rows[0].source===source&&result.rows[0].definer==='false','Temporary helper creation receipt incomplete');
  journal.helperOwnership=result.rows[0];journal.helperCreateRequestId=result.requestId;save(journal);
}
async function probeHelpers(jwt,active){
  const results=[];
  for(const helper of ['can_read_team_topic','is_active_topic_member','can_read_team_actor','can_read_team_claim']){
    const {receipt,payload}=await http(jwt,`rpc/${HELPER}`,'POST',{p_helper:helper},{helper,active});
    if(active)fail(receipt.httpStatus===200&&payload.subject===uuid(6)&&payload.helper===helper&&payload.allowed===true,`B05 active helper control failed: ${helper}`);
    else fail(permissionDenial(receipt.httpStatus,payload,'insert'),`B05 private helper did not reject inactive JWT: ${helper}`);
    const result={...receipt,...(active?{subject:payload.subject,allowed:payload.allowed}:{denial:permissionDenial(receipt.httpStatus,payload,'insert')})};record('helperProbes',result);results.push(result);
  }
  return results;
}
async function setFixtureAuthStatus(status){
  const result=await execute(`UPDATE auth.users SET status=${status} WHERE sub=${quote(uuid(6))} AND username LIKE 'dydata-permission-v2-%' RETURNING status::text AS status`);
  fail(result.rows.length===1&&result.rows[0].status===String(status),'Synthetic Auth status update did not affect the exact actor');
  const readback=await execute(`SELECT status::text AS status FROM auth.users WHERE sub=${quote(uuid(6))}`);
  fail(readback.rows.length===1&&readback.rows[0].status===String(status),'Synthetic Auth status readback mismatch');
  record('authStatusReceipts',{status,writeRequestId:result.requestId,readRequestId:readback.requestId});
}
async function probePublicRpcs(jwt){
  const catalog=await execute(`SELECT p.proname AS name,p.oid::regprocedure::text AS signature,coalesce((SELECT jsonb_agg(jsonb_build_object('name',p.proargnames[a.ordinality]) ORDER BY a.ordinality) FROM unnest(coalesce(p.proallargtypes,p.proargtypes::oid[])) WITH ORDINALITY a(arg_oid,ordinality) WHERE p.proargmodes IS NULL OR p.proargmodes[a.ordinality] IN ('i','b','v')),'[]'::jsonb) AS arguments FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' AND p.prorettype<>'trigger'::regtype AND p.prosecdef AND position('cloudbase_require_active_actor_v2' IN p.prosrc)>0 ORDER BY p.oid::regprocedure::text`);
  fail(catalog.rows.length===38,'B05 guarded public RPC catalog drift');const results=[];
  await bounded(catalog.rows,async entry=>{
    ident(entry.name);const args=typeof entry.arguments==='string'?JSON.parse(entry.arguments):entry.arguments;
    fail(Array.isArray(args)&&args.every(a=>typeof a.name==='string'),'RPC has an unnamed argument');
    const {receipt,payload}=await http(jwt,`rpc/${entry.name}`,'POST',Object.fromEntries(args.map(a=>[a.name,null])),{rpc:entry.signature});
    const result={...receipt,name:entry.name,signature:entry.signature,denial:permissionDenial(receipt.httpStatus,payload,'insert')};record('rpcProbes',result);
    fail(result.denial,`B05 public RPC did not reject inactive JWT: ${entry.signature}`);results.push(result);
  });return {catalogRequestId:catalog.requestId,results:results.sort((a,b)=>a.signature.localeCompare(b.signature))};
}
async function probeReadOnlyView(jwt,fixtures,active){
  const config=fixtures.find(f=>f.table==='ai_feature_config');const results=[];
  for(const operation of ['insert','update','delete']){
    const params=operation==='insert'?'':`?id=eq.${config.key.id}&config_type=eq.feature`;
    const body=operation==='delete'?undefined:operation==='insert'?{config_type:'feature',id:uuid(29998),key:`${PREFIX}-view`,name:`${PREFIX}-view`,prompt:'synthetic',is_enabled:false}:{prompt:'synthetic-update'};
    const {receipt,payload}=await http(jwt,`ai_unified_config_view${params}`,{insert:'POST',update:'PATCH',delete:'DELETE'}[operation],body,{view:'ai_unified_config_view',operation,active});
    const denial=permissionDenial(receipt.httpStatus,payload,operation);
    const structural=['55000','DATABASE_55000'].includes(receipt.code);
    fail(denial||structural,'Writable-ACL view returned an unexpected mutation response');
    const result={...receipt,classification:structural?'structurally-non-updatable':'authorization-denial',denial};record('viewProbes',result);results.push(result);
  }return results;
}
async function probeOwnStatus(jwt,state){
  const expected=state.membershipStatus==='archived'?'archived':state.authStatus===2?'pending':'blocked';const results=[];
  for(const [name,value]of [['cloudbase_session_status',expected],['cloudbase_current_actor_active_v2',false]]){
    const {receipt,payload}=await http(jwt,`rpc/${name}`,'POST',{}, {statusFunction:name});
    fail(receipt.httpStatus===200&&payload===value,'Own inactive status projection mismatch');results.push({...receipt,value:payload});
  }return results;
}
function fixtureLevels(fixtures){
  // Foreign-key values, including support parents, determine the actual DAG.
  const remaining=fixtures.filter(f=>!f.existing),levels=[],ready=new Set([uuid(6),uuid(101),uuid(401)]);
  const allIds=new Set(remaining.map(f=>f.insert.id).filter(Boolean));
  while(remaining.length){
    const level=remaining.filter(f=>Object.entries(f.insert).every(([k,v])=>k==='id'||!allIds.has(v)||ready.has(v)));
    fail(level.length,'B05 fixture dependency cycle');levels.push(level);
    for(const f of level){if(f.insert.id)ready.add(f.insert.id);remaining.splice(remaining.indexOf(f),1);}
  }return levels;
}
async function seedLevel(level){
  const journal=readJournal();journal.seedAttempts??=[];journal.seedAttempts.push({tables:level.map(f=>f.table),startedAt:Date.now()});save(journal);
  const affected=[];
  if(level.some(f=>f.table==='rewrite_messages'))affected.push('rewrite_conversations');
  if(level.some(f=>f.table==='script_usage_records'))affected.push('violation_cases');
  const parents=journal.fixtures.filter(f=>affected.includes(f.table));
  const checks=parents.map(f=>{
    fail(journal.owned[f.table],'Trigger parent lacks an owned seed acknowledgement');
    return `PERFORM 1 FROM public.${ident(f.table)} WHERE ${keyWhere(f.key)} FOR UPDATE; ${ownershipCheck(f,journal.owned[f.table])}`;
  }).join('\n');
  try{
    const reportGuard=level.some(f=>f.table==='daily_reports')?`DO $b05absent$ BEGIN PERFORM set_config('lock_timeout','2000',true); LOCK TABLE public.fulfillment_records IN SHARE ROW EXCLUSIVE MODE; IF EXISTS(SELECT 1 FROM public.fulfillment_records WHERE user_id='${uuid(6)}'::uuid AND record_date='2999-01-01'::date AND status='absent') THEN RAISE EXCEPTION 'B05 refuses to delete preexisting absent records'; END IF; END $b05absent$;\n`:'';
    const result=await execute(reportGuard+(checks?`DO $b05parent$ BEGIN ${checks} END $b05parent$;\n`:'')+level.map(insertSql).join('\n')+'\n'+[...level,...parents].map(snapshotSelect).join(' UNION ALL '));
    fail(result.rows.length===level.length+parents.length&&result.rows.every(r=>r.count==='1'&&r.digest&&r.version),'Atomic seed acknowledgement incomplete');
    const current=readJournal();current.owned??={};for(const row of result.rows)current.owned[row.table_name]=row;
    current.setupRequests??=[];current.setupRequests.push({tables:level.map(f=>f.table),lockedTriggerParents:affected,requestId:result.requestId});save(current);
  }catch(error){record('errors',{phase:'atomic-fixture-seed',tables:level.map(f=>f.table),requestId:null,message:String(error.message)});throw error;}
}
export async function collectCompleteTableWriteEvidence({jwt,activeControl=true,state={authStatus:3,membershipStatus:'active',role:'member'}}){
  fail(process.env.CLOUDBASE_ENV_ID===ENV_ID&&process.env.DYDATA_GATE_BACKEND==='cloudbase','B05 isolated environment required');
  const manifest=readManifest();fail(manifest.phase==='ready'&&!manifest.cleaned,'B05 requires a live fixture manifest');
  fail([1,2,3].includes(state.authStatus)&&['active','archived'].includes(state.membershipStatus)&&['member','admin','company_owner'].includes(state.role)&&(state.authStatus!==1||state.membershipStatus==='archived'),'B05 requires an inactive actor state');
  const actor=await execute(`SELECT u.status::text AS status,p.membership_status,p.company_role FROM auth.users u JOIN public.profiles p ON p.id::text=u.sub WHERE u.sub=${quote(uuid(6))} AND u.username LIKE 'dydata-permission-v2-%'`);
  fail(actor.rows.length===1&&actor.rows[0].status===String(state.authStatus)&&actor.rows[0].membership_status===state.membershipStatus&&actor.rows[0].company_role===state.role,'B05 actor state mismatch');
  fail(JSON.parse(Buffer.from(jwt.split('.')[1],'base64url')).sub===uuid(6),'B05 JWT has wrong synthetic subject');
  const fixtures=validateWriteFixtures(buildWriteFixtures());
  const directory=await execute(`SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND (has_table_privilege('authenticated',c.oid,'INSERT') OR has_table_privilege('authenticated',c.oid,'UPDATE') OR has_any_column_privilege('authenticated',c.oid,'UPDATE') OR has_table_privilege('authenticated',c.oid,'DELETE')) ORDER BY c.relname`);
  const byName=new Map(fixtures.map(f=>[f.table,f]));fail(directory.rows.length===80&&directory.rows.every(r=>byName.has(r.name)),'Writable table catalog drift/missing fixture');
  fail(!existsSync(privatePath())||readJournal().cleaned,'Previous B05 journal requires recovery');
  if(existsSync(privatePath()))renameSync(privatePath(),privatePath().replace('.json',`-preserved-${Date.now()}.json`));
  const vacant=await snapshots(fixtures.filter(f=>!f.existing));fail(vacant.rows.every(r=>r.count==='0'),'B05 identifier occupied; no cleanup journal created');
  const auth=await execute(`SELECT status::text AS status,md5(to_jsonb(u)::text) AS digest,md5((to_jsonb(u)-'status')::text) AS nonstatus_digest FROM auth.users u WHERE sub=${quote(uuid(6))} AND username LIKE 'dydata-permission-v2-%'`);fail(auth.rows.length===1,'Synthetic Auth baseline missing');
  save({environment:ENV_ID,namespace:PREFIX,state,authBefore:auth.rows[0],authBeforeRequestId:auth.requestId,startedAt:new Date().toISOString(),preflightRequestId:vacant.requestId,before:await publicSnapshot(),fixtures,owned:{},probes:[],cleaned:false});
  try{
    const results=[];
    const profile=fixtures.find(f=>f.existing);results.push(await rejectWrite(jwt,profile,'insert'));
    const candidate=insertCandidate(profile);fail((await snapshots([candidate])).rows[0].count==='0','Ungranted profile insert unexpectedly created a row');
    for(const level of fixtureLevels(fixtures)){
      await bounded(level.filter(f=>directory.rows.some(r=>r.name===f.table)),async f=>results.push(await rejectWrite(jwt,f,'insert')));
      // No errors are accepted as valid data: this real atomic seed must succeed.
      await seedLevel(level);
    }
    const writable=directory.rows.map(r=>byName.get(r.name));
    for(const operation of ['update','delete']){
      const before=await snapshots(writable);fail(before.rows.every(r=>r.count==='1'),'Owned row absent before write phase');
      await bounded(writable,async f=>results.push(await rejectWrite(jwt,f,operation)));
      const after=await snapshots(writable);const sorted=r=>[...r].sort((a,b)=>a.table_name.localeCompare(b.table_name));
      fail(same(sorted(before.rows),sorted(after.rows)),`B05 ${operation} changed owned data`);
      record('writePhaseChecks',{operation,beforeRequestId:before.requestId,afterRequestId:after.requestId,rowUnchanged:true});
    }
    await prepareHelper();let active=[],activeView=[];
    if(activeControl){fail(state.membershipStatus==='active','Invalid helper positive control state');const j=readJournal();j.authStatusTouched=true;save(j);try{await setFixtureAuthStatus(1);active=await probeHelpers(jwt,true);activeView=await probeReadOnlyView(jwt,fixtures,true);}finally{await setFixtureAuthStatus(state.authStatus);}}
    const denied=await probeHelpers(jwt,false);const publicRpcs=await probePublicRpcs(jwt);const view=await probeReadOnlyView(jwt,fixtures,false);const ownStatus=await probeOwnStatus(jwt,state);
    const output={environment:ENV_ID,actor:uuid(6),state,directory,scope:'synthetic old JWT; 80 base tables x INSERT/UPDATE/DELETE; temporary invoker for 4 private helpers',tableProbes:results.sort((a,b)=>(a.table+a.operation).localeCompare(b.table+b.operation)).map(r=>({...r,rowUnchanged:true})),helpers:{active,denied},publicRpcs,view:{active:activeView,inactive:view},ownStatus,summary:{tables:80,denied:results.length,privateHelpers:denied.length,publicRpcs:publicRpcs.results.length},journalPath:privatePath()};
    const current=readJournal();current.evidence=output;save(current);return output;
  }catch(error){record('errors',{phase:'B05-scenario',message:String(error.message),failedAt:Date.now()});throw error;}
  finally{await recoverWriteFixtures();}
}
