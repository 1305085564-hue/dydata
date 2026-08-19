import assert from "node:assert/strict";
import test from "node:test";

import {
  canOperateVideoLifecycle,
  canOperateVideoWithinScope,
  extractSubmissionScreenshotPaths,
  isPurgeEligible,
  performVideoLifecycleAction,
} from "./video-lifecycle";

function lifecycleDeps(input: { role: "owner" | "admin"; lifecycleState: "active" | "trashed" | "purged"; trashedAt?: string | null; storageError?: boolean; includeScreenshot?: boolean; companyRole?: "company_owner"; groupMode?: boolean }) {
  const rpcCalls: Array<Record<string, unknown>> = [];
  const video = {
    id: "video-1",
    user_id: "team-user",
    lifecycle_state: input.lifecycleState,
    trashed_at: input.trashedAt ?? null,
    accounts: { profile_id: "team-user" },
  };
  const supabase = {
    from(table: string) {
      if (table === "videos") {
        const query = { eq: () => query, maybeSingle: async () => ({ data: video, error: null }) };
        return { select: () => query };
      }
      const query = { eq: () => ({ data: input.includeScreenshot ? [{ screenshot_urls: ["https://dydata.cc/api/submission-screenshots/file?path=team-user%2Fa.png"], curve_screenshot_url: null, retention_screenshot_url: null }] : [], error: null }) };
      return { select: () => query };
    },
    rpc: async (_name: string, args: Record<string, unknown>) => {
      rpcCalls.push(args);
      const state = args.p_action === "trash" ? "trashed" : args.p_action === "restore" ? "active" : "purged";
      return { data: [{ lifecycle_state: state, trashed_at: state === "trashed" ? "2026-07-20T00:00:00.000Z" : null, purged_at: state === "purged" ? "2026-07-20T00:00:00.000Z" : null }], error: null };
    },
    storage: { from: () => ({ remove: async () => ({ error: input.storageError ? { message: "storage down" } : null }) }) },
  };
  return {
    rpcCalls,
    deps: {
      requireAdminActor: async () => ({ supabase: {} as never, actor: { userId: "admin-1", role: input.role, companyRole: input.companyRole, groupMode: input.groupMode } }),
      createAdminClient: () => supabase as never,
      buildDataAccessScope: async () => ({ visibleUserIds: ["team-user"] }),
    } as never,
  };
}

test("回收站允许管理员和公司所有者操作，永久删除只允许公司所有者或集团模式", () => {
  assert.equal(canOperateVideoLifecycle({ role: "admin" }, "trash"), true);
  assert.equal(canOperateVideoLifecycle({ role: "admin", companyRole: "company_owner" }, "purge"), true);
  assert.equal(canOperateVideoLifecycle({ role: "admin" }, "purge"), false);
  assert.equal(canOperateVideoLifecycle({ role: "admin", groupMode: true }, "purge"), true);
  assert.equal(canOperateVideoLifecycle({ role: "member", groupMode: true }, "purge"), true);
  assert.equal(canOperateVideoLifecycle({ role: "admin" }, "restore"), true);
  assert.equal(canOperateVideoLifecycle({ role: "admin" }, "trash"), true);
  assert.equal(canOperateVideoLifecycle({ role: "member" }, "trash"), false);
});

test("当前操作只处理 active 成员，集团范围也不绕过归档", () => {
  const scope = { kind: "team" as const, visibleUserIds: ["team-user", "archived-user"], activeVisibleUserIds: ["team-user"] };
  assert.equal(canOperateVideoWithinScope({ role: "admin" }, scope, "team-user"), true);
  assert.equal(canOperateVideoWithinScope({ role: "admin" }, scope, "archived-user"), false);
  assert.equal(canOperateVideoWithinScope({ role: "admin", groupMode: true }, { ...scope, kind: "all", activeVisibleUserIds: ["team-user"] }, "other-user"), false);
});

test("永久删除必须在回收满30天后", () => {
  const now = new Date("2026-07-20T00:00:00.000Z");
  assert.equal(isPurgeEligible("2026-06-20T00:00:00.000Z", now), true);
  assert.equal(isPurgeEligible("2026-06-20T00:00:01.000Z", now), false);
  assert.equal(isPurgeEligible(null, now), false);
});

test("回收与恢复经原子生命周期 RPC 执行", async () => {
  const trash = lifecycleDeps({ role: "admin", lifecycleState: "active" });
  const trashed = await performVideoLifecycleAction({ videoId: "video-1", action: "trash" }, trash.deps);
  assert.equal(trashed.ok, true);
  assert.deepEqual(trash.rpcCalls[0], { p_video_id: "video-1", p_action: "trash", p_actor_id: "admin-1" });

  const restore = lifecycleDeps({ role: "admin", lifecycleState: "trashed" });
  const restored = await performVideoLifecycleAction({ videoId: "video-1", action: "restore" }, restore.deps);
  assert.equal(restored.ok, true);
  assert.deepEqual(restore.rpcCalls[0], { p_video_id: "video-1", p_action: "restore", p_actor_id: "admin-1" });
});

test("已永久删除作品重复 purge 只重试截图清理，不重复写生命周期审计", async () => {
  const retry = lifecycleDeps({ role: "admin", companyRole: "company_owner", lifecycleState: "purged", trashedAt: "2026-06-01T00:00:00.000Z", storageError: true, includeScreenshot: true });
  const result = await performVideoLifecycleAction({ videoId: "video-1", action: "purge" }, retry.deps);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.lifecycleState, "purged");
  assert.equal(result.screenshotCleanupFailed, true);
  assert.equal(retry.rpcCalls.length, 0);
});

test("只清理确认归属当前作品所有者的 submission-screenshots", () => {
  assert.deepEqual(
    extractSubmissionScreenshotPaths([
      "https://dydata.cc/api/submission-screenshots/file?path=user-1%2F2026-07-20%2Fa.png",
      "https://dydata.cc/api/submission-screenshots/file?path=user-2%2F2026-07-20%2Fb.png",
      "https://outside.example/video.mp4",
    ], "user-1"),
    ["user-1/2026-07-20/a.png"],
  );
});
