import assert from "node:assert/strict";
import test from "node:test";

import { AI_CONFIG_MOUNT_DEDUPE_WINDOW_MS, createAiConfigStore, startDetectionRefresh, type AiConfigBundle } from "./use-ai-config";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = async (predicate: () => boolean, timeoutMs: number, stepMs = 5) => {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) {
    await sleep(stepMs);
  }
};

const makeBundle = (): AiConfigBundle => ({
  providers: [],
  keys: [],
  models: [],
  featureBindings: [],
  featureControls: [],
});

test("R4 有界刷新：短周期读取、读取不重叠、stop 后停止", async () => {
  let calls = 0;
  let active = 0;
  let maxActive = 0;
  const refresh = startDetectionRefresh({
    loadData: async () => {
      calls += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      await sleep(10);
      active -= 1;
      return true;
    },
    onWindowEnd: () => {},
    intervalMs: 5,
    windowMs: 400,
  });

  await waitFor(() => calls >= 2, 250);
  assert.ok(calls >= 2, `应至少读取两次，实际 ${calls}`);
  assert.equal(maxActive, 1, "读取不能重叠");
  refresh.stop();
  const stoppedAt = calls;
  await sleep(25);
  assert.equal(calls, stoppedAt, "stop 后不能再读取");
});

test("R4 到窗口上限停止自动读取并回调一次", async () => {
  let calls = 0;
  let windowEnd = 0;
  const refresh = startDetectionRefresh({
    loadData: async () => {
      calls += 1;
      return true;
    },
    onWindowEnd: () => { windowEnd += 1; },
    intervalMs: 5,
    windowMs: 20,
  });

  await waitFor(() => windowEnd >= 1, 200);
  assert.equal(windowEnd, 1, "窗口到期只回调一次");
  const stoppedAt = calls;
  await sleep(20);
  assert.equal(calls, stoppedAt, "窗口到期后停止读取");
  refresh.stop();
});

test("R4 读取失败只提示一次，并在窗口内继续读取", async () => {
  let calls = 0;
  let errors = 0;
  let windowEnd = 0;
  const refresh = startDetectionRefresh({
    loadData: async () => {
      calls += 1;
      return false;
    },
    onWindowEnd: () => { windowEnd += 1; },
    onReadError: () => { errors += 1; },
    intervalMs: 5,
    windowMs: 30,
  });

  await waitFor(() => windowEnd >= 1, 200);
  assert.ok(calls >= 2);
  assert.equal(errors, 1, "同一次检测的读取失败只提示一次");
  assert.equal(windowEnd, 1);
  refresh.stop();
});

test("并发挂载只发起一次 GET（共享进行中的请求）", async () => {
  let calls = 0;
  let release!: (bundle: AiConfigBundle) => void;
  const gate = new Promise<AiConfigBundle>((resolve) => { release = resolve; });
  const store = createAiConfigStore(() => {
    calls += 1;
    return gate;
  });

  // 模拟外壳、各面板、弹窗在同一时刻挂载
  const mounts = [store.loadForMount(), store.loadForMount(), store.loadForMount()];
  assert.equal(calls, 1, "并发挂载只发一次请求");

  const bundle = makeBundle();
  release(bundle);
  const results = await Promise.all(mounts);
  assert.deepEqual(results, [bundle, bundle, bundle], "所有挂载拿到同一份数据");
  assert.equal(calls, 1, "请求数保持为 1");
});

test("短挂载去重窗口内复用缓存，窗口过期后重新请求", async () => {
  let calls = 0;
  const store = createAiConfigStore(async () => {
    calls += 1;
    return makeBundle();
  }, 40);

  const first = await store.loadForMount();
  assert.ok(first);
  store.mutate(first); // 模拟 hook 把结果落到缓存
  assert.equal(calls, 1);

  const deduped = await store.loadForMount();
  assert.equal(deduped, null, "窗口内复用缓存，不再请求");
  assert.equal(calls, 1);

  await sleep(60);
  const refetched = await store.loadForMount();
  assert.ok(refetched, "窗口过期后重新读取");
  assert.equal(calls, 2);
});

test("显式刷新强制新请求，不受缓存与去重窗口影响", async () => {
  let calls = 0;
  const store = createAiConfigStore(async () => {
    calls += 1;
    return makeBundle();
  }, AI_CONFIG_MOUNT_DEDUPE_WINDOW_MS);

  const first = await store.loadForMount();
  assert.ok(first);
  store.mutate(first);
  assert.equal(calls, 1);

  // 缓存刚更新且去重窗口很长，刷新仍必须发起新请求
  await store.loadFresh();
  assert.equal(calls, 2, "第一次刷新强制新请求");
  await store.loadFresh();
  assert.equal(calls, 3, "每次刷新都强制新请求");
});

test("有挂载请求在途时，显式刷新仍单独发起新请求", async () => {
  let calls = 0;
  const resolvers: Array<(bundle: AiConfigBundle) => void> = [];
  const store = createAiConfigStore(() => {
    calls += 1;
    return new Promise<AiConfigBundle>((resolve) => resolvers.push(resolve));
  });

  const mount = store.loadForMount();
  assert.equal(calls, 1);
  const fresh = store.loadFresh();
  assert.equal(calls, 2, "刷新不受在途挂载请求影响");

  const mountBundle = makeBundle();
  const freshBundle = makeBundle();
  resolvers[0](mountBundle);
  resolvers[1](freshBundle);
  assert.equal(await mount, mountBundle);
  assert.equal(await fresh, freshBundle);
});
