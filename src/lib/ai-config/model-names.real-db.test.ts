import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { parse } from "dotenv";
const { Client } = createRequire(import.meta.url)("pg");

test("第三批真实迁移：只回填原始名/旧自动名，人工名、日期、变体和身份保持独立", async () => {
  const target = new URL(parse(readFileSync(".env.ai-test.local")).SUPABASE_DB_URL);
  assert.equal(target.hostname,"127.0.0.1"); assert.equal(target.port,"54322");
  const db = new Client({connectionString:target.href}); await db.connect();
  const provider=randomUUID(), keys=[randomUUID(),randomUUID(),randomUUID()];
  const sql=readFileSync("supabase/migrations/20261105070700_ai_generated_model_display_names.sql","utf8").replace(/^begin;$/m,"").replace(/^commit;$/m,"");
  try {
    await db.query("begin");
    await db.query("insert into public.ai_providers(id,name,base_url) values($1,$2,'https://fixture.test/v1')",[provider,provider]);
    for(const key of keys) await db.query("insert into public.ai_provider_keys(id,provider_id,label,api_key) values($1::uuid,$2::uuid,$1::text,'local-only')",[key,provider]);
    await db.query("insert into public.ai_provider_key_models(key_id,model_id,display_name) values($1,'claude-haiku-5-5','claude-haiku-5-5'),($2,'claude-haiku-5-5','Claude Haiku 5 5'),($3,'claude-haiku-5-5','人工名称'),($1,'claude-haiku-4-5-20251001','Claude 4.5 Haiku'),($1,'claude-haiku-5-5-thinking','Claude Haiku 5 5 Thinking')",keys);
    const read=async()=>(await db.query("select id,key_id,model_id,display_name from public.ai_provider_key_models where key_id=any($1::uuid[]) order by key_id,model_id",[keys])).rows;
    const before=await read(); await db.query(sql); const after=await read();
    assert.deepEqual(after.map((row: {id:string;key_id:string;model_id:string})=>[row.id,row.key_id,row.model_id]),before.map((row: {id:string;key_id:string;model_id:string})=>[row.id,row.key_id,row.model_id]));
    assert.equal(after.find((row:{key_id:string;model_id:string})=>row.key_id===keys[0]&&row.model_id==='claude-haiku-5-5').display_name,'Claude Haiku 5.5');
    assert.equal(after.find((row:{key_id:string})=>row.key_id===keys[1]).display_name,'Claude Haiku 5.5');
    assert.equal(after.find((row:{key_id:string})=>row.key_id===keys[2]).display_name,'人工名称');
    assert.ok(after.some((row:{display_name:string})=>row.display_name==='Claude Haiku 4.5 (2025-10-01)'));
    assert.ok(after.some((row:{display_name:string})=>row.display_name==='Claude Haiku 5.5 (Thinking)'));
    await db.query(sql); assert.deepEqual(await read(),after);
  } finally {await db.query("rollback"); await db.end();}
});
