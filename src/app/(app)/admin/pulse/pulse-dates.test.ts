import assert from "node:assert/strict";
import test from "node:test";
import type { VideoMetricsSnapshot } from "@/types";
import { filterContentVideos } from "../content/content-list-filters";
import {
  attributionDate,
  buildCapsuleFilters,
  computePulseMembers,
  computePulseSummary,
  type PulseVideoRow,
} from "./pulse-filters";

const video = (id: string, published_at: string | null) => ({
  id, published_at, user_id: "owner", account_id: "account",
  accounts: { profile_id: "owner" }, video_title: id, content: null,
}) as PulseVideoRow;
const snapshot = (video_id: string, play_count: number) => ({ video_id, play_count }) as VideoMetricsSnapshot;

test("大盘发布日期按上海午夜归属，UTC与带时区时间表示一致", () => {
  assert.equal(attributionDate(video("before", "2026-08-08T15:59:59Z")), "2026-08-08");
  assert.equal(attributionDate(video("midnight", "2026-08-08T16:00:00Z")), "2026-08-09");
  assert.equal(attributionDate(video("local", "2026-08-09T00:00:00+08:00")), "2026-08-09");
  assert.equal(attributionDate(video("unknown", null)), null);
  assert.equal(attributionDate(video("invalid", "invalid")), null);
});

test("汇总、人员、作品列表和30天趋势使用同一天，缺失日保留null", () => {
  const videos = [
    video("previous", "2026-08-07T10:00:00Z"),
    video("utc", "2026-08-08T19:00:00Z"),
    video("local", "2026-08-09T03:00:00+08:00"),
  ];
  const snapshots = new Map([
    ["previous", snapshot("previous", 10)],
    ["utc", snapshot("utc", 40)],
    ["local", snapshot("local", 60)],
  ]);
  const day = "2026-08-09";
  const dayVideos = videos.filter((v) => attributionDate(v) === day);
  const listed = filterContentVideos(dayVideos, buildCapsuleFilters(day, "all"));
  const summary = computePulseSummary(day, videos, snapshots);
  const members = computePulseMembers(day, videos, snapshots, [{ id: "owner", name: "成员" }]);
  assert.deepEqual(dayVideos.map((v) => v.id), ["utc", "local"]);
  assert.equal(summary.worksCount, listed.length);
  assert.equal(summary.worksCount, 2);
  assert.equal(summary.totalPlay, 100);
  assert.equal(members[0].publishedCount, listed.length);
  assert.equal(members[0].totalPlay, 100);
  assert.equal(summary.dayOverDayRate, null);
  assert.equal(summary.series.length, 30);
  assert.deepEqual(summary.series.slice(-3).map((p) => [p.date, p.totalPlay]), [
    ["2026-08-07", 10], ["2026-08-08", null], ["2026-08-09", 100],
  ]);
});

test("跨年时按上海发布日计算日环比", () => {
  const videos = [video("previous", "2026-12-30T16:00:00Z"), video("current", "2026-12-31T16:00:00Z")];
  const snapshots = new Map([["previous", snapshot("previous", 50)], ["current", snapshot("current", 100)]]);
  const summary = computePulseSummary("2027-01-01", videos, snapshots);
  assert.equal(summary.totalPlay, 100);
  assert.equal(summary.dayOverDayRate, 100);
  assert.equal(summary.series.at(-1)?.date, "2027-01-01");
});
