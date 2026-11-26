import test from "node:test";
import assert from "node:assert/strict";
import { loadPersonData } from "@/lib/collaboration/data/person-loader";
import type { CollaborationAccount, CollaborationProfile, CollaborationReport } from "@/lib/collaboration/domain/types";

const profiles: CollaborationProfile[] = [
  { id: "writer-1", name: "文案甲", team_id: "team-a" },
];

const accounts: CollaborationAccount[] = [
  { id: "account-1", name: "账号甲", profile_id: "writer-1" },
];

function makeReport(overrides: Partial<CollaborationReport>): CollaborationReport {
  return {
    id: overrides.id ?? "report-1",
    user_id: overrides.user_id ?? "writer-1",
    account_id: overrides.account_id ?? "account-1",
    video_id: overrides.video_id ?? "video-1",
    report_date: overrides.report_date ?? "2026-09-02",
    published_at: overrides.published_at ?? "2026-09-02T10:00:00+08:00",
    title: overrides.title ?? "测试作品",
    play_count: overrides.play_count ?? 12000,
    follower_convert: overrides.follower_convert ?? 10,
    script_author_user_id: overrides.script_author_user_id ?? "writer-1",
    video_editor_user_id: overrides.video_editor_user_id ?? null,
    operator_user_id: overrides.operator_user_id ?? null,
    data_source: overrides.data_source ?? null,
  };
}

test("个人卡 24h 快照与话题标签并行读取", async () => {
  let releaseSnapshots!: () => void;
  const snapshotGate = new Promise<void>((resolve) => {
    releaseSnapshots = resolve;
  });
  let snapshotStarted = false;
  let topicStarted = false;
  const personReport = makeReport({
    id: "writer-report",
    report_date: "2026-09-02",
    video_id: "video-1",
    script_author_user_id: "writer-1",
  });
  const supabase = {
    from(table: string) {
      if (table === "daily_reports") {
        return {
          select() { return this; },
          in() { return this; },
          gte() { return this; },
          lte() { return this; },
          eq() { return this; },
          or() { return this; },
          order() { return this; },
          range() { return Promise.resolve({ data: [personReport], error: null }); },
        };
      }
      if (table === "profiles") {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle() {
            return Promise.resolve({ data: profiles[0], error: null });
          },
        };
      }
      if (table === "accounts") {
        return {
          select() { return this; },
          in() { return Promise.resolve({ data: accounts, error: null }); },
        };
      }
      if (table === "videos") {
        return {
          select() { return this; },
          in() { return this; },
          eq() { return this; },
          or() { return this; },
          order() { return Promise.resolve({ data: [], error: null }); },
        };
      }
      if (table === "video_metrics_snapshots") {
        return {
          select() { return this; },
          eq() { return this; },
          in() {
            snapshotStarted = true;
            return snapshotGate.then(() => ({ data: [], error: null }));
          },
        };
      }
      if (table === "video_tags") {
        return {
          select() { return this; },
          eq() { return this; },
          in() {
            topicStarted = true;
            return Promise.resolve({ data: [], error: null });
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };

  const pending = loadPersonData({
    supabase: supabase as never,
    visibleUserIds: ["writer-1"],
    targetUserId: "writer-1",
    year: 2026,
    month: 9,
    role: "writers",
  });

  await new Promise((resolve) => setImmediate(resolve));
  try {
    assert.equal(snapshotStarted, true);
    assert.equal(topicStarted, true, "话题查询不应等待快照返回");
  } finally {
    releaseSnapshots();
  }
  await pending;
});
