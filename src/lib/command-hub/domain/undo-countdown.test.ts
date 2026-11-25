import assert from "node:assert/strict";
import test from "node:test";
import { createUndoQueueController, type UndoCountdownSnapshot } from "./undo-countdown";

test("真实定时器下悬停暂停可冻结倒计时且不提前提交，移开后继续并到期触发", (t) => {
  t.mock.timers.enable({ apis: ["Date", "setInterval"] });

  let latestSnapshots: UndoCountdownSnapshot[] = [];
  const expiredIds: string[] = [];

  const controller = createUndoQueueController<{ id: string }>({
    durationMs: 5000,
    tickMs: 200,
    onChange: (items) => {
      latestSnapshots = items;
    },
    onExpire: (entry) => {
      expiredIds.push(entry.id);
    },
  });

  controller.schedule({ id: "u1" });
  assert.deepEqual(latestSnapshots, [{ id: "u1", remainingSeconds: 5 }]);

  // 经过 3 秒（剩余 2 秒）
  t.mock.timers.tick(3000);
  assert.deepEqual(latestSnapshots, [{ id: "u1", remainingSeconds: 2 }]);
  assert.deepEqual(expiredIds, []);

  // 鼠标悬停暂停 10 秒：倒计时与自动提交都必须停住
  controller.pause();
  assert.equal(controller.isPaused(), true);
  t.mock.timers.tick(10_000);
  assert.deepEqual(latestSnapshots, [{ id: "u1", remainingSeconds: 2 }]);
  assert.deepEqual(expiredIds, []);

  // 鼠标移开恢复：再过 1.8 秒仍未过期，补满剩余 2 秒后触发提交
  controller.resume();
  assert.equal(controller.isPaused(), false);
  t.mock.timers.tick(1800);
  assert.deepEqual(latestSnapshots, [{ id: "u1", remainingSeconds: 1 }]);
  assert.deepEqual(expiredIds, []);

  t.mock.timers.tick(400);
  assert.deepEqual(latestSnapshots, []);
  assert.deepEqual(expiredIds, ["u1"]);
  controller.destroy();
});

test("撤回条目后立刻停止后续到期提交", (t) => {
  t.mock.timers.enable({ apis: ["Date", "setInterval"] });

  const expiredIds: string[] = [];
  let latestSnapshots: UndoCountdownSnapshot[] = [];

  const controller = createUndoQueueController<{ id: string }>({
    durationMs: 5000,
    tickMs: 200,
    onChange: (items) => {
      latestSnapshots = items;
    },
    onExpire: (entry) => {
      expiredIds.push(entry.id);
    },
  });

  controller.schedule({ id: "u1" });
  t.mock.timers.tick(2000);
  const taken = controller.take("u1");
  assert.equal(taken?.id, "u1");
  assert.deepEqual(latestSnapshots, []);

  t.mock.timers.tick(10_000);
  assert.deepEqual(expiredIds, []);
  controller.destroy();
});
