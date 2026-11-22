import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { buildPatch24hResponse } from "./route";

const VIDEO_ID = "123e4567-e89b-42d3-a456-426614174000";
const SNAPSHOT_ID = "423e4567-e89b-42d3-a456-426614174000";
const ACTOR_ID = "223e4567-e89b-42d3-a456-426614174000";
const OWNER_ID = "323e4567-e89b-42d3-a456-426614174000";

function buildRequest(body: unknown) {
  return new NextRequest(`https://dydata.cc/api/admin/videos/${VIDEO_ID}/patch-24h`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function buildAuthorizedActor() {
  return {
    supabase: {} as never,
    actor: {
      userId: ACTOR_ID,
      role: "admin" as const,
      companyRole: "admin" as const,
      permissions: { review_content: true },
      name: "复盘管理员",
      dataScope: "team" as const,
      teamId: "team-1",
      membershipStatus: "active" as const,
    },
  };
}

function buildScopeContext() {
  return {
    permissionInfo: {} as never,
    scope: {
      userId: ACTOR_ID,
      role: "admin" as const,
      companyRole: "admin" as const,
      permissions: { review_content: true },
      teamId: "team-1",
      kind: "team" as const,
      visibleUserIds: [ACTOR_ID, OWNER_ID],
      activeVisibleUserIds: [ACTOR_ID, OWNER_ID],
    },
  };
}

test("部分成功后不带编号重试：复用已保存的24h快照并完成状态更新", async () => {
  const snapshots: Array<Record<string, unknown>> = [];
  const updatedSnapshotIds: string[] = [];
  let insertCount = 0;
  let statusUpdateCount = 0;
  let anomalyStatus = "未满24h";

  const userClient = {
    from(table: string) {
      if (table === "videos") {
        return {
          select() {
            return {
              eq() { return this; },
              async maybeSingle() {
                return {
                  data: {
                    id: VIDEO_ID,
                    user_id: OWNER_ID,
                    anomaly_status: anomalyStatus,
                    accounts: { profile_id: OWNER_ID },
                  },
                  error: null,
                };
              },
            };
          },
          update(payload: Record<string, unknown>) {
            return {
              eq() { return this; },
              select() { return this; },
              async maybeSingle() {
                statusUpdateCount += 1;
                if (statusUpdateCount === 1) {
                  return { data: null, error: { message: "temporary video update failure" } };
                }
                anomalyStatus = String(payload.anomaly_status);
                return { data: { id: VIDEO_ID, anomaly_status: anomalyStatus }, error: null };
              },
            };
          },
        };
      }

      assert.equal(table, "video_metrics_snapshots");
      return {
        select() {
          const filters = new Map<string, string>();
          const query = {
            eq(column: string, value: string) {
              filters.set(column, value);
              return this;
            },
            order(column: string, options: { ascending: boolean }) {
              assert.equal(column, "captured_at");
              assert.deepEqual(options, { ascending: false });
              return this;
            },
            limit(value: number) {
              assert.equal(value, 1);
              return this;
            },
            async maybeSingle() {
              assert.equal(filters.get("video_id"), VIDEO_ID);
              assert.equal(filters.get("snapshot_type"), "24h");
              const existing = snapshots.find((snapshot) => snapshot.video_id === VIDEO_ID && snapshot.snapshot_type === "24h");
              return { data: existing ? { id: existing.id } : null, error: null };
            },
          };
          return query;
        },
        insert(payload: Record<string, unknown>) {
          insertCount += 1;
          const snapshot = { id: SNAPSHOT_ID, ...payload };
          snapshots.push(snapshot);
          return {
            select() { return this; },
            async maybeSingle() { return { data: snapshot, error: null }; },
          };
        },
        update(patch: Record<string, unknown>) {
          const filters = new Map<string, string>();
          const query = {
            eq(column: string, value: string) {
              filters.set(column, value);
              return this;
            },
            select() { return this; },
            async maybeSingle() {
              const snapshot = snapshots.find((candidate) =>
                candidate.id === filters.get("id") &&
                candidate.video_id === filters.get("video_id") &&
                candidate.snapshot_type === filters.get("snapshot_type"),
              );
              if (!snapshot) return { data: null, error: null };
              updatedSnapshotIds.push(String(snapshot.id));
              Object.assign(snapshot, patch);
              return { data: snapshot, error: null };
            },
          };
          return query;
        },
      };
    },
  };

  const deps = {
    requireAdminActor: async () => buildAuthorizedActor(),
    buildPermissionContextForActor: async () => buildScopeContext(),
    createClient: async () => userClient as never,
  };

  const firstResponse = await buildPatch24hResponse(
    buildRequest({ metrics: { play_count: "5000", likes: "120" } }),
    VIDEO_ID,
    deps,
  );
  assert.equal(firstResponse.status, 500);
  const firstBody = await firstResponse.json();
  assert.equal(firstBody.code, "PATCH_24H_STATUS_UPDATE_FAILED");
  assert.equal(firstBody.snapshot.id, SNAPSHOT_ID);
  assert.equal(snapshots.length, 1);

  const retryResponse = await buildPatch24hResponse(
    buildRequest({ metrics: { play_count: "6000", likes: "150" } }),
    VIDEO_ID,
    deps,
  );
  assert.equal(retryResponse.status, 200);
  const retryBody = await retryResponse.json();
  assert.equal(retryBody.snapshot.id, SNAPSHOT_ID);
  assert.equal(retryBody.statusUpdated, true);
  assert.equal(retryBody.video.anomaly_status, "正常");
  assert.equal(insertCount, 1);
  assert.equal(snapshots.length, 1);
  assert.deepEqual(updatedSnapshotIds, [SNAPSHOT_ID]);
  assert.equal(snapshots[0].play_count, 6000);
});
