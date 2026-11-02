// Supabase only: reviewed batch A; no environment/network execution in this module.
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { reviewedSource } from './batch-a-reviewed-source.mjs';
export const guards = readFileSync(new URL('./batch-a-guards.sql', import.meta.url), 'utf8');
const source = readFileSync(new URL('../cloudbase/target-permissions.sql', import.meta.url), 'utf8');
export const targets = [...source.slice(0, source.indexOf(') AS expected')).matchAll(/\('(public\.[^']+)', '([RSO])'\)/g)]
  .map(([, signature, access]) => ({ signature, access: signature === 'public.get_leaderboard_rows(date)' ? 'R' : access }));
if (targets.length !== 31) throw new Error('Expected exactly 31 audited functions');
export const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
export const ident = (value) => `"${String(value).replaceAll('"', '""')}"`;
const signatures = targets.map(t => `${quote(t.signature)}::regprocedure`).join(',');
export const snapshotQuery = `SELECT jsonb_build_object(
 'functions', (SELECT jsonb_agg(jsonb_build_object(
 'signature',format('public.%I(%s)',p.proname,oidvectortypes(p.proargtypes)),'definition',pg_get_functiondef(p.oid),
 'md5',md5(pg_get_functiondef(p.oid)), 'owner',pg_get_userbyid(p.proowner),
 'acl',p.proacl::text,'config',to_jsonb(p.proconfig),'definer',p.prosecdef,
 'grants',(SELECT jsonb_agg(jsonb_build_object('role',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
 'grantor',pg_get_userbyid(a.grantor),'grantable',a.is_grantable) ORDER BY ord)
 FROM unnest(coalesce(p.proacl,acldefault('f',p.proowner))) WITH ORDINALITY u(acl,ord)
 CROSS JOIN LATERAL aclexplode(ARRAY[u.acl]) a)
 ) ORDER BY p.oid::regprocedure::text) FROM pg_proc p WHERE p.oid IN (${signatures})),
 'dependencies', (SELECT md5(jsonb_build_object(
 'functions',(SELECT jsonb_agg(jsonb_build_array(n.nspname,p.oid::regprocedure::text,pg_get_functiondef(p.oid),p.proacl::text,pg_get_userbyid(p.proowner)) ORDER BY n.nspname,p.oid::regprocedure::text)
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') AND p.prokind='f' AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e')),
 'policies',(SELECT jsonb_agg(to_jsonb(v) ORDER BY schemaname,tablename,policyname) FROM pg_policies v WHERE schemaname IN ('public','private')),
 'auth',(SELECT jsonb_agg(pg_get_functiondef(p.oid) ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='auth' AND p.proname IN ('uid','role','jwt') AND p.pronargs=0),
 'relations',(SELECT jsonb_agg(jsonb_build_array(c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text,pg_get_userbyid(c.relowner)) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','v','S')),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(c.conrelid::regclass::text,c.conname,pg_get_constraintdef(c.oid)) ORDER BY c.conrelid::regclass::text,c.conname) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public'),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(t.tgrelid::regclass::text,t.tgname,pg_get_triggerdef(t.oid),t.tgenabled) ORDER BY t.tgrelid::regclass::text,t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname='public')
 )::text))
);`;
function validate(snapshot) {
 if (snapshot.functions?.length !== 31 || !snapshot.dependencies) throw new Error('Incomplete snapshot');
 for (const t of targets) {
  const f = snapshot.functions.find(f => f.signature.replaceAll(', ', ',') === t.signature.replaceAll(', ', ','));
  if (!f || f.owner !== 'postgres' || !f.definer || !f.definition || !f.md5 || f.acl === null || f.grants.some(g => g.grantor !== 'postgres')) throw new Error(`Unreviewed metadata: ${t.signature}`);
 }
}
function drift(snapshot) {
 validate(snapshot);
 // Compare the entire metadata, not just hashes; dependencies include helper definitions.
 return `DO $drift$ BEGIN IF (${snapshotQuery.trim().replace(/^SELECT /,'').replace(/;$/,'')}) IS DISTINCT FROM ${quote(JSON.stringify(snapshot))}::jsonb THEN RAISE EXCEPTION 'batch A snapshot drift' USING ERRCODE='55000'; END IF; END $drift$;`;
}
const begin = "BEGIN;\nSET LOCAL lock_timeout='3s';\nSET LOCAL statement_timeout='60s';\n";
export function buildApply(snapshot) {
 validate(snapshot);
 const normalize = f => ({...f,signature:f.signature.replaceAll(', ', ','),grants:[...f.grants].sort((a,b)=>a.role.localeCompare(b.role))});
 for(const expected of reviewedSource){const f=snapshot.functions.find(f=>f.signature===expected.signature);const actual=f && Object.fromEntries(Object.keys(expected).map(k=>[k,f[k]]));if(!actual || !isDeepStrictEqual(normalize(actual),normalize(expected)))throw new Error(`Unreviewed source drift: ${expected.signature}`);}
 return begin + drift(snapshot) + '\n' + guards + '\n' + targets.map(t => `REVOKE ALL PRIVILEGES ON FUNCTION ${t.signature} FROM PUBLIC, anon, authenticated, service_role;\nALTER FUNCTION ${t.signature} SET search_path TO pg_catalog, public, pg_temp;\n` + (t.access === 'O' ? '' : `GRANT EXECUTE ON FUNCTION ${t.signature} TO ${t.access === 'R' ? 'authenticated, service_role' : 'service_role'};`)).join('\n') + `\nDO $assert$ DECLARE r record; f oid; BEGIN FOR r IN SELECT * FROM (VALUES ${targets.map(t=>`(${quote(t.signature)},${quote(t.access)})`).join(',')}) v(signature,access) LOOP f:=r.signature::regprocedure; IF has_function_privilege('anon',f,'EXECUTE') OR has_function_privilege('authenticated',f,'EXECUTE') IS DISTINCT FROM (r.access='R') OR has_function_privilege('service_role',f,'EXECUTE') IS DISTINCT FROM (r.access IN ('R','S')) OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid=f AND a.grantee=0) OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=f AND pg_get_userbyid(proowner)='postgres' AND prosecdef AND 'search_path=pg_catalog, public, pg_temp'=ANY(proconfig)) THEN RAISE EXCEPTION 'batch A postcondition: %',r.signature; END IF; END LOOP; END $assert$;\nCOMMIT;\n`;
}
export function buildRollback(before, applied) {
 validate(before);
 return begin + drift(applied) + '\n' + before.functions.map(f => `${f.definition};\nREVOKE ALL PRIVILEGES ON FUNCTION ${f.signature} FROM ${[...new Set(['PUBLIC','anon','authenticated','service_role',...f.grants.map(g=>g.role)])].map(r=>r==='PUBLIC'?'PUBLIC':ident(r)).join(', ')};\n` + f.grants.map(g=>`GRANT EXECUTE ON FUNCTION ${f.signature} TO ${g.role === 'PUBLIC' ? 'PUBLIC' : ident(g.role)}${g.grantable?' WITH GRANT OPTION':''};`).join('\n')).join('\n') + '\n' + drift(before) + '\nCOMMIT;\n';
}

// Both assertions precede all synthetic writes and any whole-database cleanup.
export const emptyDatabaseAssertion = `DO $empty$ DECLARE r record; n bigint; BEGIN
 IF (SELECT count(*) FROM auth.users)<>0 OR (SELECT count(*) FROM pg_tables WHERE schemaname='public')<>99 THEN RAISE EXCEPTION 'Expected empty 99-table synthetic database'; END IF;
 FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP EXECUTE format('SELECT count(*) FROM public.%I',r.tablename) INTO n; IF n<>0 THEN RAISE EXCEPTION 'Refuse nonempty synthetic database: %',r.tablename; END IF; END LOOP;
END $empty$;`;
