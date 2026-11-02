// Creates a NEW loopback Supabase project from the historical DDL snapshot only.
// Never imports production rows, Auth identities, passwords, Storage, or credentials.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { ident, snapshotQuery } from './permission-batch-a.mjs';
const directory=process.env.DYDATA_BATCH_A_LOCAL_DIR;
const source=process.env.DYDATA_BATCH_A_SOURCE_DIR;
assert(directory?.startsWith('/tmp/dydata-supabase-batch-a-') && source,'Explicit private local directory and DDL snapshot directory required');
assert(!existsSync(join(directory,'supabase')),'Refuse to overwrite an existing project');
mkdirSync(directory,{recursive:true,mode:0o700});chmodSync(directory,0o700);
const schema=readFileSync(join(source,'schema.sql'),'utf8');
const privateCatalog=JSON.parse(readFileSync(join(source,'private-catalog.json'),'utf8'));
const acl=JSON.parse(readFileSync(join(source,'acl_snapshot.json'),'utf8'));
const catalog=JSON.parse(readFileSync(join(source,'catalog.json'),'utf8'));
assert.equal(catalog.counts.tables,99);assert.equal(catalog.counts.policies,240);assert.equal(privateCatalog.functions.length,4);
execFileSync('supabase',['init','--workdir',directory],{stdio:['ignore','pipe','pipe']});
const config=join(directory,'supabase/config.toml');let cfg=readFileSync(config,'utf8');writeFileSync(config+'.original',cfg,{mode:0o600});
const port=Number(process.env.DYDATA_BATCH_A_API_PORT||55921);assert(Number.isInteger(port)&&port>=55800&&port<56000);
for(const [old,newPort] of [[54321,port],[54322,port+1],[54320,port-1],[54323,port+2],[54324,port+3],[54327,port+6]])cfg=cfg.replace(`port = ${old}`,`port = ${newPort}`);
for(const section of ['studio','realtime','local_smtp','storage','storage.s3_protocol','storage.vector','analytics','edge_runtime'])cfg=cfg.replace(`[${section}]\nenabled = true`,`[${section}]\nenabled = false`);
writeFileSync(config,cfg,{mode:0o600});
const projectName=cfg.match(/^project_id = "([^"]+)"/m)[1];
assert.match(projectName,/^dydata-supabase-batch-a-[a-z0-9-]+$/);
const existingVolumes=execFileSync('docker',['volume','ls','--format','{{.Name}}'],{encoding:'utf8'}).trim().split('\n');
assert(!existingVolumes.some(n=>n.endsWith('_'+projectName)),'Refuse to reuse an existing project volume');
let started;
try{started=execFileSync('supabase',['start','--workdir',directory,'--exclude','realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});}catch(e){writeFileSync(join(directory,'start-error.private.log'),String(e.stderr),{mode:0o600});throw Error('Local stack start failed; private log retained');}
writeFileSync(join(directory,'start.private.log'),started,{mode:0o600});
const project=cfg.match(/^project_id = "([^"]+)"/m)[1];assert.match(project,/^dydata-supabase-batch-a-[a-z0-9-]+$/);const container=`supabase_db_${project}`;
const sql=text=>execFileSync('docker',['exec','-i',container,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-XAtq'],{input:text,encoding:'utf8',stdio:['pipe','pipe','pipe']});
assert.equal(sql('SELECT count(*) FROM auth.users').trim(),'0');
// Complete the public dump's external dependencies BEFORE compiling its policies.
const privateSql='CREATE SCHEMA private;\n'+privateCatalog.functions.map(f=>f.definition+';\nREVOKE ALL ON FUNCTION '+f.signature+' FROM PUBLIC,anon,authenticated,service_role;\nGRANT EXECUTE ON FUNCTION '+f.signature+' TO authenticated;').join('\n')+'\nGRANT USAGE ON SCHEMA private TO authenticated;\n';
let ddl=schema.split('\n').filter(l=>!l.startsWith('\\restrict')&&!l.startsWith('\\unrestrict')).join('\n');
ddl=ddl.replace('CREATE SCHEMA public;','CREATE SCHEMA public;\nCREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;');
const policy=ddl.indexOf('CREATE POLICY ');assert(policy>0);ddl=ddl.slice(0,policy)+privateSql+ddl.slice(policy);
const statements=['DROP SCHEMA public CASCADE;',ddl,'ALTER SCHEMA public OWNER TO pg_database_owner;','SET search_path=pg_catalog,public,extensions;'];
const seen=new Set();
for(const r of [...acl.schema,...acl.relations,...acl.routines]){
 const kind=r.identity_arguments!==undefined?'FUNCTION':r.schema&&!r.name?'SCHEMA':r.kind==='S'?'SEQUENCE':'TABLE';
 const name=kind==='SCHEMA'?ident(r.schema):`${ident(r.schema)}.${ident(r.name)}${kind==='FUNCTION'?'('+r.identity_arguments+')':''}`;
 const key=kind+' '+name;
 if(!seen.has(key)){statements.push(`REVOKE ALL ON ${key} FROM PUBLIC,anon,authenticated,service_role;`);seen.add(key);}
 statements.push(`GRANT ${r.privilege} ON ${key} TO ${r.grantee==='PUBLIC'?'PUBLIC':ident(r.grantee)}${r.grantable?' WITH GRANT OPTION':''};`);
}
for(const r of acl.columns_explicit)statements.push(`GRANT ${r.privilege} (${ident(r.column)}) ON TABLE ${ident(r.schema)}.${ident(r.table)} TO ${ident(r.grantee)};`);
const localSql=statements.join('\n');writeFileSync(join(directory,'bootstrap.local.sql'),localSql,{mode:0o600});
try{sql(localSql);}catch(e){writeFileSync(join(directory,'bootstrap-error.log'),String(e.stderr),{mode:0o600});throw Error('Local bootstrap failed; no automatic retries');}
const restored=JSON.parse(sql(snapshotQuery));assert.equal(restored.functions.length,31);
sql("NOTIFY pgrst,'reload schema'");
const receipt={project,directory,productionAccessed:false,productionDataImported:false,counts:catalog.counts,sourceHashes:Object.fromEntries(['schema.sql','private-catalog.json','acl_snapshot.json'].map(n=>[n,createHash('sha256').update(readFileSync(join(source,n))).digest('hex')]))};
writeFileSync(join(directory,'bootstrap-receipt.json'),JSON.stringify(receipt,null,2),{mode:0o600});console.log(JSON.stringify(receipt));
