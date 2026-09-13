import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTopicPoolQuery,
  createTopicPoolRequestCoordinator,
} from "./topic-navigation";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test("pool 查询序列化由普通翻页与 J/K 跨页共享", () => {
  const query = buildTopicPoolQuery({
    view: "my_created",
    sort: "best_play",
    search: "  突破  ",
    timeRange: "1w",
    topicIds: ["topic-2", "topic-1"],
    sourceType: "internal",
    recentHeat: "has_participants",
    durationRange: "2_5m",
    performance: "high_qualified",
    pageSize: 50,
  }, 3);

  assert.equal(query.get("page"), "3");
  assert.equal(query.get("q"), "突破");
  assert.deepEqual(query.getAll("topic_id"), ["topic-2", "topic-1"]);
  assert.equal(query.get("performance"), "high_qualified");
});

test("快速跨页时旧响应不能覆盖最后一次目标", async () => {
  const first = deferred<{ page: number }>();
  const second = deferred<{ page: number }>();
  const calls: number[] = [];
  const coordinator = createTopicPoolRequestCoordinator(async (page) => {
    calls.push(page);
    return page === 1 ? first.promise : second.promise;
  });

  const oldRequest = coordinator.load(1);
  const latestRequest = coordinator.load(2);
  second.resolve({ page: 2 });
  assert.deepEqual(await latestRequest, { accepted: true, value: { page: 2 } });
  first.resolve({ page: 1 });
  assert.deepEqual(await oldRequest, { accepted: false });
  assert.deepEqual(calls, [1, 2]);
});

test("筛选切换会使旧 pool 响应作废", async () => {
  const pending = deferred<string>();
  const coordinator = createTopicPoolRequestCoordinator(async () => pending.promise);
  const oldRequest = coordinator.load(1);
  coordinator.invalidate();
  pending.resolve("旧筛选");
  assert.deepEqual(await oldRequest, { accepted: false });
});
