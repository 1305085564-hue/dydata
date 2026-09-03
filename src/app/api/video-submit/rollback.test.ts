import assert from "node:assert/strict";
import { mock } from "node:test";
import test from "node:test";

import {
  rollbackNewVideoSubmission,
  rollbackSafely,
  type VideoSubmissionRollbackRpc,
} from "./route";

const VIDEO_ID = "ad98d38a-0492-5ee7-95cc-f0aa76da4bd3";
const USER_ID = "6abce492-dc2e-4376-b8de-0451c95de543";
const NON_BLOCKING_LOG = "[video-submit] rollback_new_video_submission failed but non-blocking";

async function collectConsoleErrors(operation: () => Promise<void>): Promise<unknown[][]> {
  const calls: unknown[][] = [];
  const consoleError = mock.method(console, "error", (...args: unknown[]) => {
    calls.push(args);
  });
  try {
    await operation();
  } finally {
    consoleError.mock.restore();
  }
  return calls;
}

function rpcReturning(result: { data: unknown; error: { message?: string } | null }): VideoSubmissionRollbackRpc {
  return async () => result;
}

test("视频提交失败时，回滚失败不会替换最初的数据库错误", async () => {
  const rollbackError = await rollbackSafely([
    async () => {
      throw new Error("视频回滚未完成");
    },
  ]);

  assert.equal(rollbackError?.message, "提交失败后的回滚未完成：视频回滚未完成");
});

test("回滚成功（deleted / trashed）不写错误日志", async () => {
  for (const data of ["deleted", "trashed"]) {
    const calls = await collectConsoleErrors(() =>
      rollbackNewVideoSubmission(VIDEO_ID, USER_ID, rpcReturning({ data, error: null })),
    );
    assert.equal(calls.length, 0, `${data} 不应写 error 日志`);
  }
});

test("回滚结果异常时不抛错，只记 non-blocking 日志（M2 核心契约）", async () => {
  const calls = await collectConsoleErrors(() =>
    rollbackNewVideoSubmission(VIDEO_ID, USER_ID, rpcReturning({ data: "missing_or_unsafe", error: null })),
  );

  assert.equal(calls.length, 1);
  const [message, detail] = calls[0] as [string, Record<string, unknown>];
  assert.equal(message, NON_BLOCKING_LOG);
  assert.equal(detail.videoId, VIDEO_ID);
  assert.equal(detail.userId, USER_ID);
  assert.equal(detail.data, "missing_or_unsafe");
});

test("回滚 RPC 报错时不抛错，日志带上原始错误信息", async () => {
  const calls = await collectConsoleErrors(() =>
    rollbackNewVideoSubmission(VIDEO_ID, USER_ID, rpcReturning({ data: null, error: { message: "rpc failed" } })),
  );

  assert.equal(calls.length, 1);
  const [message, detail] = calls[0] as [string, Record<string, unknown>];
  assert.equal(message, NON_BLOCKING_LOG);
  assert.equal(detail.error, "rpc failed");
});

test("回滚 RPC 直接抛异常时向上冒泡，由 rollbackSafely 兜底记录", async () => {
  const rpc: VideoSubmissionRollbackRpc = async () => {
    throw new Error("network down");
  };

  const calls = await collectConsoleErrors(async () => {
    const rollbackError = await rollbackSafely([
      async () => {
        await rollbackNewVideoSubmission(VIDEO_ID, USER_ID, rpc);
      },
    ]);
    assert.equal(rollbackError?.message, "提交失败后的回滚未完成：network down");
  });

  assert.equal(calls.length, 0, "RPC 抛异常不走 non-blocking 分支，由 rollbackSafely 统一记录");
});

test("回滚失败不阻塞后续清理动作（幂等键不被卡住）", async () => {
  const cleaned: string[] = [];

  const calls = await collectConsoleErrors(async () => {
    await rollbackNewVideoSubmission(VIDEO_ID, USER_ID, rpcReturning({ data: null, error: null }));
    cleaned.push("idempotency-key");
  });

  assert.deepEqual(cleaned, ["idempotency-key"], "回滚失败后清理动作必须继续执行");
  assert.equal(calls.length, 1);
});
