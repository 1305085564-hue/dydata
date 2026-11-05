import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { parse } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { claimProviderRecovery, releaseProviderRecovery } from "./provider-routing";

const { Client } = createRequire(import.meta.url)("pg");

test("第14条真实库：冷却补试跨连接只准一个、旧接口仍等冷却、失效/关闭不准试", async () => {
  const env = parse(readFileSync(".env.ai-test.local"));
  const url = new URL(env.SUPABASE_DB_URL);
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "54322");
  assert.equal(new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname, "127.0.0.1");
  const db = new Client({ connectionString: url.href });
  const other = new Client({ connectionString: url.href });
  const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  await db.connect(); await other.connect();
  const provider = randomUUID(), key = randomUUID(), supply = randomUUID();
  try {
    await db.query("insert into public.ai_providers(id,name,base_url) values($1,'last-resort fixture','https://fixture.test/v1')", [provider]);
    await db.query("insert into public.ai_provider_keys(id,provider_id,label,api_key) values($1,$2,'last-resort fixture','local-only')", [key,provider]);
    await db.query("insert into public.ai_provider_key_models(id,key_id,model_id,is_enabled,consecutive_failures,unhealthy_until) values($1,$2,$3,true,1,now()+interval '1 hour')", [supply,key,`last-resort-${provider}`]);
    // Governance treats a future cooling deadline as sleeping even without failure counters.
    await db.query("update public.ai_provider_key_models set consecutive_failures=0 where id=$1", [supply]);
    const coolingOnlyToken = await claimProviderRecovery(service, supply, 15_000, true);
    assert.ok(coolingOnlyToken);
    await releaseProviderRecovery(service, supply, coolingOnlyToken!);
    await db.query("update public.ai_provider_key_models set consecutive_failures=1 where id=$1", [supply]);
    assert.equal(await claimProviderRecovery(service, supply, 15_000), null);
    // Exercise named PostgREST RPC arguments, not only SQL overload resolution.
    const apiToken = await claimProviderRecovery(service, supply, 15_000, true);
    assert.ok(apiToken);
    assert.equal(await claimProviderRecovery(service, supply, 15_000, true), null);
    await releaseProviderRecovery(service, supply, apiToken!);
    const leases = await Promise.all([db,other].map(client => client.query("select public.claim_ai_supply_recovery($1,20,true) as token", [supply])));
    const tokens = leases.map(result => result.rows[0].token).filter(Boolean);
    assert.equal(tokens.length, 1);
    await releaseProviderRecovery(service, supply, tokens[0]);
    for (const [table, patch, restore] of [
      ["ai_provider_key_models", "is_enabled=false", "is_enabled=true"],
      ["ai_provider_key_models", "invalidated_at=now()", "invalidated_at=null"],
      ["ai_provider_keys", "is_enabled=false", "is_enabled=true"],
      ["ai_provider_keys", "invalidated_at=now()", "invalidated_at=null"],
      ["ai_providers", "is_enabled=false", "is_enabled=true"],
    ]) {
      const id = table === "ai_providers" ? provider : table === "ai_provider_keys" ? key : supply;
      await db.query(`update public.${table} set ${patch} where id=$1`, [id]);
      assert.equal(await claimProviderRecovery(service, supply, 15_000, true), null);
      await db.query(`update public.${table} set ${restore} where id=$1`, [id]);
    }
    // Channel-level cooling shares the same lease across sibling supplies.
    const sibling = randomUUID();
    await db.query("insert into public.ai_provider_key_models(id,key_id,model_id,is_enabled) values($1,$2,$3,true)", [sibling,key,`sibling-${provider}`]);
    await db.query("update public.ai_provider_keys set consecutive_failures=1,unhealthy_until=now()+interval '1 hour' where id=$1", [key]);
    const token = await claimProviderRecovery(service, supply, 15_000, true); assert.ok(token);
    assert.equal(await claimProviderRecovery(service, sibling, 15_000, true), null);
    await releaseProviderRecovery(service, supply, token!);
    const grants = await db.query("select has_function_privilege('anon','public.claim_ai_supply_recovery(uuid,integer,boolean)','execute') as anon,has_function_privilege('authenticated','public.claim_ai_supply_recovery(uuid,integer,boolean)','execute') as member,has_function_privilege('service_role','public.claim_ai_supply_recovery(uuid,integer,boolean)','execute') as service");
    assert.deepEqual(grants.rows[0], { anon:false, member:false, service:true });
  } finally {
    await db.query("delete from public.ai_providers where id=$1", [provider]);
    await other.end(); await db.end();
  }
});
