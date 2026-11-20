import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { parse } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { listRankedProviderKeyModels, selectHealthyProviderKeyModel } from "@/lib/ai/provider-routing";

const { Client } = createRequire(import.meta.url)("pg");

// 模型身份（canonical_model_id）与调用名（model_id）分离的真实库验收：
// 同款去前缀合并、迁移归并、约束与顺位、被重写的每个函数、业务绑定规整、路由命中。
// 除路由用例外，全部在一个事务里跑完回滚，不留数据。

type Row = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const env = parse(readFileSync(".env.ai-test.local"));

async function connect(): Promise<Db> {
  const url = new URL(env.SUPABASE_DB_URL);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname), "只允许本机测试库");
  assert.equal(url.port, "54322");
  const db = new Client({ connectionString: url.href });
  await db.connect();
  return db;
}

async function inTransaction(body: (db: Db) => Promise<void>) {
  const db = await connect();
  try {
    await db.query("begin");
    await body(db);
  } finally {
    await db.query("rollback").catch(() => undefined);
    await db.end();
  }
}

const uid = () => randomUUID().replace(/-/g, "").slice(0, 12);

async function createChannel(db: Db, address: string, label: string, models: Row[], available: string[] = []) {
  const { rows } = await db.query(
    "select public.create_ai_config_channel(null,$1,$1,$2,'local-only',$3,$4,true) as result",
    [address, label, available, JSON.stringify(models)],
  );
  return rows[0].result as { keyId: string; providerId: string; affectedCount: number };
}

async function supplies(db: Db, keyId: string) {
  return (await db.query(
    "select id,model_id,canonical_model_id,display_name,is_enabled,sort_order from public.ai_provider_key_models where key_id=$1 order by model_id",
    [keyId],
  )).rows as Array<{ id: string; model_id: string; canonical_model_id: string; display_name: string; is_enabled: boolean; sort_order: number }>;
}

async function expectRejected(db: Db, sql: string, args: unknown[], pattern?: RegExp) {
  await db.query("savepoint expected_failure");
  if (pattern) await assert.rejects(() => db.query(sql, args), { message: pattern });
  else await assert.rejects(() => db.query(sql, args));
  await db.query("rollback to savepoint expected_failure");
}

test("标准化函数：只去最后一个 / 之前的部分，变体后缀不合并，空值被拒绝", async () => {
  await inTransaction(async (db) => {
    const canon = async (value: string) => (await db.query("select public.canonical_ai_model_id($1) as v", [value])).rows[0].v;
    assert.equal(await canon("gemini-2.5-flash"), "gemini-2.5-flash");
    assert.equal(await canon("google/gemini-2.5-flash"), "gemini-2.5-flash");
    assert.equal(await canon("a/b/models/gemini-2.5-flash"), "gemini-2.5-flash");
    assert.equal(await canon("  vendor/gemini-2.5-flash  "), "gemini-2.5-flash");
    // 后缀不是前缀：这些都是不同的模型，不能被合并
    for (const variant of ["gemini-2.5-flash-preview", "gemini-2.5-flash-lite", "gemini-2.5-flash-thinking", "gemini-2.5-flash-20241115"]) {
      assert.equal(await canon(`vendor/${variant}`), variant);
      assert.notEqual(await canon(`vendor/${variant}`), "gemini-2.5-flash");
    }
    assert.notEqual(await canon("claude-haiku-5-5"), await canon("claude-haiku-5.5"));
    // 空串、纯空白、纯 / 、以 / 结尾：标准名为空，写入模型表时被触发器拒绝
    for (const empty of ["", "   ", "/", "vendor/"]) {
      assert.equal(await canon(empty), "");
    }
    const { rows } = await db.query("insert into public.ai_providers(name,base_url) values('canon-fixture',$1) returning id", [`https://${uid()}.fixture.test/v1`]);
    const key = (await db.query("insert into public.ai_provider_keys(provider_id,label,api_key) values($1,'k','local-only') returning id", [rows[0].id])).rows[0].id;
    for (const empty of ["", "   ", "/", "vendor/"]) {
      await expectRejected(db, "insert into public.ai_provider_key_models(key_id,model_id,display_name) values($1,$2,'x')", [key, empty], /模型 ID 不能为空/);
    }
  });
});

test("迁移归并：同渠道同款重复合并成一条，状态取最保守值，外键转移，审计留痕", async () => {
  const migration = readFileSync("supabase/migrations/20261117192720_ai_canonical_model_identity.sql", "utf8");
  const mergeBlock = /^do \$\$[\s\S]*?^end \$\$;$/m.exec(migration)?.[0];
  assert.ok(mergeBlock, "迁移里找不到归并块");

  await inTransaction(async (db) => {
    const model = `merge-${uid()}`;
    const provider = (await db.query("insert into public.ai_providers(name,base_url) values('merge-fixture',$1) returning id", [`https://${uid()}.fixture.test/v1`])).rows[0].id;
    const key = (await db.query("insert into public.ai_provider_keys(provider_id,label,api_key) values($1,'k','local-only') returning id", [provider])).rows[0].id;
    // 还原"迁移前"状态：同渠道允许出现同款重复
    await db.query("alter table public.ai_provider_key_models drop constraint ai_provider_key_models_key_canonical_unique");
    const prefixed = (await db.query(
      `insert into public.ai_provider_key_models(key_id,model_id,display_name,is_enabled,disabled_by_model,consecutive_failures,first_failure_at,last_failure_at,last_error_message,last_failure_scope,last_failure_kind,invalidated_at)
       values($1,$2,'人工名',true,true,3,'2026-01-02T00:00:00Z','2026-01-05T00:00:00Z','errA','model','service','2026-01-04T00:00:00Z') returning id`,
      [key, `vendor/${model}`],
    )).rows[0].id;
    const plain = (await db.query(
      `insert into public.ai_provider_key_models(key_id,model_id,display_name,is_enabled,consecutive_failures,first_failure_at,last_failure_at,last_success_at,last_error_message)
       values($1,$2,$2,false,5,'2026-01-03T00:00:00Z','2026-01-04T00:00:00Z','2026-01-06T00:00:00Z','errB') returning id`,
      [key, model],
    )).rows[0].id;
    // 指向两条记录的外键：业务绑定、改写路由、改写运行记录
    // 旧列 ai_feature_bindings.provider_key_model_id 已由 20261119155000 删除；本用例回放归并迁移，事务内临时补回（回滚即消失）
    await db.query("alter table public.ai_feature_bindings add column if not exists provider_key_model_id uuid references public.ai_provider_key_models(id) on delete set null");
    const bindingA = (await db.query("insert into public.ai_feature_bindings(feature_key,label,provider_key_model_id) values($1,'merge',$2) returning id", [`merge-a-${uid()}`, prefixed])).rows[0].id;
    const bindingB = (await db.query("insert into public.ai_feature_bindings(feature_key,label,provider_key_model_id) values($1,'merge',$2) returning id", [`merge-b-${uid()}`, plain])).rows[0].id;
    // 夹具里的视图/渠道/会话/用户用随机号，不为它们建整条链：事务内去掉这几条无关外键（回滚后原样恢复），保留指向模型供应的外键
    await db.query(`alter table public.rewrite_model_routes drop constraint rewrite_model_routes_model_view_id_fkey, drop constraint rewrite_model_routes_channel_id_fkey;
      alter table public.rewrite_generation_runs drop constraint rewrite_generation_runs_conversation_id_fkey, drop constraint rewrite_generation_runs_model_view_id_fkey, drop constraint rewrite_generation_runs_user_id_fkey`);
    const route = (await db.query("insert into public.rewrite_model_routes(model_view_id,channel_id,actual_model,provider_key_model_id) values($1,$2,$3,$4) returning id", [randomUUID(), randomUUID(), model, prefixed])).rows[0].id;
    const run = (await db.query("insert into public.rewrite_generation_runs(conversation_id,user_id,run_type,provider_key_model_id) values($1,$2,'chat_reply',$3) returning id", [randomUUID(), randomUUID(), prefixed])).rows[0].id;

    await db.query(mergeBlock);

    const left = (await db.query("select * from public.ai_provider_key_models where key_id=$1", [key])).rows;
    assert.equal(left.length, 1, "合并后同渠道同款只剩一条");
    const [survivor] = left;
    assert.equal(survivor.id, plain, "优先保留不带前缀的调用名");
    assert.equal(survivor.model_id, model);
    assert.equal(survivor.canonical_model_id, model);
    assert.equal(survivor.consecutive_failures, 5, "失败计数取最大");
    assert.equal(new Date(survivor.first_failure_at).toISOString(), "2026-01-02T00:00:00.000Z", "首次失败取最早（不被成功时间触发器抹掉）");
    assert.equal(new Date(survivor.last_failure_at).toISOString(), "2026-01-05T00:00:00.000Z");
    assert.equal(new Date(survivor.last_success_at).toISOString(), "2026-01-06T00:00:00.000Z");
    assert.equal(new Date(survivor.invalidated_at).toISOString(), "2026-01-04T00:00:00.000Z", "失效标记取保守值，不被触发器抹掉");
    assert.equal(survivor.disabled_by_model, true, "任一为真则保持");
    assert.equal(survivor.is_enabled, false, "被模型级关闭的合并后保持关闭");
    assert.equal(survivor.display_name, "人工名", "人工名优先于自动名");
    assert.equal(survivor.last_error_message, "errA", "错误信息取最近一次失败");
    assert.equal(survivor.last_failure_kind, "service");

    const refs = async (table: string, id: string) => (await db.query(`select provider_key_model_id from public.${table} where id=$1`, [id])).rows[0].provider_key_model_id;
    assert.equal(await refs("ai_feature_bindings", bindingA), plain);
    assert.equal(await refs("ai_feature_bindings", bindingB), plain);
    assert.equal(await refs("rewrite_model_routes", route), plain, "改写路由的引用转移到保留行，不是被置空");
    assert.equal(await refs("rewrite_generation_runs", run), plain, "改写运行记录的引用转移到保留行，不是被置空");

    const audit = (await db.query("select * from public.ai_provider_key_model_merge_audit where key_id=$1", [key])).rows;
    assert.equal(audit.length, 1);
    assert.equal(audit[0].survivor_id, plain);
    assert.deepEqual(audit[0].discarded_ids, [prefixed]);
    assert.equal(audit[0].survivor_model_id, model);
    assert.deepEqual(audit[0].discarded_model_ids, [`vendor/${model}`]);
    assert.equal(audit[0].original_rows.length, 2, "审计表保留两条原始快照");
    assert.deepEqual(audit[0].transferred_references, {
      ai_feature_bindings: [bindingA],
      rewrite_model_routes: [route],
      rewrite_generation_runs: [run],
    });
  });
});

test("约束与顺位：同渠道同款唯一；同款顺位连续，互换只影响同款", async () => {
  await inTransaction(async (db) => {
    const model = `order-${uid()}`;
    const other = `order-other-${uid()}`;
    const a = await createChannel(db, `https://${uid()}.fixture.test/v1`, "a", [{ model_id: `vendor/${model}`, display_name: "x", is_enabled: true }, { model_id: other, display_name: "y", is_enabled: true }]);
    const b = await createChannel(db, `https://${uid()}.fixture.test/v1`, "b", [{ model_id: model, display_name: "x", is_enabled: true }]);
    const c = await createChannel(db, `https://${uid()}.fixture.test/v1`, "c", [{ model_id: `other/${model}`, display_name: "x", is_enabled: true }]);

    // 同渠道再插入同款带前缀写法：被 (key_id, canonical_model_id) 唯一约束拒绝
    await expectRejected(db, "insert into public.ai_provider_key_models(key_id,model_id,display_name) values($1,$2,'dup')", [a.keyId, `google/${model}`], /ai_provider_key_models_key_canonical_unique/);

    const sameModel = async () => (await db.query("select id,key_id,sort_order from public.ai_provider_key_models where canonical_model_id=$1 order by sort_order", [model])).rows;
    const before = await sameModel();
    assert.deepEqual(before.map((row: Row) => row.sort_order), [1, 2, 3], "同款跨渠道顺位 1..n 连续");
    const [first, second, third] = before;
    const otherBefore = (await db.query("select id,sort_order from public.ai_provider_key_models where canonical_model_id=$1", [other])).rows;
    assert.deepEqual(otherBefore.map((row: Row) => row.sort_order), [1], "不同款各自从 1 开始");

    await db.query("select public.swap_provider_key_model_order($1,$2,$3)", [`any/${model}`, first.id, second.id]);
    const after = await sameModel();
    assert.deepEqual(after.map((row: Row) => row.id), [second.id, first.id, third.id], "互换后顺位对调，第三条不动");
    assert.deepEqual(after.map((row: Row) => row.sort_order), [1, 2, 3]);
    assert.deepEqual((await db.query("select id,sort_order from public.ai_provider_key_models where canonical_model_id=$1", [other])).rows, otherBefore, "互换不影响其他模型");

    // 跨模型互换被拒绝
    const otherSupply = (await supplies(db, a.keyId)).find((row) => row.canonical_model_id === other)!;
    await expectRejected(db, "select public.swap_provider_key_model_order($1,$2,$3)", [model, first.id, otherSupply.id], /渠道不存在或不属于同一模型/);
    void b; void c;
  });
});

test("被重写的函数逐个调用：接入、勾选、改名、开通、同步、记录失败", async () => {
  await inTransaction(async (db) => {
    // create_ai_config_channel：上游同时给出带前缀和不带前缀两种写法，只落一条，优先不带前缀
    const m1 = `create-${uid()}`;
    const forward = await createChannel(db, `https://${uid()}.fixture.test/v1`, "forward", [
      { model_id: `vendor/${m1}`, display_name: "前缀名", is_enabled: true },
      { model_id: m1, display_name: m1, is_enabled: false },
    ]);
    const reverse = await createChannel(db, `https://${uid()}.fixture.test/v1`, "reverse", [
      { model_id: m1, display_name: m1, is_enabled: false },
      { model_id: `vendor/${m1}`, display_name: "前缀名", is_enabled: true },
    ]);
    for (const channel of [forward, reverse]) {
      const rows = await supplies(db, channel.keyId);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].model_id, m1, "优先保留不带前缀的调用名");
      assert.equal(rows[0].canonical_model_id, m1);
      assert.equal(rows[0].is_enabled, true, "任一写法开通则开通");
      assert.equal(channel.affectedCount, 1);
    }

    // set_ai_channel_model_selection：勾选（调用名取上游清单里的写法）、取消、重新勾选
    const m2 = `select-${uid()}`;
    const m3 = `select-${uid()}`;
    const channel = await createChannel(db, `https://${uid()}.fixture.test/v1`, "select", [{ model_id: m2, display_name: "二号", is_enabled: true }], [m2, `vendor/${m3}`]);
    const chosen = (await db.query("select public.set_ai_channel_model_selection($1,$2,'{}') as r", [channel.keyId, [m3]])).rows[0].r;
    assert.equal(chosen.created, 1);
    let rows = await supplies(db, channel.keyId);
    const added = rows.find((row) => row.canonical_model_id === m3)!;
    assert.equal(added.model_id, `vendor/${m3}`, "新增时调用名取上游清单里真实存在的写法");
    assert.equal(added.is_enabled, true);
    assert.equal(rows.find((row) => row.canonical_model_id === m2)!.is_enabled, false, "未勾选的被关闭");
    await db.query("select public.set_ai_channel_model_selection($1,$2,'{}')", [channel.keyId, []]);
    assert.ok((await supplies(db, channel.keyId)).every((row) => !row.is_enabled), "全部取消勾选");
    await db.query("select public.set_ai_channel_model_selection($1,$2,'{}')", [channel.keyId, [`other/${m2}`]]);
    rows = await supplies(db, channel.keyId);
    assert.equal(rows.length, 2, "重新勾选不新建重复记录");
    assert.deepEqual(rows.filter((row) => row.is_enabled).map((row) => row.model_id), [m2], "换前缀写法勾选，命中同一条且调用名不变");

    // update_ai_config_model：改名影响同款全部供应；启停只影响目标
    const m4 = `update-${uid()}`;
    const left = await createChannel(db, `https://${uid()}.fixture.test/v1`, "left", [{ model_id: `vendor/${m4}`, display_name: "旧名", is_enabled: true }]);
    const right = await createChannel(db, `https://${uid()}.fixture.test/v1`, "right", [{ model_id: m4, display_name: "旧名", is_enabled: true }]);
    const leftSupply = (await supplies(db, left.keyId))[0];
    const renamed = (await db.query("select public.update_ai_config_model($1,$2) as r", [leftSupply.id, JSON.stringify({ display_name: "统一新名" })])).rows[0].r;
    assert.equal(renamed.affectedCount, 2);
    assert.deepEqual([...(await supplies(db, left.keyId)), ...(await supplies(db, right.keyId))].map((row) => row.display_name), ["统一新名", "统一新名"]);
    await db.query("select public.update_ai_config_model($1,$2)", [leftSupply.id, JSON.stringify({ is_enabled: false })]);
    assert.equal((await supplies(db, left.keyId))[0].is_enabled, false);
    assert.equal((await supplies(db, right.keyId))[0].is_enabled, true, "启停只影响目标供应");

    // enable_ai_config_supply：按标准名找到已有记录并开通，不新建
    const supplyId = (await db.query("select public.enable_ai_config_supply($1,$2,'忽略') as id", [left.keyId, `google/${m4}`])).rows[0].id;
    assert.equal(supplyId, leftSupply.id);
    assert.equal((await supplies(db, left.keyId)).length, 1);
    assert.equal((await supplies(db, left.keyId))[0].is_enabled, true);
    // 渠道里没有该模型时，调用名取上游清单写法
    const m5 = `enable-${uid()}`;
    const fresh = await createChannel(db, `https://${uid()}.fixture.test/v1`, "fresh", [], [`vendor/${m5}`]);
    await db.query("select public.enable_ai_config_supply($1,$2,'新')", [fresh.keyId, m5]);
    assert.deepEqual((await supplies(db, fresh.keyId)).map((row) => [row.model_id, row.is_enabled]), [[`vendor/${m5}`, true]]);

    // sync_ai_config_models：核实清单上游改名后调用名跟着改；未核实清单只做"去前缀"的保守升级；清单外的被撤下
    const m6 = `sync-${uid()}`;
    const m7 = `sync-gone-${uid()}`;
    const synced = await createChannel(db, `https://${uid()}.fixture.test/v1`, "sync", [
      { model_id: m6, display_name: "六", is_enabled: true },
      { model_id: m7, display_name: "七", is_enabled: false },
    ]);
    const sync = (verified: boolean, list: string[]) => db.query("select public.sync_ai_config_models($1,$2,$3,$4)", [
      synced.keyId, list, JSON.stringify(list.map((model_id) => ({ model_id, display_name: model_id }))), verified,
    ]);
    await sync(false, [`vendor/${m6}`]);
    assert.deepEqual((await supplies(db, synced.keyId)).map((row) => row.model_id).sort(), [m6, m7].sort(), "未核实清单不会把不带前缀改成带前缀");
    await sync(true, [`google/${m6}`]);
    rows = await supplies(db, synced.keyId);
    assert.deepEqual(rows.map((row) => row.model_id), [`google/${m6}`], "核实清单：调用名以上游现状为准，清单外的 m7 被撤下");
    assert.equal(rows[0].is_enabled, true, "改名不改开关");
    await sync(false, [m6]);
    assert.deepEqual((await supplies(db, synced.keyId)).map((row) => row.model_id), [m6], "未核实清单：带前缀可升级为不带前缀");

    // record_ai_supply_failure：模型级失败只记在该供应；渠道级失败记在渠道；达到阈值暂停渠道
    const failing = await createChannel(db, `https://${uid()}.fixture.test/v1`, "failing", [{ model_id: `vendor/${m6}`, display_name: "x", is_enabled: true }]);
    const failingSupply = (await supplies(db, failing.keyId))[0];
    await db.query("select public.record_ai_supply_failure($1,'model','service',false,'boom',60,5,300)", [failingSupply.id]);
    const failedRow = (await db.query("select consecutive_failures,last_failure_kind,last_error_message from public.ai_provider_key_models where id=$1", [failingSupply.id])).rows[0];
    assert.equal(failedRow.consecutive_failures, 1);
    assert.equal(failedRow.last_failure_kind, "service");
    assert.equal((await db.query("select unhealthy_until from public.ai_provider_keys where id=$1", [failing.keyId])).rows[0].unhealthy_until, null, "未达阈值不暂停渠道");
    await db.query("select public.record_ai_supply_failure($1,'model','timeout',false,'slow',60,1,300)", [failingSupply.id]);
    assert.ok((await db.query("select unhealthy_until from public.ai_provider_keys where id=$1", [failing.keyId])).rows[0].unhealthy_until, "达到阈值后暂停渠道");
    await db.query("select public.record_ai_supply_failure($1,'key','service',false,'key down',60,5,300)", [failingSupply.id]);
    assert.ok((await db.query("select consecutive_failures from public.ai_provider_keys where id=$1", [failing.keyId])).rows[0].consecutive_failures >= 1);
  });
});

test("业务绑定：写入带前缀的模型会被触发器规整成标准名", async () => {
  await inTransaction(async (db) => {
    const model = `bind-${uid()}`;
    const insert = async (modelId: string | null) => (await db.query(
      "insert into public.ai_feature_bindings(feature_key,label,model_id) values($1,'bind',$2) returning id,model_id",
      [`bind-${uid()}`, modelId],
    )).rows[0];
    assert.equal((await insert(`vendor/${model}`)).model_id, model);
    assert.equal((await insert(`a/b/${model}`)).model_id, model);
    assert.equal((await insert(model)).model_id, model);
    assert.equal((await insert(null)).model_id, null);
    const row = await insert(model);
    const updated = (await db.query("update public.ai_feature_bindings set model_id=$2 where id=$1 returning model_id", [row.id, `google/${model}`])).rows[0];
    assert.equal(updated.model_id, model);
  });
});

test("路由：选定标准名后命中带前缀渠道，返回的调用名仍是该渠道原始写法", async () => {
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  assert.match(url, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/, "路由用例只允许连本机接口");
  assert.ok(serviceKey, "缺少本地 SUPABASE_SERVICE_ROLE_KEY");
  const service = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const db = await connect();
  const model = `route-${uid()}`;
  const providerIds: string[] = [];
  try {
    // 路由读的是 REST，看不到未提交事务，这里提交真实数据，最后按渠道级联删除
    const prefixed = await createChannel(db, `https://${uid()}.fixture.test/v1`, "prefixed", [{ model_id: `vendor/${model}`, display_name: "x", is_enabled: true }]);
    const plain = await createChannel(db, `https://${uid()}.fixture.test/v1`, "plain", [{ model_id: model, display_name: "x", is_enabled: true }]);
    providerIds.push(prefixed.providerId, plain.providerId);

    const hit = await selectHealthyProviderKeyModel(service as never, model);
    assert.ok(hit, "按标准名能命中");
    assert.equal(hit.config.modelId, `vendor/${model}`, "返回的调用名仍是该渠道原始写法");
    assert.equal(hit.config.canonicalModelId, model);
    assert.equal(hit.config.providerKeyId, prefixed.keyId);

    // 用另一种前缀写法当偏好，也命中同一批渠道，并按顺位排列，互为回退
    const ranked = await listRankedProviderKeyModels(service as never, `other/${model}`);
    assert.deepEqual(ranked.map((item) => item.config.modelId), [`vendor/${model}`, model]);
    assert.ok(ranked.every((item) => item.config.canonicalModelId === model));

    // 第一条被停用后，回退到不带前缀的那条，调用名随之变成它自己的写法
    await db.query("update public.ai_provider_key_models set is_enabled=false where key_id=$1", [prefixed.keyId]);
    const fallback = await selectHealthyProviderKeyModel(service as never, model);
    assert.equal(fallback?.config.modelId, model);
    assert.equal(fallback?.config.providerKeyId, plain.keyId);
  } finally {
    if (providerIds.length > 0) await db.query("delete from public.ai_providers where id=any($1::uuid[])", [providerIds]);
    await db.end();
  }
});
