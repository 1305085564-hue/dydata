import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execute, quote, uuid, readManifest, manifestPath, ENV_ID } from './permission-fixtures.mjs';
import { buildWriteFixtures } from './write-fixtures.mjs';

const PREFIX = 'dydata-permission-v2-b05';
const HELPER = 'dydata_b05_private_probe_v2';
const ident = value => {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) throw new Error('Unsafe acceptance identifier');
  return `"${value}"`;
};
const json = value => quote(JSON.stringify(value));
const keyWhere = key => Object.entries(key).map(([k,v])=>`${ident(k)}=${quote(v)}`).join(' AND ');
const privatePath = () => join(dirname(manifestPath()), 'write-fixtures.json');
const readJournal = () => JSON.parse(readFileSync(privatePath(),'utf8'));
const save = journal => writeFileSync(privatePath(),JSON.stringify(journal),{mode:0o600});
const fail = (condition,message) => { if(!condition)throw new Error(message); };
function assertIsolation() {
  fail(process.env.CLOUDBASE_ENV_ID===ENV_ID && process.env.DYDATA_GATE_BACKEND==='cloudbase','B05 isolated environment required');
  const manifest=readManifest();
  fail(manifest.phase==='ready' && !manifest.cleaned,'B05 requires the current live fixture manifest');
  return manifest;
}
export function insertSql(fixture) {
  const columns=Object.keys(fixture.insert).map(ident).join(',');
  return `INSERT INTO public.${ident(fixture.table)} (${columns}) ${fixture.table==='usage_events'?'OVERRIDING SYSTEM VALUE ':''}SELECT ${columns} FROM jsonb_populate_record(NULL::public.${ident(fixture.table)},${json(fixture.insert)}::jsonb);`;
}
export function validateWriteFixtures(fixtures) {
  fail(Array.isArray(fixtures) && fixtures.length>=80 && fixtures.length<=100,'B05 fixture inventory is incomplete');
  const seen=new Set();
  for(const fixture of fixtures){
    ident(fixture.table);fail(!seen.has(fixture.table),'Duplicate table fixture');seen.add(fixture.table);
    fail(fixture.key && Object.keys(fixture.key).length>0 && fixture.insert && (fixture.support || (fixture.patch && Object.keys(fixture.patch).length>0)),'Missing fixture key/payload/patch');
    for(const [key,value] of Object.entries(fixture.key)){
      ident(key);fail(Object.hasOwn(fixture.insert,key) && String(fixture.insert[key])===String(value),'Fixture key/payload mismatch');
      fail(typeof value==='string' && (value.startsWith('f0cba501-2026-4111-a001-') || value.startsWith(PREFIX) || /^-62026\d+$/.test(value)),'Fixture key outside synthetic namespace');
    }
    for(const key of Object.keys(fixture.patch??{}))ident(key);
    for(const key of Object.keys(fixture.insert))ident(key);
  }
  return fixtures;
}
async function publicSnapshot() {
  const catalog=await execute(`SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname`);
  fail(catalog.rows.length===99,'Public table catalog changed; stop B05');
  const snapshots=await execute(catalog.rows.map(({name})=>`SELECT ${quote(name)} AS table_name,count(*)::text AS count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) AS digest FROM public.${ident(name)} t`).join(' UNION ALL '));
  return {...snapshots,rows:snapshots.rows.sort((a,b)=>a.table_name.localeCompare(b.table_name))};
}
async function rowSnapshot(fixture) {
  const result=await execute(`SELECT md5(to_jsonb(t)::text) AS digest FROM public.${ident(fixture.table)} t WHERE ${keyWhere(fixture.key)}`);
  return {requestId:result.requestId,rows:result.rows};
}
function parsedCode(body) { return body && typeof body==='object' ? String(body.code??body.error?.code??'') : ''; }
function permissionDenial(status,body,operation) {
  if(status===401||status===403)return `http-${status}`;
  if(parsedCode(body)==='42501')return 'postgres-42501';
  if(operation!=='insert' && status===200 && Array.isArray(body) && body.length===0)return 'rls-zero-rows';
  return null;
}
async function request(jwt,fixture,operation,{existing=false}={}) {
  const parameters=new URLSearchParams();
  if(operation!=='insert')for(const [key,value] of Object.entries(fixture.key))parameters.set(key,`eq.${value}`);
  const url=`https://${ENV_ID}.api.tcloudbasegateway.com/v1/rdb/rest/${encodeURIComponent(fixture.table)}${parameters.size?'?'+parameters:''}`;
  const before=await rowSnapshot(fixture);
  fail(before.rows.length===(existing?1:0),`Unexpected owned row before ${fixture.table}/${operation}`);
  const response=await fetch(url,{method:{insert:'POST',update:'PATCH',delete:'DELETE'}[operation],headers:{authorization:`Bearer ${jwt}`,'content-type':'application/json',prefer:'return=representation'},...(operation==='delete'?{}:{body:JSON.stringify(operation==='insert'?fixture.insert:fixture.patch)}),signal:AbortSignal.timeout(15000)});
  const raw=await response.text();let body;try{body=JSON.parse(raw);}catch{body=null;}
  const after=await rowSnapshot(fixture);
  const unchanged=JSON.stringify(before.rows)===JSON.stringify(after.rows);
  const denial=permissionDenial(response.status,body,operation);
  const result={table:fixture.table,operation,httpStatus:response.status,code:parsedCode(body),denial,rowUnchanged:unchanged,requestId:response.headers.get('x-request-id')??response.headers.get('x-tc-requestid'),beforeRequestId:before.requestId,afterRequestId:after.requestId};
  const journal=readJournal();journal.probes.push(result);save(journal);
  fail(unchanged,`B05 changed a synthetic row: ${fixture.table}/${operation}`);
  fail(denial,`B05 lacks an authorization rejection: ${fixture.table}/${operation} (${response.status}/${parsedCode(body)})`);
  return result;
}
export async function recoverWriteFixtures() {
  if(!existsSync(privatePath()))return;
  const journal=readJournal();
  fail(journal.environment===ENV_ID && journal.namespace===PREFIX,'Foreign write-fixture journal');
  if(journal.cleaned)return;
  const fixtures=validateWriteFixtures(journal.fixtures);
  if(journal.helperPlanned){
    const helper=await execute(`SELECT pg_get_functiondef(oid) AS definition,prosrc AS source,prosecdef::text AS definer FROM pg_proc WHERE oid=to_regprocedure('public.${HELPER}(text)')`);
    fail(helper.rows.length===0 || (helper.rows[0].source===journal.helperSource && helper.rows[0].definer==='false' && (!journal.helperDefinition || helper.rows[0].definition===journal.helperDefinition)),'B05 helper changed; retain evidence');
    if(helper.rows.length)await execute(`DROP FUNCTION public.${HELPER}(text)`);
  }
  for(const extra of journal.extraInsertKeys??[]){
    fail(extra.table==='usage_events' && extra.key.user_id===uuid(6) && extra.key.path==='/__fixture__/dydata-permission-v2-b05','Foreign generated-identity fixture');
    await execute(`DELETE FROM public.usage_events WHERE ${keyWhere(extra.key)}`);
  }
  // Reverse explicit dependency order; no broad prefix deletes and no historical rows.
  for(const fixture of [...fixtures].reverse())if(!fixture.existing){
    await execute(`DELETE FROM public.${ident(fixture.table)} WHERE ${keyWhere(fixture.key)}`);
  }
  const counts=await execute(fixtures.filter(f=>!f.existing).map(f=>`SELECT ${quote(f.table)} AS table_name,count(*)::text AS remaining FROM public.${ident(f.table)} WHERE ${keyWhere(f.key)}`).join(' UNION ALL '));
  fail(counts.rows.every(r=>r.remaining==='0'),'B05 cleanup rows remain');
  const after=await publicSnapshot();journal.after=after;journal.zeroRequestId=counts.requestId;save(journal);
  fail(JSON.stringify(after.rows)===JSON.stringify(journal.before.rows),'Non-fixture public data changed during B05; retain full journal');
  journal.cleaned=true;journal.finishedAt=new Date().toISOString();save(journal);
}

// Only a short-lived SECURITY INVOKER adapter is used to exercise private helpers
// with genuine gateway JWT claims. It has no business-data write capability.
async function prepareHelper() {
  const journal=readJournal();
  const topic=uuid(401),claim=uuid(26001);
  const existing=await execute(`SELECT to_regprocedure('public.${HELPER}(text)')::text AS name`);
  fail(existing.rows[0].name===null,'B05 temporary helper name is occupied');
  const source=` DECLARE allowed boolean; BEGIN
    IF auth.uid()::text NOT LIKE 'f0cba501-2026-4111-a001-%' THEN RAISE EXCEPTION 'Synthetic identities only' USING ERRCODE='42501'; END IF;
    CASE p_helper
      WHEN 'can_read_team_topic' THEN allowed:=private.can_read_team_topic('${topic}'::uuid);
      WHEN 'is_active_topic_member' THEN allowed:=private.is_active_topic_member();
      WHEN 'can_read_team_actor' THEN allowed:=private.can_read_team_actor('${uuid(6)}'::uuid);
      WHEN 'can_read_team_claim' THEN allowed:=private.can_read_team_claim('${claim}'::uuid);
      ELSE RAISE EXCEPTION 'Unknown acceptance helper' USING ERRCODE='22023';
    END CASE;
    RETURN jsonb_build_object('subject',auth.uid(),'helper',p_helper,'allowed',allowed);
  END `;
  const sql=`CREATE FUNCTION public.${HELPER}(p_helper text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $b05$${source}$b05$; REVOKE ALL ON FUNCTION public.${HELPER}(text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.${HELPER}(text) TO authenticated;`;
  // Record intended ownership before DDL; subsequent exact pg_get_functiondef is saved.
  journal.helperPlanned=true;journal.helperSource=source;save(journal);
  const created=await execute(sql);
  const definition=await execute(`SELECT pg_get_functiondef(to_regprocedure('public.${HELPER}(text)')) AS definition`);
  journal.helperDefinition=definition.rows[0].definition;journal.helperCreateRequestId=created.requestId;save(journal);
}
async function probeHelpers(jwt,active) {
  const results=[];
  for(const helper of ['can_read_team_topic','is_active_topic_member','can_read_team_actor','can_read_team_claim']){
    const response=await fetch(`https://${ENV_ID}.api.tcloudbasegateway.com/v1/rdb/rest/rpc/${HELPER}`,{method:'POST',headers:{authorization:`Bearer ${jwt}`,'content-type':'application/json'},body:JSON.stringify({p_helper:helper}),signal:AbortSignal.timeout(15000)});
    const body=await response.json();
    if(active)fail(response.status===200 && body.subject===uuid(6) && body.helper===helper && body.allowed===true,`B05 active helper control failed: ${helper}`);
    else fail(Boolean(permissionDenial(response.status,body,'insert')),`B05 private helper did not reject inactive JWT: ${helper}`);
    results.push({helper,active,httpStatus:response.status,code:parsedCode(body),requestId:response.headers.get('x-request-id')??null,...(active?{subject:body.subject,allowed:body.allowed}:{})});
  }
  return results;
}
async function probePublicRpcs(jwt) {
  const catalog=await execute(`SELECT p.proname AS name,p.oid::regprocedure::text AS signature,coalesce((SELECT jsonb_agg(jsonb_build_object('name',p.proargnames[a.ordinality]) ORDER BY a.ordinality) FROM unnest(coalesce(p.proallargtypes,p.proargtypes::oid[])) WITH ORDINALITY a(arg_oid,ordinality) WHERE p.proargmodes IS NULL OR p.proargmodes[a.ordinality] IN ('i','b','v')),'[]'::jsonb) AS arguments FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' AND p.prorettype<>'trigger'::regtype AND p.prosecdef AND position('cloudbase_require_active_actor_v2' IN p.prosrc)>0 ORDER BY p.oid::regprocedure::text`);
  fail(catalog.rows.length===38,'B05 guarded public RPC catalog drift');
  const results=[];
  for(const entry of catalog.rows){
    ident(entry.name);const args=typeof entry.arguments==='string'?JSON.parse(entry.arguments):entry.arguments;
    fail(Array.isArray(args) && args.every(arg=>typeof arg.name==='string'),'RPC has an unnamed argument');
    const response=await fetch(`https://${ENV_ID}.api.tcloudbasegateway.com/v1/rdb/rest/rpc/${entry.name}`,{method:'POST',headers:{authorization:`Bearer ${jwt}`,'content-type':'application/json'},body:JSON.stringify(Object.fromEntries(args.map(a=>[a.name,null]))),signal:AbortSignal.timeout(15000)});
    const body=await response.json();const denial=permissionDenial(response.status,body,'insert');
    const result={name:entry.name,signature:entry.signature,httpStatus:response.status,code:parsedCode(body),denial,requestId:response.headers.get('x-request-id')??null};
    const journal=readJournal();journal.rpcProbes??=[];journal.rpcProbes.push(result);save(journal);
    fail(denial,`B05 public RPC did not reject inactive JWT: ${entry.signature}`);results.push(result);
  }
  return {catalogRequestId:catalog.requestId,results};
}
export async function collectCompleteTableWriteEvidence({jwt,activeControl=true,state={authStatus:3,membershipStatus:'active',role:'member'}}) {
  assertIsolation();
  fail([1,2,3].includes(state.authStatus) && ['active','archived'].includes(state.membershipStatus) && ['member','admin','company_owner'].includes(state.role) && (state.authStatus!==1 || state.membershipStatus==='archived'),'B05 requires an inactive actor state');
  const actor=await execute(`SELECT u.status::text AS status,p.membership_status,p.company_role FROM auth.users u JOIN public.profiles p ON p.id::text=u.sub WHERE u.sub=${quote(uuid(6))} AND u.username LIKE 'dydata-permission-v2-%'`);
  fail(actor.rows.length===1 && actor.rows[0].status===String(state.authStatus) && actor.rows[0].membership_status===state.membershipStatus && actor.rows[0].company_role===state.role,'B05 synthetic actor state does not match the requested scenario');
  const claims=JSON.parse(Buffer.from(jwt.split('.')[1],'base64url').toString());fail(claims.sub===uuid(6),'B05 JWT has the wrong synthetic subject');
  const fixtures=validateWriteFixtures(buildWriteFixtures());
  const directory=await execute(`SELECT c.relname AS name,has_table_privilege('authenticated',c.oid,'INSERT')::text AS ins,(has_table_privilege('authenticated',c.oid,'UPDATE') OR has_any_column_privilege('authenticated',c.oid,'UPDATE'))::text AS upd,has_table_privilege('authenticated',c.oid,'DELETE')::text AS del FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND (has_table_privilege('authenticated',c.oid,'INSERT') OR has_table_privilege('authenticated',c.oid,'UPDATE') OR has_any_column_privilege('authenticated',c.oid,'UPDATE') OR has_table_privilege('authenticated',c.oid,'DELETE')) ORDER BY c.relname`);
  fail(directory.rows.length===80,'Writable table catalog drift');
  const byName=new Map(fixtures.map(f=>[f.table,f]));
  fail(directory.rows.every(r=>byName.has(r.name)),'A writable table has no owned fixture');
  fail(!existsSync(privatePath()) || readJournal().cleaned,'Previous B05 journal requires recovery');
  if(existsSync(privatePath()))renameSync(privatePath(),privatePath().replace('.json',`-preserved-${Date.now()}.json`));
  const vacant=await execute(fixtures.filter(f=>!f.existing).map(f=>`SELECT ${quote(f.table)} AS table_name,count(*)::text AS occupied FROM public.${ident(f.table)} WHERE ${keyWhere(f.key)}`).join(' UNION ALL '));
  fail(vacant.rows.every(r=>r.occupied==='0'),'B05 identifier is occupied; do not create a cleanup journal or overwrite');
  const journal={environment:ENV_ID,namespace:PREFIX,startedAt:new Date().toISOString(),preflightRequestId:vacant.requestId,before:await publicSnapshot(),fixtures,probes:[],cleaned:false};save(journal);
  try{
    const results=[];
    for(const fixture of fixtures){
      const writable=directory.rows.find(r=>r.name===fixture.table);
      if(fixture.existing){
        // Profiles INSERT is ungranted; use a distinct absent synthetic identity.
        if(writable){const candidate={...fixture,key:{id:uuid(29999)},insert:{id:uuid(29999),name:`${PREFIX}-ungranted`,role:'member',company_role:'member'}};results.push(await request(jwt,candidate,'insert'));}
        continue;
      }
      const before=await rowSnapshot(fixture);fail(before.rows.length===0,`Occupied fixture: ${fixture.table}`);
      if(writable){
        if(fixture.table==='usage_events'){
          const candidate={...fixture,key:{user_id:uuid(6),path:fixture.insert.path},insert:{...fixture.insert}};delete candidate.insert.id;
          const current=readJournal();current.extraInsertKeys=[{table:'usage_events',key:candidate.key}];save(current);
          results.push(await request(jwt,candidate,'insert'));
        }else results.push(await request(jwt,fixture,'insert'));
      }
      const result=await execute(insertSql(fixture));
      const current=readJournal();current.setupRequests??=[];current.setupRequests.push({table:fixture.table,requestId:result.requestId});save(current);
    }
    for(const table of directory.rows){
      const fixture=byName.get(table.name);
      results.push(await request(jwt,fixture,'update',{existing:true}));
      results.push(await request(jwt,fixture,'delete',{existing:true}));
    }
    await prepareHelper();
    // Restore only this self-created actor for a genuine active JWT positive control.
    let active=[];
    if(activeControl){
      fail(state.membershipStatus==='active','Active helper control must run before an archived scenario');
      await execute(`UPDATE auth.users SET status=1 WHERE sub=${quote(uuid(6))} AND username LIKE 'dydata-permission-v2-%'`);
      try{active=await probeHelpers(jwt,true);}finally{await execute(`UPDATE auth.users SET status=${state.authStatus} WHERE sub=${quote(uuid(6))} AND username LIKE 'dydata-permission-v2-%'`);}
    }
    const denied=await probeHelpers(jwt,false);
    const publicRpcs=await probePublicRpcs(jwt);
    const output={environment:ENV_ID,actor:uuid(6),directory,state,scope:'inactive synthetic old JWT; 80 base tables x INSERT/UPDATE/DELETE; four private helper calls via temporary invoker',tableProbes:results,helpers:{active,denied},publicRpcs,summary:{tables:directory.rows.length,denied:results.filter(r=>r.denial&&r.rowUnchanged).length,privateHelpers:denied.length,publicRpcs:publicRpcs.results.length},journalPath:privatePath()};
    const current=readJournal();current.evidence=output;save(current);
    return output;
  }finally{await recoverWriteFixtures();}
}
