import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import test from "node:test";
import { parse } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { buildAiConfigResponse } from "./route";

test("第三批真实接口：地址自动归组、共享地址确认、候选测通才打开、同步撤下上游已移除模型", async () => {
  const env=parse(readFileSync(".env.ai-test.local"));
  assert.match(env.NEXT_PUBLIC_SUPABASE_URL,/^http:\/\/127\.0\.0\.1:54321$/);
  const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
  const model=`discovery-${randomUUID()}`, dead=`dead-${randomUUID()}`, limited=`limited-${randomUUID()}`;
  let upstreamListsDead = true;
  const server=createServer(async(req,res)=>{
    res.setHeader("content-type","application/json");
    if(req.url?.endsWith("/models")) {
      const ids = upstreamListsDead ? [model,dead,limited] : [model,limited];
      res.end(JSON.stringify({data:ids.map(id=>({id}))}));return;
    }
    let raw="";for await(const chunk of req) raw+=chunk;
    const requested=JSON.parse(raw).model;
    if(requested===dead){res.statusCode=404;res.end('{"error":"model_not_found"}');return;}
    if(requested===limited){res.statusCode=429;res.end('{"error":"model rate limit"}');return;}
    res.end('{"choices":[{"message":{"content":"ok"}}]}');
  });
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const address=`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`;
  const actor={createAdminClient:()=>db as never,requireSystemActor:async()=>({supabase:db as never,actor:{userId:randomUUID(),role:"owner"} as never})};
  const command=(action:string,data:Record<string,unknown>,entity?:string)=>buildAiConfigResponse(new NextRequest("http://localhost/api/admin/ai-config",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,data,entity})}),actor);
  let providerId:string|undefined;
  try {
    const first=await command("create",{base_url:address,label:"first",api_key:"local-only",selected_model_ids:[model]},"key");
    assert.equal(first.status,200); const firstBody=await first.json();
    providerId=firstBody.providers.find((item:{base_url:string})=>item.base_url===address)?.id;assert.ok(providerId);
    assert.equal((await command("create",{base_url:`${address}/`,label:"second",api_key:"local-only",selected_model_ids:[]},"key")).status,200);
    const keys=(await db.from("ai_provider_keys").select("id,label").eq("provider_id",providerId!)).data!;assert.equal(keys.length,2);
    const second=keys.find(row=>row.label==="second")!.id;
    const impact=await command("update",{id:second,base_url:address.replace("/v1","/v2")},"key");
    assert.equal(impact.status,409);assert.equal((await impact.json()).sharedAddressImpact.affectedKeyCount,2);
    assert.equal((await command("update",{id:second,base_url:address.replace("/v1","/v2"),confirm_shared_address:true},"key")).status,200);
    assert.equal((await db.from("ai_providers").select("base_url").eq("id",providerId!).single()).data?.base_url,address.replace("/v1","/v2"));
    const found=await command("find_model_channels",{model_id:model});assert.equal(found.status,200);
    assert.deepEqual((await found.json()).candidates.map((row:{keyId:string})=>row.keyId),[second]);
    const opened=await command("enable_model_channel",{key_id:second,model_id:model});assert.equal(opened.status,200);assert.equal((await opened.json()).enableResult.testResult.ok,true);
    const failed=await command("enable_model_channel",{key_id:second,model_id:limited});assert.equal(failed.status,422);
    assert.equal((await db.from("ai_provider_key_models").select("is_enabled").eq("key_id",second).eq("model_id",limited).single()).data?.is_enabled,false);
    const unhealthyUntil = new Date(Date.now() + 5 * 60_000).toISOString();
    const invalidatedAt = new Date(Date.now() - 60_000).toISOString();
    const beforeHealth = await db.from("ai_provider_key_models").select("id, invalidated_at, unhealthy_until, consecutive_failures, last_error_message, is_enabled, display_name, sort_order").eq("key_id", second).eq("model_id", model).single();
    assert.equal(beforeHealth.error, null);
    assert.equal((await db.from("ai_provider_key_models").update({ invalidated_at: invalidatedAt, unhealthy_until: unhealthyUntil, consecutive_failures: 2, last_error_message: "keep model failure" }).eq("key_id", second).eq("model_id", model)).error, null);
    assert.equal((await db.from("ai_provider_keys").update({ invalidated_at: invalidatedAt, unhealthy_until: unhealthyUntil, consecutive_failures: 3, last_error_message: "keep key failure" }).eq("id", second)).error, null);
    upstreamListsDead = false;
    const sync = await command("sync_key_models", { key_id: second });
    assert.equal(sync.status, 200);
    const syncBody = await sync.json();
    assert.equal(syncBody.syncResult.removedCount, 1);
    assert.deepEqual(syncBody.syncResult.removedModelIds, [dead]);
    assert.deepEqual(
      (await db.from("ai_provider_key_models").select("model_id").eq("key_id", second)).data?.map((row:{model_id:string})=>row.model_id).sort(),
      [model, limited].sort(),
    );
    const afterHealth = await db.from("ai_provider_key_models").select("invalidated_at, unhealthy_until, consecutive_failures, last_error_message, is_enabled, display_name, sort_order").eq("key_id", second).eq("model_id", model).single();
    assert.equal(afterHealth.error, null);
    assert.equal(Date.parse(String(afterHealth.data?.invalidated_at)), Date.parse(invalidatedAt), "同步不能清除模型失效标记");
    assert.equal(Date.parse(String(afterHealth.data?.unhealthy_until)), Date.parse(unhealthyUntil), "同步不能清除模型冷却截止");
    assert.equal(afterHealth.data?.consecutive_failures, 2, "同步不能清零模型失败计数");
    assert.equal(afterHealth.data?.last_error_message, "keep model failure");
    assert.equal(afterHealth.data?.is_enabled, true, "同步不能改用户供应开关");
    assert.equal(afterHealth.data?.display_name, beforeHealth.data?.display_name);
    assert.equal(afterHealth.data?.sort_order, beforeHealth.data?.sort_order, "同步不能改顺位");
    const afterKey = await db.from("ai_provider_keys").select("invalidated_at, unhealthy_until, consecutive_failures, last_error_message").eq("id", second).single();
    assert.equal(afterKey.error, null);
    assert.equal(Date.parse(String(afterKey.data?.invalidated_at)), Date.parse(invalidatedAt), "同步不能清除渠道失效标记");
    assert.equal(Date.parse(String(afterKey.data?.unhealthy_until)), Date.parse(unhealthyUntil), "同步不能清除渠道冷却截止");
    assert.equal(afterKey.data?.consecutive_failures, 3);
    assert.equal(afterKey.data?.last_error_message, "keep key failure");
  } finally {
    if(providerId) assert.equal((await db.from("ai_providers").delete().eq("id",providerId)).error,null);
    await new Promise<void>(resolve=>server.close(()=>resolve()));
  }
});
