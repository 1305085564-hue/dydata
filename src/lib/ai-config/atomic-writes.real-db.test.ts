import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { parse } from "dotenv";
const {Client}=createRequire(import.meta.url)("pg");

test("第四批真实事务：接入、改名、批选、共享地址和审计删除失败均无半成品",async()=>{
  const url=new URL(parse(readFileSync(".env.ai-test.local")).SUPABASE_DB_URL);
  assert.equal(url.hostname,"127.0.0.1");assert.equal(url.port,"54322");
  const db=new Client({connectionString:url.href});await db.connect();
  const address=`https://${randomUUID()}.fixture.test/v1`,model=`atomic-${randomUUID()}`;
  async function rejected(sql:string,args:unknown[]){
    await db.query("savepoint expected_failure");
    await assert.rejects(()=>db.query(sql,args));
    await db.query("rollback to savepoint expected_failure");
  }
  const create=(label:string,models:unknown)=>db.query("select public.create_ai_config_channel(null,$1,$1,$2,'local-only',$3,$4,true) as result",[address,label,[model],JSON.stringify(models)]);
  try{
    await db.query("begin");
    const createSql="select public.create_ai_config_channel(null,$1,$1,'invalid','local-only','{}',$2,true)";
    await rejected(createSql,[address,JSON.stringify([{model_id:null,display_name:"bad",is_enabled:true}])]);
    assert.equal((await db.query("select count(*)::int as n from public.ai_providers where base_url=$1",[address])).rows[0].n,0);
    const first=(await create("first",[{model_id:model,display_name:"原名",is_enabled:true}])).rows[0].result;
    const second=(await create("second",[{model_id:model,display_name:"原名",is_enabled:true}])).rows[0].result;
    assert.equal(first.providerId,second.providerId);assert.equal(first.affectedCount,1);
    const supplies=(await db.query("select id,key_id,display_name from public.ai_provider_key_models where model_id=$1 order by id",[model])).rows;
    const supply=supplies.find((row:{key_id:string})=>row.key_id===first.keyId).id;
    await rejected("select public.update_ai_config_model($1,$2)",[supply,JSON.stringify({display_name:"不应留下",key_id:randomUUID()})]);
    assert.deepEqual((await db.query("select id,key_id,display_name from public.ai_provider_key_models where model_id=$1 order by id",[model])).rows,supplies);
    await db.query("select public.update_ai_config_model($1,$2)",[supply,JSON.stringify({display_name:"统一新名"})]);
    assert.ok((await db.query("select display_name from public.ai_provider_key_models where model_id=$1",[model])).rows.every((row:{display_name:string})=>row.display_name==="统一新名"));
    await db.query("update public.ai_provider_keys set invalidated_at=now(),consecutive_failures=1 where id=$1",[first.keyId]);
    await rejected("select public.update_ai_config_key($1,$2,$3)",[first.keyId,JSON.stringify({label:"second"}),`${address}/new`]);
    assert.equal((await db.query("select base_url from public.ai_providers where id=$1",[first.providerId])).rows[0].base_url,address);
    assert.ok((await db.query("select invalidated_at from public.ai_provider_keys where id=$1",[first.keyId])).rows[0].invalidated_at);
    // Fail after the new model insert, during the later disable step.
    await db.query(`create function pg_temp.reject_atomic_disable() returns trigger language plpgsql as $$ begin if new.id='${supply}'::uuid and not new.is_enabled then raise exception 'intentional local disable failure'; end if; return new; end $$`);
    await db.query("create trigger local_atomic_disable before update on public.ai_provider_key_models for each row execute function pg_temp.reject_atomic_disable()");
    const newModel=`new-${randomUUID()}`;
    await rejected("select public.set_ai_channel_model_selection($1,$2,'{}')",[first.keyId,[newModel]]);
    assert.equal((await db.query("select count(*)::int as n from public.ai_provider_key_models where model_id=$1",[newModel])).rows[0].n,0);
    assert.equal((await db.query("select is_enabled from public.ai_provider_key_models where id=$1",[supply])).rows[0].is_enabled,true);
    await db.query("drop trigger local_atomic_disable on public.ai_provider_key_models");
    await rejected("select public.remove_ai_config_supply_with_audit($1,$2,'local fixture')",[supply,randomUUID()]);
    assert.equal((await db.query("select count(*)::int as n from public.ai_provider_key_models where id=$1",[supply])).rows[0].n,1);
    // Restoring one tested supply never clears its sibling's permanent failure.
    await db.query("update public.ai_provider_key_models set invalidated_at=now(),consecutive_failures=1 where id=any($1::uuid[])",[supplies.map((row:{id:string})=>row.id)]);
    await db.query("select public.enable_ai_config_supply($1,$2,'ignored custom name')",[first.keyId,model]);
    const states=(await db.query("select id,invalidated_at,display_name from public.ai_provider_key_models where model_id=$1",[model])).rows;
    assert.equal(states.find((row:{id:string})=>row.id===supply).invalidated_at,null);
    assert.ok(states.find((row:{id:string})=>row.id!==supply).invalidated_at);
    assert.ok(states.every((row:{display_name:string})=>row.display_name==="统一新名"));
    const sibling=`sibling-${randomUUID()}`;
    await db.query("insert into public.ai_provider_key_models(key_id,model_id,display_name,invalidated_at,consecutive_failures) values($1,$2,$2,now(),1)",[second.keyId,sibling]);
    await db.query("update public.ai_provider_keys set invalidated_at=now(),consecutive_failures=1 where id=$1",[second.keyId]);
    const beforeSync=(await db.query("select last_success_at from public.ai_provider_key_models where key_id=$1 and model_id=$2",[second.keyId,model])).rows[0].last_success_at;
    const syncArgs=[second.keyId,[model,sibling],JSON.stringify([{model_id:model,display_name:"must preserve custom"},{model_id:sibling,display_name:"统一新名"}])];
    await db.query("select public.sync_ai_config_models($1,$2,$3,false)",syncArgs);
    assert.ok((await db.query("select invalidated_at from public.ai_provider_key_models where key_id=$1 and model_id=$2",[second.keyId,model])).rows[0].invalidated_at);
    await db.query("select public.sync_ai_config_models($1,$2,$3,true)",syncArgs);
    const retriable=(await db.query("select invalidated_at,consecutive_failures,last_success_at,display_name from public.ai_provider_key_models where key_id=$1 and model_id=$2",[second.keyId,model])).rows[0];
    assert.ok(retriable.invalidated_at, "同步清单不能解除失效标记");assert.equal(retriable.consecutive_failures,1);assert.deepEqual(retriable.last_success_at,beforeSync);assert.equal(retriable.display_name,"统一新名");
    assert.ok((await db.query("select invalidated_at from public.ai_provider_key_models where key_id=$1 and model_id=$2",[second.keyId,sibling])).rows[0].invalidated_at);
    await db.query("delete from public.ai_provider_keys where id=$1",[first.keyId]);
    assert.equal((await db.query("select count(*)::int as n from public.ai_provider_key_models where key_id=$1",[first.keyId])).rows[0].n,0);
    const roles=(await db.query("select has_function_privilege('anon','public.create_ai_config_channel(uuid,text,text,text,text,text[],jsonb,boolean)','execute') as anon,has_function_privilege('authenticated','public.update_ai_config_key(uuid,jsonb,text)','execute') as member,has_function_privilege('service_role','public.update_ai_config_key(uuid,jsonb,text)','execute') as service")).rows[0];
    assert.deepEqual(roles,{anon:false,member:false,service:true});
  }finally{await db.query("rollback");await db.end();}
});
