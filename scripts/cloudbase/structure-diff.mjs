#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, chmodSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { loadCloudBaseManager, parseSingleJsonResult } from './cutover-cloudbase-driver.mjs';
import { isAuthorizedSourceIdentity } from './cutover-core.mjs';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname, '..');
const MANAGER_MODULE = '/Users/mac/.npm/_npx/88d9f76c32260533/node_modules/@cloudbase/cloudbase-mcp/dist/index.cjs';
const outputPath = process.argv[process.argv.indexOf('--output') + 1];
const sourceUrlText = process.env.DYDATA_CUTOVER_SOURCE_URL ?? '';
if (!outputPath || !sourceUrlText) throw new Error('需要 --output 和 DYDATA_CUTOVER_SOURCE_URL');
const adaptationManifestPath = path.join(ROOT, 'scripts', 'cloudbase', 'target-structure-adaptations.json');
const adaptationManifest = JSON.parse(readFileSync(adaptationManifestPath, 'utf8'));
const adaptationByKey = new Map(adaptationManifest.entries.map((entry) => [`${entry.kind}|${entry.key}`, entry.reason]));
const sourceUrl = new URL(sourceUrlText);
const sourceIdentity = { host: sourceUrl.hostname, port: sourceUrl.port || '5432', database: sourceUrl.pathname.slice(1), user: decodeURIComponent(sourceUrl.username) };
if (!isAuthorizedSourceIdentity(sourceIdentity)) throw new Error('来源身份不在授权范围');

const CATALOG_SQL = `SELECT jsonb_build_object(
  'tables',coalesce((SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private') AND c.relkind IN ('r','p','v','m','f')),'[]'::jsonb),
  'columns',coalesce((SELECT jsonb_agg(jsonb_build_object('schema',table_schema,'table',table_name,'name',column_name,'type',data_type,'udt_schema',udt_schema,'udt_name',udt_name,'nullable',is_nullable,'default',column_default,'identity',identity_generation,'generated',is_generated,'generation',generation_expression) ORDER BY table_schema,table_name,ordinal_position) FROM information_schema.columns WHERE table_schema IN ('public','private')),'[]'::jsonb),
  'constraints',coalesce((SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'table',cl.relname,'name',c.conname,'type',c.contype,'definition',pg_get_constraintdef(c.oid,true)) ORDER BY n.nspname,cl.relname,c.conname) FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid JOIN pg_namespace n ON n.oid=cl.relnamespace WHERE n.nspname IN ('public','private') AND c.contype IN ('p','u','f','c','x','n')),'[]'::jsonb),
  'indexes',coalesce((SELECT jsonb_agg(jsonb_build_object('schema',schemaname,'table',tablename,'name',indexname,'definition',indexdef) ORDER BY schemaname,tablename,indexname) FROM pg_indexes WHERE schemaname IN ('public','private')),'[]'::jsonb),
  'triggers',coalesce((SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'table',cl.relname,'name',t.tgname,'definition',pg_get_triggerdef(t.oid,true)) ORDER BY n.nspname,cl.relname,t.tgname) FROM pg_trigger t JOIN pg_class cl ON cl.oid=t.tgrelid JOIN pg_namespace n ON n.oid=cl.relnamespace WHERE n.nspname IN ('public','private') AND NOT t.tgisinternal),'[]'::jsonb),
  'functions',coalesce((SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'identity_args',pg_get_function_identity_arguments(p.oid),'returns',pg_get_function_result(p.oid),'language',l.lanname,'security_definer',p.prosecdef,'definition_sha256',md5(pg_get_functiondef(p.oid))) ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname IN ('public','private') AND p.prokind IN ('f','p')),'[]'::jsonb),
  'policies',coalesce((SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'table',cl.relname,'name',pol.polname,'command',pol.polcmd,'roles',(SELECT coalesce(jsonb_agg(r.rolname ORDER BY r.rolname),'[]'::jsonb) FROM pg_roles r WHERE r.oid=ANY(pol.polroles)),'using',pg_get_expr(pol.polqual,pol.polrelid),'check',pg_get_expr(pol.polwithcheck,pol.polrelid)) ORDER BY n.nspname,cl.relname,pol.polname) FROM pg_policy pol JOIN pg_class cl ON cl.oid=pol.polrelid JOIN pg_namespace n ON n.oid=cl.relnamespace WHERE n.nspname IN ('public','private')),'[]'::jsonb),
  'extensions',coalesce((SELECT jsonb_agg(jsonb_build_object('name',e.extname,'version',e.extversion) ORDER BY e.extname) FROM pg_extension e WHERE e.extname NOT IN ('plpgsql')),'[]'::jsonb)
)::text AS catalog;`;

function normalize(value) { return typeof value === 'string' ? value.replaceAll('(auth.uid())::uuid','auth.uid()').replaceAll('((auth.uid())::uuid)','(auth.uid())').replaceAll(/\s+/g,' ').trim() : value; }
function key(kind,item) { const fields={tables:['schema','name'],columns:['schema','table','name'],constraints:['schema','table','name'],indexes:['schema','table','name'],triggers:['schema','table','name'],functions:['schema','name','identity_args'],policies:['schema','table','name'],extensions:['name']}[kind]; return fields.map((f)=>`${f}=${item[f] ?? ''}`).join('|'); }
function comparable(item) { if (!item) return item; const copy={...item}; for (const field of ['definition','using','check']) if (field in copy) copy[field]=normalize(copy[field]); return copy; }
function migrationCandidates(item) {
  const files=[];
  for (const entry of readdirSync(path.join(ROOT,'supabase','migrations'),{withFileTypes:true})) {
    const candidates=entry.isFile()?[path.join(ROOT,'supabase','migrations',entry.name)]:entry.isDirectory()&&['rollback','补丁'].includes(entry.name)?readdirSync(path.join(ROOT,'supabase','migrations',entry.name)).map((name)=>path.join(ROOT,'supabase','migrations',entry.name,name)):[];
    for (const file of candidates) { if (!file.endsWith('.sql')) continue; const text=readFileSync(file,'utf8'); const needle=item.name||item.table||''; if (needle && text.includes(needle)) files.push(path.relative(ROOT,file)); }
  }
  return files;
}
async function sourceCatalog() { const client=new Client({host:sourceUrl.hostname,port:Number(sourceUrl.port||5432),user:decodeURIComponent(sourceUrl.username),password:decodeURIComponent(sourceUrl.password),database:sourceUrl.pathname.slice(1),ssl:{rejectUnauthorized:false},application_name:'dydata-structure-diff-readonly'}); await client.connect(); try { await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); const result=await client.query(CATALOG_SQL); await client.query('COMMIT'); return JSON.parse(result.rows[0].catalog); } catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;} finally{await client.end();} }
async function targetCatalog() { const manager=await loadCloudBaseManager(MANAGER_MODULE); const result=await manager.database.executePGSql({Sql:`BEGIN READ ONLY; SET LOCAL timezone='UTC'; ${CATALOG_SQL} COMMIT;`}); return parseSingleJsonResult(result); }
const [source,target]=await Promise.all([sourceCatalog(),targetCatalog()]);
const differences=[]; for (const kind of ['tables','columns','constraints','indexes','triggers','functions','policies','extensions']) { const sm=new Map((source[kind]||[]).map((item)=>[key(kind,item),item])); const tm=new Map((target[kind]||[]).map((item)=>[key(kind,item),item])); for (const id of new Set([...sm.keys(),...tm.keys()])) { const s=sm.get(id)||null,t=tm.get(id)||null; if (JSON.stringify(comparable(s))===JSON.stringify(comparable(t))) continue; const adaptation=adaptationByKey.get(`${kind}|${id}`)??null; differences.push({kind,key:id,source:s,target:t,migrations:migrationCandidates(s||t),registeredAdaptation:adaptation}); } }
const unregisteredCount=differences.filter((difference)=>!difference.registeredAdaptation).length;
const result={generatedAt:new Date().toISOString(),sourceIdentity:{host:sourceIdentity.host,port:sourceIdentity.port,database:sourceIdentity.database,user:sourceIdentity.user},counts:Object.fromEntries(Object.keys(source).map((kind)=>[kind,{source:source[kind].length,target:target[kind].length}])),differenceCount:differences.length,unregisteredCount,differences,source,target};
mkdirSync(path.dirname(outputPath),{recursive:true,mode:0o700});writeFileSync(outputPath,`${JSON.stringify(result,null,2)}\n`,{mode:0o600});chmodSync(outputPath,0o600);console.log(JSON.stringify({output:outputPath,differenceCount:differences.length,counts:result.counts}));
