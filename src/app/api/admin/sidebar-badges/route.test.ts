import test from "node:test";
import assert from "node:assert/strict";

import { buildSidebarBadgesResponse } from "./route";

test("sidebar-badges 复用同一份 violation 查询结果，不再重复查表", async () => {
  const calls = {
    violationSelects: 0,
    pendingVideosRpc: 0,
    pendingSubmissionsRpc: 0,
  };

  const supabase = {
    rpc(name: string) {
      if (name === "admin_cockpit_summary") {
        return Promise.resolve({
          data: { pending_videos: 3, pending_submissions: 2 },
          error: null,
        });
      }
      if (name === "admin_pending_submissions_today") {
        calls.pendingSubmissionsRpc += 1;
        return Promise.resolve({
          data: [{ profile_id: "u-1" }, { profile_id: "u-2" }, { profile_id: "other" }],
          error: null,
        });
      }
      if (name === "admin_pending_videos_today") {
        calls.pendingVideosRpc += 1;
        return Promise.resolve({
          data: [{ submitted_by: "u-1" }, { submitted_by: "other" }],
          error: null,
        });
      }
      throw new Error(`unexpected rpc ${name}`);
    },
    from(table: string) {
      if (table === "ai_insight_result") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          then(resolve: (value: unknown) => unknown) {
            return Promise.resolve(resolve({
              data: [{ result_json: { video_id: "video-1" } }],
              error: null,
            }));
          },
        };
      }
      if (table === "violation_cases") {
        calls.violationSelects += 1;
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          then(resolve: (value: unknown) => unknown) {
            return Promise.resolve(resolve({
              data: [
                { id: "case-1", submitted_by: "u-1" },
                { id: "case-2", submitted_by: "other" },
              ],
              error: null,
            }));
          },
        };
      }
      if (table === "videos") {
        return {
          select() {
            return this;
          },
          gte() {
            return this;
          },
          in() {
            return this;
          },
          then(resolve: (value: unknown) => unknown) {
            return Promise.resolve(resolve({
              data: [
                { id: "video-1", user_id: "u-1", accounts: { profile_id: "u-1" } },
                { id: "video-2", user_id: "u-2", accounts: { profile_id: "u-2" } },
              ],
              error: null,
            }));
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  const request = {
    nextUrl: new URL("https://example.com/api/admin/sidebar-badges?date=2026-05-25"),
  };
  const response = await buildSidebarBadgesResponse(request as never, {
    requireAdminServiceClient: async () => ({
      supabase: supabase as never,
      scope: {
        kind: "team",
        visibleUserIds: ["u-1", "u-2"],
      },
    }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();

  assert.equal(calls.violationSelects, 1);
  assert.equal(calls.pendingVideosRpc, 1);
  assert.equal(calls.pendingSubmissionsRpc, 1);
  assert.deepEqual(payload, {
    cockpit: 4,
    videos: 1,
    content: 1,
    conversion_hub: 1,
    ai_channels: 0,
  });
});
