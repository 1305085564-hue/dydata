import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSubmissionScreenshotUrl,
  parseSubmissionScreenshotPath,
} from "@/lib/submission-screenshot-access";
import { resolveReadOnlyCompanyScope } from "@/lib/data-access-scope";
import { loadAdminContentVideoDetail } from "@/lib/loaders/content-detail";
import { canReadContentVideoScreenshot } from "./video-screenshot-access";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const VIDEO_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_VIDEO_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_COMPANY_VIDEO_ID = "44444444-4444-4444-8444-444444444444";
const VIDEO_OWNER_ID = "55555555-5555-4555-8555-555555555555";
const COMPANY_A_MEMBER_ID = "66666666-6666-4666-8666-666666666666";
const COMPANY_A_TEAM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COMPANY_B_TEAM_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OBJECT_PATH = `${VIDEO_OWNER_ID}/account-1/retention/留存图.jpg`;

function makeDependencies({
  permissionUserId = USER_ID,
  canReadVideoReview = true,
  contextPresent = true,
  detailVideoId = VIDEO_ID,
  screenshotUrls = [buildSubmissionScreenshotUrl("https://example.test", OBJECT_PATH)],
  loadDetail = async () => ({
    video: { id: detailVideoId },
    snapshot: { screenshot_urls: screenshotUrls },
  }),
}: {
  permissionUserId?: string;
  canReadVideoReview?: boolean;
  contextPresent?: boolean;
  detailVideoId?: string;
  screenshotUrls?: string[];
  loadDetail?: (input: { videoId: string }) => Promise<unknown>;
} = {}) {
  const calls = { context: 0, client: 0, scope: 0, detail: 0 };
  const deps = {
    getCurrentPermissionContext: async () => {
      calls.context += 1;
      if (!contextPresent) return null;
      return {
        permissionInfo: {
          userId: permissionUserId,
          permissions: { view_video_review: canReadVideoReview },
        },
        scope: { userId: permissionUserId, visibleUserIds: [permissionUserId, VIDEO_OWNER_ID] },
      } as never;
    },
    createAdminClient: () => {
      calls.client += 1;
      return {} as never;
    },
    resolveReadOnlyCompanyScope: async (_client: unknown, scope: unknown) => {
      calls.scope += 1;
      return scope as never;
    },
    loadAdminContentVideoDetail: async (input: { videoId: string }) => {
      calls.detail += 1;
      return await loadDetail(input) as never;
    },
  };

  return { deps, calls };
}

function makeCrossCompanySupabase({
  targetVideoId = OTHER_COMPANY_VIDEO_ID,
  targetVideoOwnerId = VIDEO_OWNER_ID,
  screenshotUrls = [],
}: {
  targetVideoId?: string;
  targetVideoOwnerId?: string;
  screenshotUrls?: string[];
} = {}) {
  const queryLog: Array<{ table: string; filters: Map<string, unknown> }> = [];
  let snapshotReadCount = 0;
  const profiles = [
    { id: USER_ID, team_id: COMPANY_A_TEAM_ID, membership_status: "active", archive_snapshot: null, archived_by: null },
    { id: COMPANY_A_MEMBER_ID, team_id: COMPANY_A_TEAM_ID, membership_status: "active", archive_snapshot: null, archived_by: null },
    { id: VIDEO_OWNER_ID, team_id: COMPANY_B_TEAM_ID, membership_status: "active", archive_snapshot: null, archived_by: null },
  ];
  const targetVideo = {
    id: targetVideoId,
    account_id: "bbbbbbbb-0000-4000-8000-000000000001",
    user_id: targetVideoOwnerId,
    video_url: "https://example.test/video-b",
    video_title: "公司 B 的作品",
    content: "公司 B 的作品文案",
    published_at: "2026-10-20T08:00:00.000Z",
    uploaded_at: "2026-10-20T08:00:00.000Z",
    anomaly_status: null,
    review_status: null,
    reviewed_at: null,
    lifecycle_state: "active",
    trashed_at: null,
    trashed_by: null,
    purged_at: null,
    purged_by: null,
    created_at: "2026-10-20T08:00:00.000Z",
    accounts: { name: "作品账号", profile_id: targetVideoOwnerId },
    profiles: { name: "作品成员" },
  };

  const client = {
    from(table: string) {
      const filters = new Map<string, unknown>();
      const read = () => {
        queryLog.push({ table, filters: new Map(filters) });
        if (table === "profiles") {
          const teamId = filters.get("team_id");
          return {
            data: teamId ? profiles.filter((profile) => profile.team_id === teamId) : profiles,
            error: null,
          };
        }
        if (table === "videos") {
          const row = filters.get("id") === targetVideoId
            && filters.get("lifecycle_state") === "active"
            ? targetVideo
            : null;
          return { data: filters.has("id") ? row : [], error: null };
        }
        if (table === "video_metrics_snapshots") {
          snapshotReadCount += 1;
          const snapshots = filters.get("video_id") === targetVideoId
            && filters.get("snapshot_type") === "24h"
            ? [{
                id: "snapshot-1",
                video_id: targetVideoId,
                snapshot_type: "24h",
                captured_at: "2026-10-21T08:00:00.000Z",
                play_count: 5000,
                screenshot_urls: screenshotUrls,
                curve_screenshot_url: null,
                retention_screenshot_url: null,
              }]
            : [];
          return { data: snapshots, error: null };
        }
        if (table === "video_content_segments" || table === "video_tags") return { data: [], error: null };
        throw new Error(`Unexpected table read: ${table}`);
      };
      const chain = {
        select() { return chain; },
        eq(column: string, value: unknown) { filters.set(column, value); return chain; },
        order() { return chain; },
        limit() { return chain; },
        lt() { return chain; },
        maybeSingle() { return Promise.resolve(read()); },
        then(resolve: (result: ReturnType<typeof read>) => unknown, reject?: (error: unknown) => unknown) {
          return Promise.resolve(read()).then(resolve, reject);
        },
      };
      return chain;
    },
  };

  return { client, queryLog, get snapshotReadCount() { return snapshotReadCount; } };
}

test("无效用户/作品 UUID 或不安全路径在查权限和数据库前拒绝", async () => {
  const { deps, calls } = makeDependencies();

  assert.equal(await canReadContentVideoScreenshot({ userId: "user-1", videoId: VIDEO_ID, path: OBJECT_PATH }, deps), false);
  assert.equal(await canReadContentVideoScreenshot({ userId: USER_ID, videoId: "video-1", path: OBJECT_PATH }, deps), false);
  assert.equal(await canReadContentVideoScreenshot({ userId: USER_ID, videoId: VIDEO_ID, path: "owner/../private.jpg" }, deps), false);
  assert.deepEqual(calls, { context: 0, client: 0, scope: 0, detail: 0 });
});

test("未登录、无作品只读权限或用户错配都拒绝且不读取作品", async () => {
  const noSession = makeDependencies({ contextPresent: false });
  assert.equal(await canReadContentVideoScreenshot({ userId: USER_ID, videoId: VIDEO_ID, path: OBJECT_PATH }, noSession.deps), false);

  const noReadPermission = makeDependencies({ canReadVideoReview: false });
  assert.equal(await canReadContentVideoScreenshot({ userId: USER_ID, videoId: VIDEO_ID, path: OBJECT_PATH }, noReadPermission.deps), false);
  assert.equal(noReadPermission.calls.client, 0);

  const wrongUser = makeDependencies({ permissionUserId: VIDEO_OWNER_ID });
  assert.equal(await canReadContentVideoScreenshot({ userId: USER_ID, videoId: VIDEO_ID, path: OBJECT_PATH }, wrongUser.deps), false);
  assert.equal(wrongUser.calls.client, 0);
});

test("跨公司或范围外作品由只读详情 loader 拒绝", async () => {
  const outsideCompany = makeDependencies({ loadDetail: async () => null });
  assert.equal(await canReadContentVideoScreenshot({ userId: USER_ID, videoId: OTHER_COMPANY_VIDEO_ID, path: OBJECT_PATH }, outsideCompany.deps), false);

  const differentVideo = makeDependencies({ detailVideoId: OTHER_VIDEO_ID });
  assert.equal(await canReadContentVideoScreenshot({ userId: USER_ID, videoId: VIDEO_ID, path: OBJECT_PATH }, differentVideo.deps), false);
});

test("真实只读范围与详情 loader 联动拦截跨公司作品，且在授权前不读取快照", async () => {
  const database = makeCrossCompanySupabase();
  const companyAPath = `${USER_ID}/account-1/retention/留存图.jpg`;
  const deps = {
    getCurrentPermissionContext: async () => ({
      permissionInfo: {
        userId: USER_ID,
        role: "member",
        companyRole: "member",
        membershipStatus: "active",
        dataScope: "self",
        teamId: COMPANY_A_TEAM_ID,
        permissions: { view_video_review: true },
      },
      scope: {
        userId: USER_ID,
        role: "member",
        companyRole: "member",
        permissions: { view_video_review: true },
        teamId: COMPANY_A_TEAM_ID,
        kind: "self",
        visibleUserIds: [USER_ID],
        activeVisibleUserIds: [USER_ID],
      },
    }) as never,
    createAdminClient: () => database.client as never,
    resolveReadOnlyCompanyScope,
    loadAdminContentVideoDetail,
  };

  const allowed = await canReadContentVideoScreenshot({
    userId: USER_ID,
    videoId: OTHER_COMPANY_VIDEO_ID,
    path: companyAPath,
  }, deps);

  assert.equal(allowed, false);
  assert.equal(database.snapshotReadCount, 0, "越权视频应在快照读取前被范围过滤");
  assert.deepEqual(
    database.queryLog.find((query) => query.table === "videos")?.filters,
    new Map([
      ["id", OTHER_COMPANY_VIDEO_ID],
      ["lifecycle_state", "active"],
    ]),
    "loader 应直查请求视频并限制 active 生命周期",
  );
});

test("可见作品快照若指向范围外公司 owner 前缀，仍拒绝该截图路径", async () => {
  const database = makeCrossCompanySupabase({
    targetVideoId: VIDEO_ID,
    targetVideoOwnerId: COMPANY_A_MEMBER_ID,
    screenshotUrls: [buildSubmissionScreenshotUrl("https://example.test", OBJECT_PATH)],
  });
  const deps = {
    getCurrentPermissionContext: async () => ({
      permissionInfo: {
        userId: USER_ID,
        role: "member",
        companyRole: "member",
        membershipStatus: "active",
        dataScope: "self",
        teamId: COMPANY_A_TEAM_ID,
        permissions: { view_video_review: true },
      },
      scope: {
        userId: USER_ID,
        role: "member",
        companyRole: "member",
        permissions: { view_video_review: true },
        teamId: COMPANY_A_TEAM_ID,
        kind: "self",
        visibleUserIds: [USER_ID],
        activeVisibleUserIds: [USER_ID],
      },
    }) as never,
    createAdminClient: () => database.client as never,
    resolveReadOnlyCompanyScope,
    loadAdminContentVideoDetail,
  };

  const allowed = await canReadContentVideoScreenshot({ userId: USER_ID, videoId: VIDEO_ID, path: OBJECT_PATH }, deps);

  assert.equal(allowed, false);
  assert.equal(database.snapshotReadCount, 0, "范围外 owner 前缀应在读取作品快照前拒绝");
});

test("同一 owner 前缀下未关联到该作品快照的对象路径仍拒绝", async () => {
  const { deps } = makeDependencies({
    screenshotUrls: [buildSubmissionScreenshotUrl("https://example.test", `${VIDEO_OWNER_ID}/account-1/retention/other.jpg`)],
  });

  assert.equal(await canReadContentVideoScreenshot({ userId: USER_ID, videoId: VIDEO_ID, path: OBJECT_PATH }, deps), false);
});

test("仅精确关联到可见作品快照的截图对象允许读取，编码 URL 可还原为同一路径", async () => {
  const encodedPath = `${VIDEO_OWNER_ID}/account-1/curve/曲线 + 空格 #1.jpg`;
  const encodedUrl = buildSubmissionScreenshotUrl("https://example.test", encodedPath);
  assert.match(encodedUrl, /%2B/);
  assert.equal(parseSubmissionScreenshotPath(encodedUrl), encodedPath);

  const { deps } = makeDependencies({ screenshotUrls: [encodedUrl] });
  assert.equal(await canReadContentVideoScreenshot({ userId: USER_ID, videoId: VIDEO_ID, path: encodedPath }, deps), true);
});

test("权限范围或详情查询失败时向调用方抛出，不能吞掉后放行", async () => {
  const { deps } = makeDependencies({
    loadDetail: async () => { throw new Error("snapshot query failed"); },
  });

  await assert.rejects(
    canReadContentVideoScreenshot({ userId: USER_ID, videoId: VIDEO_ID, path: OBJECT_PATH }, deps),
    /snapshot query failed/,
  );
});
