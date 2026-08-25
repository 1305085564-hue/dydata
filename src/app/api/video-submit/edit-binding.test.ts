import assert from "node:assert/strict";
import test from "node:test";

import {
  collectAssigneeIdsRequiringValidation,
  editVideoMatchesBizDate,
  mergePreservedEditSnapshotFields,
  validateEditSubmissionBinding,
  type EditBindingDbAdapter,
} from "./edit-binding";

const USER_ID = "123e4567-e89b-12d3-a456-426614174001";
const OTHER_USER_ID = "123e4567-e89b-12d3-a456-426614174009";
const ACCOUNT_ID = "223e4567-e89b-12d3-a456-426614174002";
const VIDEO_ID = "323e4567-e89b-12d3-a456-426614174004";
const REPORT_ID = "423e4567-e89b-12d3-a456-426614174005";
const SNAPSHOT_ID = "523e4567-e89b-12d3-a456-426614174006";
const BIZ_DATE = "2026-08-25";

function buildOwnedVideo(overrides: Record<string, unknown> = {}) {
  return {
    id: VIDEO_ID,
    account_id: ACCOUNT_ID,
    user_id: USER_ID,
    published_at: "2026-08-25T02:00:00.000Z",
    uploaded_at: "2026-08-24T16:30:00.000Z",
    lifecycle_state: "active",
    script_author_user_id: null,
    video_editor_user_id: null,
    operator_user_id: null,
    ...overrides,
  };
}

function buildAdapter(input: {
  videos?: Array<Record<string, unknown>> | null;
  reports?: Array<Record<string, unknown>> | null;
  snapshots?: Array<Record<string, unknown>> | null;
  videoError?: string;
  reportError?: string;
  snapshotError?: string;
}) {
  const calls = { loadVideoById: 0, loadReports: 0, loadSnapshots: 0 };
  const writes = { delete: 0, insert: 0, update: 0 };
  const adapter: EditBindingDbAdapter & { calls: typeof calls; writes: typeof writes } = {
    calls,
    writes,
    loadVideoById: async () => {
      calls.loadVideoById++;
      if (input.videoError) return { data: null, error: { message: input.videoError } };
      return { data: (input.videos ?? []) as never, error: null };
    },
    loadDailyReportsByAccountAndDate: async () => {
      calls.loadReports++;
      if (input.reportError) return { data: null, error: { message: input.reportError } };
      return { data: (input.reports ?? []) as never, error: null };
    },
    load24hSnapshotsByVideoId: async () => {
      calls.loadSnapshots++;
      if (input.snapshotError) return { data: null, error: { message: input.snapshotError } };
      return { data: (input.snapshots ?? []) as never, error: null };
    },
  };
  return adapter;
}

function buildInput() {
  return { userId: USER_ID, accountId: ACCOUNT_ID, bizDate: BIZ_DATE, videoId: VIDEO_ID };
}

function happyAdapter(overrides: Parameters<typeof buildAdapter>[0] = {}) {
  return buildAdapter({
    videos: [buildOwnedVideo()],
    reports: [{ id: REPORT_ID, user_id: USER_ID, account_id: ACCOUNT_ID, report_date: BIZ_DATE }],
    snapshots: [{ id: SNAPSHOT_ID, video_id: VIDEO_ID, snapshot_type: "24h" }],
    ...overrides,
  });
}

test("合法原绑定允许编辑：视频、日报、快照恰好各一条且归属当前用户", async () => {
  const adapter = happyAdapter();
  const result = await validateEditSubmissionBinding(buildInput(), adapter);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.video.id, VIDEO_ID);
  assert.equal(result.dailyReport.id, REPORT_ID);
  assert.equal(result.snapshot24h.id, SNAPSHOT_ID);
  // 校验阶段只有读取，没有任何写入
  assert.equal(adapter.writes.delete + adapter.writes.insert + adapter.writes.update, 0);
});

test("原视频属于其他用户时统一返回 404，不泄露记录是否存在", async () => {
  const adapter = happyAdapter({ videos: [buildOwnedVideo({ user_id: OTHER_USER_ID })] });
  const result = await validateEditSubmissionBinding(buildInput(), adapter);

  assert.deepEqual(result, { ok: false, status: 404, error: "原视频不存在或无权限编辑" });

  const missing = await validateEditSubmissionBinding(buildInput(), happyAdapter({ videos: [] }));
  assert.deepEqual(missing, { ok: false, status: 404, error: "原视频不存在或无权限编辑" });
});

test("替换业务日期被阻断：原视频不属于请求日期返回 409", async () => {
  const adapter = await validateEditSubmissionBinding(
    { ...buildInput(), bizDate: "2026-08-20" },
    happyAdapter(),
  );
  assert.deepEqual(adapter, {
    ok: false,
    status: 409,
    error: "原视频不属于该业务日期，已停止编辑以避免跨日期覆盖",
  });
});

test("缺原日报返回 404，重复日报返回 409", async () => {
  const missing = await validateEditSubmissionBinding(
    buildInput(),
    happyAdapter({ reports: [] }),
  );
  assert.deepEqual(missing, { ok: false, status: 404, error: "该账号该日期没有可编辑的日报" });

  const duplicated = await validateEditSubmissionBinding(
    buildInput(),
    happyAdapter({
      reports: [
        { id: REPORT_ID, user_id: USER_ID, account_id: ACCOUNT_ID, report_date: BIZ_DATE },
        { id: "dup-report", user_id: USER_ID, account_id: ACCOUNT_ID, report_date: BIZ_DATE },
      ],
    }),
  );
  assert.deepEqual(duplicated, { ok: false, status: 409, error: "该账号该日期存在多条日报，无法安全编辑" });
});

test("原日报属于其他用户时按 404 处理，不泄露记录存在性", async () => {
  const result = await validateEditSubmissionBinding(
    buildInput(),
    happyAdapter({
      reports: [{ id: REPORT_ID, user_id: OTHER_USER_ID, account_id: ACCOUNT_ID, report_date: BIZ_DATE }],
    }),
  );
  assert.deepEqual(result, { ok: false, status: 404, error: "该账号该日期没有可编辑的日报" });
});

test("缺快照返回 422，重复快照返回 409，均不能落为模糊 500", async () => {
  const missingSnapshot = await validateEditSubmissionBinding(
    buildInput(),
    happyAdapter({ snapshots: [] }),
  );
  assert.deepEqual(missingSnapshot, {
    ok: false,
    status: 422,
    error: "原视频缺少24h快照，已停止编辑以避免覆盖历史数据",
  });

  const duplicatedSnapshot = await validateEditSubmissionBinding(
    buildInput(),
    happyAdapter({
      snapshots: [
        { id: SNAPSHOT_ID, video_id: VIDEO_ID, snapshot_type: "24h" },
        { id: "dup-snapshot", video_id: VIDEO_ID, snapshot_type: "24h" },
      ],
    }),
  );
  assert.deepEqual(duplicatedSnapshot, { ok: false, status: 409, error: "原视频存在多条24h快照，无法安全编辑" });
});

test("已永久删除的视频返回 409，账号不一致返回 409", async () => {
  const purged = await validateEditSubmissionBinding(
    buildInput(),
    happyAdapter({ videos: [buildOwnedVideo({ lifecycle_state: "purged" })] }),
  );
  assert.deepEqual(purged, { ok: false, status: 409, error: "视频记录已永久删除，请修改内容后重新提交" });

  const accountMismatch = await validateEditSubmissionBinding(
    buildInput(),
    happyAdapter({ videos: [buildOwnedVideo({ account_id: "999e4567-e89b-12d3-a456-426614174099" })] }),
  );
  assert.deepEqual(accountMismatch, { ok: false, status: 409, error: "编辑视频与提交账号不一致" });
});

test("阻断路径只发生读取：三个加载器各调用后立即停止，无写入副作用", async () => {
  const adapter = happyAdapter({ snapshots: [] });
  const result = await validateEditSubmissionBinding(buildInput(), adapter);

  assert.equal(result.ok, false);
  assert.equal(adapter.calls.loadVideoById, 1);
  assert.equal(adapter.calls.loadReports, 1);
  assert.equal(adapter.calls.loadSnapshots, 1);
  assert.equal(adapter.writes.delete + adapter.writes.insert + adapter.writes.update, 0);
});

test("编辑保存只改文案时，不可编辑旧指标全部保持数据库原值", () => {
  const clientPayload = {
    play_count: 1200,
    likes: 12,
    comments: 3,
    shares: 4,
    favorites: 5,
    follower_gain: 8,
    follower_loss: 0,
    follower_convert: 2,
    avg_play_duration: 12,
    bounce_rate_2s: 20,
    completion_rate_5s: 45,
    completion_rate: 18,
    homepage_visits: 0,
    fan_play_ratio: null,
    cover_click_rate: null,
    avg_play_ratio: null,
  };
  const existingSnapshot = {
    follower_loss: 7,
    homepage_visits: 320,
    fan_play_ratio: 0.42,
    cover_click_rate: 0.11,
    avg_play_ratio: 0.66,
  };

  const merged = mergePreservedEditSnapshotFields("edit", clientPayload, existingSnapshot);

  // 前端固定发送的默认值被服务端原值覆盖
  assert.equal(merged.follower_loss, 7);
  assert.equal(merged.homepage_visits, 320);
  assert.equal(merged.fan_play_ratio, 0.42);
  assert.equal(merged.cover_click_rate, 0.11);
  assert.equal(merged.avg_play_ratio, 0.66);
  // 可编辑字段仍来自前端
  assert.equal(merged.play_count, 1200);
  // 新建模式不受影响
  const created = mergePreservedEditSnapshotFields("create", clientPayload, existingSnapshot);
  assert.equal(created.follower_loss, 0);
  assert.equal(created.homepage_visits, 0);
});

test("编辑保存时数据库旧指标为 null 也必须原样保留，不能被前端默认 0 覆盖", () => {
  const merged = mergePreservedEditSnapshotFields(
    "edit",
    {
      follower_loss: 0,
      homepage_visits: 0,
      fan_play_ratio: 0,
      cover_click_rate: 0,
      avg_play_ratio: 0,
    },
    {
      follower_loss: null,
      homepage_visits: null,
      fan_play_ratio: null,
      cover_click_rate: null,
      avg_play_ratio: null,
    },
  );

  assert.equal(merged.follower_loss, null);
  assert.equal(merged.homepage_visits, null);
  assert.equal(merged.fan_play_ratio, null);
  assert.equal(merged.cover_click_rate, null);
  assert.equal(merged.avg_play_ratio, null);
});

test("编辑时只按岗位豁免未修改的旧责任人，新岗位复用同一归档成员仍必须校验", () => {
  const archivedMemberId = "623e4567-e89b-12d3-a456-426614174007";
  const originalAssignees = {
    scriptAuthorUserId: USER_ID,
    videoEditorUserId: archivedMemberId,
    operatorUserId: null,
  };

  // 剪辑岗位未修改可以保留，但把同一个归档成员新指派到文案岗位必须重新校验。
  const requiringValidation = collectAssigneeIdsRequiringValidation(
    {
      scriptAuthorUserId: archivedMemberId,
      videoEditorUserId: archivedMemberId,
      operatorUserId: USER_ID,
    },
    originalAssignees,
    USER_ID,
  );
  assert.deepEqual(requiringValidation, [archivedMemberId]);

  // 仅保留原剪辑责任人，没有新增外部指派时无需校验。
  const keptUnchanged = collectAssigneeIdsRequiringValidation(
    { scriptAuthorUserId: USER_ID, videoEditorUserId: archivedMemberId, operatorUserId: USER_ID },
    originalAssignees,
    USER_ID,
  );
  assert.deepEqual(keptUnchanged, []);

  // 剪辑换成另一个人时，新成员必须校验。
  const changed = collectAssigneeIdsRequiringValidation(
    { scriptAuthorUserId: USER_ID, videoEditorUserId: OTHER_USER_ID, operatorUserId: USER_ID },
    originalAssignees,
    USER_ID,
  );
  assert.deepEqual(changed, [OTHER_USER_ID]);
});

test("日期匹配使用上海时区的发布或上传时间", () => {
  const video = { published_at: "2026-08-24T17:30:00.000Z", uploaded_at: null };
  assert.equal(editVideoMatchesBizDate(video, "2026-08-25"), true);
  assert.equal(editVideoMatchesBizDate(video, "2026-08-24"), false);
});
