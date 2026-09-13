import assert from "node:assert/strict";
import test from "node:test";

import { runFeishuCreationFlow } from "./feishu-creation-flow";

const topic = { id: "sub-1", title: "测试选题", hook: "三秒讲透" };

test("复制失败立即停止，不标记也不打开", async () => {
  const events: string[] = [];
  const result = await runFeishuCreationFlow({
    topic,
    workspaceUrl: "https://example.feishu.cn/wiki/abc",
    isWriting: false,
    copy: async () => { events.push("copy"); throw new Error("denied"); },
    markWriting: async () => { events.push("mark"); return true; },
    open: () => { events.push("open"); return true; },
  });
  assert.equal(result.status, "copy_failed");
  assert.deepEqual(events, ["copy"]);
});

test("标记失败返回已复制未登记，不打开飞书", async () => {
  const events: string[] = [];
  const result = await runFeishuCreationFlow({
    topic,
    workspaceUrl: "https://example.feishu.cn/wiki/abc",
    isWriting: false,
    copy: async () => { events.push("copy"); },
    markWriting: async () => { events.push("mark"); return false; },
    open: () => { events.push("open"); return true; },
  });
  assert.equal(result.status, "mark_failed");
  assert.deepEqual(events, ["copy", "mark"]);
});

test("未配置或不安全地址可保留复制结果，但不标记、不打开", async () => {
  for (const workspaceUrl of [null, "http://example.feishu.cn/wiki/abc"]) {
    const events: string[] = [];
    const result = await runFeishuCreationFlow({
      topic,
      workspaceUrl,
      isWriting: false,
      copy: async () => { events.push("copy"); },
      markWriting: async () => { events.push("mark"); return true; },
      open: () => { events.push("open"); return true; },
    });
    assert.equal(result.status, workspaceUrl === null ? "workspace_missing" : "workspace_invalid");
    assert.deepEqual(events, ["copy"]);
  }
});

test("popup 被拦截不能报告全链路成功", async () => {
  const result = await runFeishuCreationFlow({
    topic,
    workspaceUrl: "https://example.feishu.cn/wiki/abc",
    isWriting: false,
    copy: async () => {},
    markWriting: async () => true,
    open: () => false,
  });
  assert.equal(result.status, "popup_blocked");
});

test("完整成功严格按复制、标记、打开顺序执行", async () => {
  const events: string[] = [];
  const result = await runFeishuCreationFlow({
    topic,
    workspaceUrl: "https://example.feishu.cn/wiki/abc",
    isWriting: false,
    copy: async () => { events.push("copy"); },
    markWriting: async () => { events.push("mark"); return true; },
    open: () => { events.push("open"); return true; },
  });
  assert.equal(result.status, "success");
  assert.deepEqual(events, ["copy", "mark", "open"]);
});
