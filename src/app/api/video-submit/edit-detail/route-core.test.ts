import assert from "node:assert/strict";
import test from "node:test";

import {
  EDIT_DETAIL_ASSIGNEE_PROFILE_SELECT,
  EDIT_DETAIL_USAGE_RECORD_SELECT,
  decodeEditDetailUsageRecordRows,
  loadVideoSubmissionEditDetailPage,
  type EditDetailPageDbAdapter,
} from "./route-core";

const USER_ID = "123e4567-e89b-12d3-a456-426614174001";
const OTHER_USER_ID = "123e4567-e89b-12d3-a456-426614174009";
const ACCOUNT_ID = "223e4567-e89b-12d3-a456-426614174002";
const VIDEO_ID = "323e4567-e89b-12d3-a456-426614174004";
const REPORT_ID = "423e4567-e89b-12d3-a456-426614174005";
const SNAPSHOT_ID = "523e4567-e89b-12d3-a456-426614174006";
const BIZ_DATE = "2026-08-25";
const ARCHIVED_MEMBER_ID = "623e4567-e89b-12d3-a456-426614174007";

function buildVideo(overrides: Record<string, unknown> = {}) {
  return {
    id: VIDEO_ID,
    account_id: ACCOUNT_ID,
    video_url: "https://example.com/video",
    video_title: "原标题",
    content: "原文案",
    published_at: "2026-08-25T02:00:00.000Z",
    uploaded_at: "2026-08-24T16:30:00.000Z",
    anomaly_status: "normal",
    punish_type: null,
    platform_notice: null,
    appeal: null,
    script_author_user_id: USER_ID,
    video_editor_user_id: ARCHIVED_MEMBER_ID,
    operator_user_id: USER_ID,
    ...overrides,
  };
}

function buildSnapshot() {
  return {
    id: SNAPSHOT_ID,
    video_id: VIDEO_ID,
    snapshot_type: "24h",
    play_count: 1200,
    likes: 12,
    comments: 3,
    shares: 4,
    favorites: 5,
    follower_gain: 8,
    follower_loss: 2,
    follower_convert: 1,
    avg_play_duration: 12.5,
    bounce_rate_2s: 20,
    completion_rate_5s: 45,
    completion_rate: 18,
    screenshot_urls: [
      "https://dydata.cc/api/submission-screenshots/file?path=user/a.png",
      "https://dydata.cc/api/submission-screenshots/file?path=user/b.png",
    ],
    curve_screenshot_url: null,
    retention_screenshot_url: null,
    vs_previous: {
      published_at_text: "2026-08-25 10:00",
      ocr_assets: [
        { role: "screenshot_1", confirmed: true },
        { role: "screenshot_2", confirmed: true },
      ],
    },
  };
}

type AdapterOverrides = Partial<EditDetailPageDbAdapter>;

function buildAdapter(overrides: AdapterOverrides = {}) {
  const calls = { profiles: [] as string[][] };
  const base: EditDetailPageDbAdapter & { calls: typeof calls } = {
    calls,
    getAccountById: async () => ({ data: { id: ACCOUNT_ID, profile_id: USER_ID }, error: null }),
    listReportsByAccountAndDate: async () => ({
      data: [{ id: REPORT_ID, user_id: USER_ID, account_id: ACCOUNT_ID, report_date: BIZ_DATE }],
      error: null,
    }),
    listActiveVideosByAccount: async () => ({ data: [buildVideo()] as never, error: null }),
    list24hSnapshotsByVideoId: async () => ({ data: [buildSnapshot()] as never, error: null }),
    listTagsByVideoId: async () => ({
      data: [
        { tag_dimension: "话题", tag_value: "复盘" },
        { tag_dimension: "表达形式", tag_value: "出镜" },
      ],
      error: null,
    }),
    listUsageRecordsByReportAndUser: async () => ({ data: [], error: null }),
    listAssigneeProfilesByIds: async (ids) => {
      calls.profiles.push(ids);
      return {
        data: ids.map((id) => ({
          id,
          name: `用户-${id.slice(0, 4)}`,
          membership_status: id === ARCHIVED_MEMBER_ID ? "archived" : "active",
        })),
        error: null,
      };
    },
    ...overrides,
  };
  return base;
}

test("历史责任人查询只使用 profiles 真实字段，不读取不存在的 display_name", () => {
  assert.equal(EDIT_DETAIL_ASSIGNEE_PROFILE_SELECT, "id, name, membership_status");
});

test("导粉话术从关联案例读取，不查询使用记录表中不存在的字段", () => {
  assert.equal(
    EDIT_DETAIL_USAGE_RECORD_SELECT,
    "id, case:violation_cases!script_usage_records_case_id_fkey(script_text, script_format)",
  );
  assert.deepEqual(
    decodeEditDetailUsageRecordRows([
      {
        id: "usage-1",
        case: { script_text: "关注公众号领取复盘表", script_format: "mixed" },
      },
    ]),
    {
      data: [
        {
          id: "usage-1",
          script_text: "关注公众号领取复盘表",
          script_format: "mixed",
        },
      ],
      error: null,
    },
  );
});

test("导粉话术关联案例缺失时阻断编辑，避免保存时清除原记录", () => {
  const result = decodeEditDetailUsageRecordRows([{ id: "usage-1", case: null }]);

  assert.equal(result.data, null);
  assert.match(result.error?.message ?? "", /关联案例缺失/);
});

test("400：biz_date 格式错误直接拒绝，不触达数据库", async () => {
  const adapter = buildAdapter();
  const result = await loadVideoSubmissionEditDetailPage(
    { accountId: ACCOUNT_ID, bizDate: "20260825", userId: USER_ID },
    adapter,
  );
  assert.equal(result.status, 400);
});

test("401：未登录返回明确错误", async () => {
  const result = await loadVideoSubmissionEditDetailPage(
    { accountId: ACCOUNT_ID, bizDate: BIZ_DATE, userId: null },
    buildAdapter(),
  );
  assert.deepEqual(result, { status: 401, body: { error: "未登录" } });
});

test("403：跨账号访问被拒绝", async () => {
  const result = await loadVideoSubmissionEditDetailPage(
    { accountId: ACCOUNT_ID, bizDate: BIZ_DATE, userId: OTHER_USER_ID },
    buildAdapter({
      getAccountById: async () => ({ data: { id: ACCOUNT_ID, profile_id: USER_ID }, error: null }),
    }),
  );
  assert.deepEqual(result, { status: 403, body: { error: "账号不存在或无权限读取编辑详情" } });
});

test("404：缺日报或缺原视频分别返回明确 404", async () => {
  const missingReport = await loadVideoSubmissionEditDetailPage(
    { accountId: ACCOUNT_ID, bizDate: BIZ_DATE, userId: USER_ID },
    buildAdapter({ listReportsByAccountAndDate: async () => ({ data: [], error: null }) }),
  );
  assert.equal(missingReport.status, 404);

  const missingVideo = await loadVideoSubmissionEditDetailPage(
    { accountId: ACCOUNT_ID, bizDate: BIZ_DATE, userId: USER_ID },
    buildAdapter({ listActiveVideosByAccount: async () => ({ data: [], error: null }) }),
  );
  assert.equal(missingVideo.status, 404);
});

test("409：重复日报、重复视频、重复快照均阻断", async () => {
  const duplicatedReports = await loadVideoSubmissionEditDetailPage(
    { accountId: ACCOUNT_ID, bizDate: BIZ_DATE, userId: USER_ID },
    buildAdapter({
      listReportsByAccountAndDate: async () => ({
        data: [
          { id: REPORT_ID, user_id: USER_ID, account_id: ACCOUNT_ID, report_date: BIZ_DATE },
          { id: "dup", user_id: USER_ID, account_id: ACCOUNT_ID, report_date: BIZ_DATE },
        ],
        error: null,
      }),
    }),
  );
  assert.equal(duplicatedReports.status, 409);

  const duplicatedVideos = await loadVideoSubmissionEditDetailPage(
    { accountId: ACCOUNT_ID, bizDate: BIZ_DATE, userId: USER_ID },
    buildAdapter({
      listActiveVideosByAccount: async () => ({
        data: [buildVideo(), buildVideo({ id: "dup-video" })] as never,
        error: null,
      }),
    }),
  );
  assert.equal(duplicatedVideos.status, 409);

  const duplicatedSnapshots = await loadVideoSubmissionEditDetailPage(
    { accountId: ACCOUNT_ID, bizDate: BIZ_DATE, userId: USER_ID },
    buildAdapter({
      list24hSnapshotsByVideoId: async () => ({
        data: [buildSnapshot(), { ...buildSnapshot(), id: "dup-snap" }] as never,
        error: null,
      }),
    }),
  );
  assert.equal(duplicatedSnapshots.status, 409);
});

test("422：快照缺失或 DTO 不完整时阻止编辑详情", async () => {
  const missingSnapshot = await loadVideoSubmissionEditDetailPage(
    { accountId: ACCOUNT_ID, bizDate: BIZ_DATE, userId: USER_ID },
    buildAdapter({ list24hSnapshotsByVideoId: async () => ({ data: [], error: null }) }),
  );
  assert.equal(missingSnapshot.status, 422);

  const brokenSnapshot = await loadVideoSubmissionEditDetailPage(
    { accountId: ACCOUNT_ID, bizDate: BIZ_DATE, userId: USER_ID },
    buildAdapter({
      list24hSnapshotsByVideoId: async () => ({
        data: [{ ...buildSnapshot(), play_count: null }] as never,
        error: null,
      }),
    }),
  );
  assert.equal(brokenSnapshot.status, 422);
});

test("200：完整详情包含历史责任人姓名与状态，且只查询原记录精确的三个 ID", async () => {
  const adapter = buildAdapter();
  const result = await loadVideoSubmissionEditDetailPage(
    { accountId: ACCOUNT_ID, bizDate: BIZ_DATE, userId: USER_ID },
    adapter,
  );

  assert.equal(result.status, 200);
  const detail = (result.body as { detail?: Record<string, unknown> }).detail;
  assert.ok(detail);

  // 只查原记录中出现的精确 ID，且去重
  assert.deepEqual(adapter.calls.profiles, [[USER_ID, ARCHIVED_MEMBER_ID]]);

  const profiles = detail.assigneeProfiles as Array<{ userId: string; membershipStatus: string | null }>;
  assert.equal(profiles.length, 2);
  const archived = profiles.find((profile) => profile.userId === ARCHIVED_MEMBER_ID);
  assert.equal(archived?.membershipStatus, "archived");
  // DTO 其余关键字段完整
  assert.equal(detail.videoId, VIDEO_ID);
  assert.equal(detail.bizDate, BIZ_DATE);
});
