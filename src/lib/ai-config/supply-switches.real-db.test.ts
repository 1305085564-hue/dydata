import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { parse } from "dotenv";

const { Client } = createRequire(import.meta.url)("pg");

test("第一批迁移：保留原开关记忆，空模型不继承钉渠道，重跑结果一致", async () => {
  const env = parse(readFileSync(".env.ai-test.local"));
  const target = new URL(env.SUPABASE_DB_URL);
  assert.ok(["127.0.0.1", "localhost"].includes(target.hostname));
  assert.equal(target.port, "54322");
  const db = new Client({ connectionString: target.href });
  await db.connect();
  const provider = randomUUID(), key = randomUUID(), marked = randomUUID(), manual = randomUUID(), undecided = randomUUID();
  const feature = `plan-migration-${randomUUID()}`;
  const migration = readFileSync("supabase/migrations/20261105062301_ai_config_supply_switches.sql", "utf8")
    .replace(/^begin;$/m, "").replace(/^commit;$/m, "");
  try {
    await db.query("begin");
    await db.query("insert into public.ai_providers(id,name,base_url) values($1,'local migration fixture','https://fixture.test/v1')", [provider]);
    await db.query("insert into public.ai_provider_keys(id,provider_id,label,api_key) values($1,$2,'local migration fixture','local-only')", [key, provider]);
    await db.query("insert into public.ai_provider_key_models(id,key_id,model_id,is_enabled,global_is_enabled) values($1,$4,$5,true,false),($2,$4,$6,false,false),($3,$4,$7,true,null)", [marked, manual, undecided, key, `marked-${marked}`, `manual-${manual}`, `new-${undecided}`]);
    await db.query("insert into public.ai_feature_bindings(feature_key,label,model_id,provider_key_model_id) values($1,'local migration fixture',null,$2)", [feature, marked]);
    await db.query(migration);
    const read = async () => (await db.query("select id,is_enabled,disabled_by_model from public.ai_provider_key_models where id=any($1::uuid[]) order by id", [[marked, manual, undecided]])).rows;
    const before = await read();
    assert.deepEqual(before.find((row: { id: string }) => row.id === marked), { id: marked, is_enabled: false, disabled_by_model: true });
    assert.deepEqual(before.find((row: { id: string }) => row.id === manual), { id: manual, is_enabled: false, disabled_by_model: false });
    assert.deepEqual(before.find((row: { id: string }) => row.id === undecided), { id: undecided, is_enabled: true, disabled_by_model: false });
    assert.deepEqual((await db.query("select model_id,provider_key_model_id from public.ai_feature_bindings where feature_key=$1", [feature])).rows, [{ model_id: null, provider_key_model_id: null }]);
    await db.query(migration);
    assert.deepEqual(await read(), before);
  } finally {
    await db.query("rollback");
    await db.end();
  }
});
