import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import test from "node:test";
import {parse} from "dotenv";
const {Client}=createRequire(import.meta.url)("pg");

test("延后删列只在本地事务中演练，关键查询和事务函数可用，结束恢复全部列",async()=>{
  const url=new URL(parse(readFileSync(".env.ai-test.local")).SUPABASE_DB_URL);
  assert.equal(url.hostname,"127.0.0.1");assert.equal(url.port,"54322");
  const db=new Client({connectionString:url.href});await db.connect();
  const sql=readFileSync("supabase/deferred-migrations/20261105072558_ai_config_drop_legacy_columns.sql","utf8").replace(/^begin;$/m,"").replace(/^commit;$/m,"");
  const columns=()=>db.query("select table_name,column_name from information_schema.columns where table_schema='public' and ((table_name='ai_provider_key_models' and column_name='global_is_enabled') or (table_name='ai_feature_bindings' and column_name='provider_key_model_id') or (table_name in ('ai_provider_keys','ai_providers') and column_name='priority')) order by table_name,column_name");
  const before=(await columns()).rows;assert.equal(before.length,4);
  try{
    await db.query("begin");await db.query(sql);assert.equal((await columns()).rows.length,0);
    await db.query("select m.id,m.model_id,m.is_enabled,m.sort_order,k.id,k.is_enabled,p.base_url,p.is_enabled from public.ai_provider_key_models m join public.ai_provider_keys k on k.id=m.key_id join public.ai_providers p on p.id=k.provider_id limit 1");
    await db.query("select feature_key,model_id,is_enabled,lifecycle_state from public.ai_feature_bindings limit 1");
    const created=(await db.query("select public.create_ai_config_channel(null,'https://deferred-drop-fixture.invalid/v1','deferred drop fixture','fixture','local-only','{}','[]',true) as result")).rows[0].result;
    await db.query("select public.set_ai_channel_model_selection($1,array['deferred-drop-model'],'{}')",[created.keyId]);
    await db.query("select public.update_ai_config_key($1,'{\"label\":\"changed\"}',null)",[created.keyId]);
  }finally{await db.query("rollback");assert.deepEqual((await columns()).rows,before);await db.end();}
});
