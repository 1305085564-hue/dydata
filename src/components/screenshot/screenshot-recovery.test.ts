import assert from "node:assert/strict";
import test from "node:test";
import { createScreenshotRecovery, SCREENSHOT_RECOVERY_DELAYS_MS } from "./screenshot-recovery";

function fixture() {
  let online = true;
  let requests = 0;
  let nextId = 0;
  const timers = new Map<number, { run: () => void; delay: number }>();
  const recovery = createScreenshotRecovery({
    retry: () => { requests++; },
    isOnline: () => online,
    schedule: (run, delay) => { const id = ++nextId; timers.set(id, { run, delay }); return id; },
    cancel: (id) => { timers.delete(id); },
  });
  return {
    recovery, timers,
    setOnline: (value: boolean) => { online = value; },
    requests: () => requests,
    fire: () => {
      const entry = timers.entries().next().value;
      assert.ok(entry, "预期有一次恢复机会");
      timers.delete(entry[0]);
      entry[1].run();
    },
  };
}

test("连续两次加载失败后，暂时故障会得到延后恢复机会", () => {
  const f = fixture();
  f.recovery.failed();
  assert.equal(f.requests(), 0);
  assert.equal([...f.timers.values()][0].delay, SCREENSHOT_RECOVERY_DELAYS_MS[0]);
  f.fire();
  assert.equal(f.requests(), 1);
});

test("离线时不浪费恢复次数，联网后不需要用户手动点击", () => {
  const f = fixture();
  f.setOnline(false);
  f.recovery.failed();
  assert.equal(f.timers.size, 0);
  f.setOnline(true);
  f.recovery.online();
  f.recovery.online();
  assert.equal(f.requests(), 1, "重复online事件不能并发重试");
});

test("定时期间又断网不会耗尽恢复次数，随后联网可恢复", () => {
  const f = fixture();
  f.recovery.failed();
  f.setOnline(false);
  f.fire();
  assert.equal(f.requests(), 0);
  f.setOnline(true);
  f.recovery.online();
  assert.equal(f.requests(), 1);
});

test("持续失败最多两轮恢复，计时与联网事件都不会无限请求", () => {
  const f = fixture();
  for (let i = 0; i < SCREENSHOT_RECOVERY_DELAYS_MS.length; i++) {
    f.recovery.failed();
    f.fire();
  }
  f.recovery.failed();
  for (let i = 0; i < 10; i++) f.recovery.online();
  assert.equal(f.requests(), SCREENSHOT_RECOVERY_DELAYS_MS.length);
  assert.equal(f.timers.size, 0);
});

test("恢复成功取消待发请求，之后新的失败可独立恢复", () => {
  const f = fixture();
  f.recovery.failed();
  f.recovery.loaded();
  assert.equal(f.timers.size, 0);
  f.recovery.online();
  assert.equal(f.requests(), 0);
  f.recovery.failed();
  f.fire();
  assert.equal(f.requests(), 1);
});

test("重复失败事件只安排一个计时，卸载或切图清理后不再发请求", () => {
  const f = fixture();
  f.recovery.failed();
  f.recovery.failed();
  assert.equal(f.timers.size, 1);
  f.recovery.dispose();
  assert.equal(f.timers.size, 0);
  f.recovery.failed();
  f.recovery.online();
  assert.equal(f.requests(), 0);
});

test("先耗尽延后恢复，随后真实断网再联网，仍能重新恢复而非永久卡住", () => {
  const f = fixture();
  for (let i = 0; i < SCREENSHOT_RECOVERY_DELAYS_MS.length; i++) {
    f.recovery.failed();
    f.fire();
  }
  f.recovery.failed();
  f.setOnline(false);
  f.recovery.offline();
  f.setOnline(true);
  f.recovery.online();
  f.recovery.online();
  assert.equal(f.requests(), SCREENSHOT_RECOVERY_DELAYS_MS.length + 1);
});
