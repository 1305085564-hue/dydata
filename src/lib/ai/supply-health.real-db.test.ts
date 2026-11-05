import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { parse } from "dotenv";
import { CHANNEL_ESCALATION_WINDOW_SECONDS, CHANNEL_ESCALATION_MODEL_COUNT, CHANNEL_ESCALATION_PAUSE_SECONDS } from "./channel-governance";

const { Client } = createRequire(import.meta.url)("pg");

test("第二批真实库：故障隔离、升级条件、冷却、跨连接单次恢复与角色权限", async () => {
  const env = parse(readFileSync(".env.ai-test.local"));
  const url = new URL(env.SUPABASE_DB_URL);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
  assert.equal(url.port, "54322");
  const db = new Client({ connectionString: url.href });
  const other = new Client({ connectionString: url.href });
  await db.connect(); await other.connect();
  const provider = randomUUID(), key = randomUUID(), supplies = [randomUUID(), randomUUID(), randomUUID()];
  const record = (id: string, kind = "timeout", scope = "model", permanent = false) => db.query(
    "select public.record_ai_supply_failure($1,$2,$3,$4,'local fixture',$5,$6,$7)",
    [id, scope, kind, permanent, CHANNEL_ESCALATION_WINDOW_SECONDS, CHANNEL_ESCALATION_MODEL_COUNT, CHANNEL_ESCALATION_PAUSE_SECONDS]);
  const read = async (table: string, id: string) => (await db.query(`select * from public.${table} where id=$1`, [id])).rows[0];
  try {
    await db.query("insert into public.ai_providers(id,name,base_url) values($1,'local health fixture','https://fixture.test/v1')",[provider]);
    await db.query("insert into public.ai_provider_keys(id,provider_id,label,api_key) values($1,$2,'local fixture','local-only')",[key,provider]);
    for (const [index,id] of supplies.entries()) await db.query("insert into public.ai_provider_key_models(id,key_id,model_id,is_enabled) values($1,$2,$3,true)",[id,key,`health-${index}-${provider}`]);
    await record(supplies[0]);
    assert.equal((await read("ai_provider_keys",key)).consecutive_failures,0);
    assert.equal((await read("ai_provider_key_models",supplies[1])).consecutive_failures,0);
    let row = await read("ai_provider_key_models",supplies[0]);
    assert.equal(Math.round((row.unhealthy_until-row.last_failure_at)/60000),1);
    await record(supplies[1]); await record(supplies[2]);
    row = await read("ai_provider_keys",key);
    assert.equal(Math.round((row.unhealthy_until-row.last_failure_at)/1000),CHANNEL_ESCALATION_PAUSE_SECONDS);
    // Success between model failures prevents aggregation of earlier failures.
    await db.query("update public.ai_provider_keys set consecutive_failures=0,unhealthy_until=null,last_success_at=now() where id=$1",[key]);
    await record(supplies[0]);
    assert.equal((await read("ai_provider_keys",key)).consecutive_failures,0);
    // Long history alone is never permanent. Progression is bounded at one hour.
    await db.query("update public.ai_provider_key_models set first_failure_at=now()-interval '2 days', consecutive_failures=0 where id=$1",[supplies[0]]);
    for (const minutes of [1,5,30,60,60]) {
      await record(supplies[0],"other"); row=await read("ai_provider_key_models",supplies[0]);
      assert.equal(Math.round((row.unhealthy_until-row.last_failure_at)/60000),minutes);
      assert.equal(row.invalidated_at,null);
    }
    await db.query("update public.ai_provider_key_models set unhealthy_until=now()-interval '1 second' where id=$1",[supplies[0]]);
    const leases = await Promise.all([db,other].map(client=>client.query("select public.claim_ai_supply_recovery($1,65) as token",[supplies[0]])));
    const tokens = leases.map(result=>result.rows[0].token).filter(Boolean);
    assert.equal(tokens.length,1);
    await db.query("select public.release_ai_supply_recovery($1,$2)",[supplies[0],tokens[0]]);
    assert.ok((await other.query("select public.claim_ai_supply_recovery($1,65) as token",[supplies[0]])).rows[0].token);
    await record(supplies[2],"other","model",true);
    assert.ok((await read("ai_provider_key_models",supplies[2])).invalidated_at);
    assert.equal((await read("ai_provider_key_models",supplies[1])).invalidated_at,null);
    await record(supplies[0],"other","key",true);
    assert.ok((await read("ai_provider_keys",key)).invalidated_at);
    const grants = await db.query("select has_function_privilege('anon','public.claim_ai_supply_recovery(uuid,integer)','execute') as anon,has_function_privilege('authenticated','public.record_ai_supply_failure(uuid,text,text,boolean,text,integer,integer,integer)','execute') as member,has_function_privilege('service_role','public.claim_ai_supply_recovery(uuid,integer)','execute') as service");
    assert.deepEqual(grants.rows[0],{anon:false,member:false,service:true});
  } finally {
    await db.query("delete from public.ai_providers where id=$1",[provider]);
    await other.end(); await db.end();
  }
});
