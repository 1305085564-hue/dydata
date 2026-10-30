import test from "node:test";
import assert from "node:assert/strict";
import { buildAuthorQuery, summarizeAuthorWorks } from "./author-works-domain";
import { DEFAULT_EVALUATION_STANDARDS } from "@/lib/evaluation-standards";

test("作者查询显式覆盖全部历史，不触发大盘最新一天默认；上月按上海日期", () => {
  const all = buildAuthorQuery({ userId: "u", timeRange: "all" }, new Date("2026-10-30T00:00:00Z"));
  assert.equal(all.filters.startDate, "0001-01-01");
  assert.equal(all.filters.endDate, "9999-12-31");
  assert.equal(all.filters.userId, "u");
  assert.equal(all.sortField, "published_at");
  const last = buildAuthorQuery({ userId: "u", timeRange: "lastMonth" }, new Date("2026-01-01T00:00:00Z"));
  assert.equal(last.filters.startDate, "2025-12-01");
  assert.equal(last.filters.endDate, "2025-12-31");
});

test("画像含周期内所有作品，剔除未满24h/缺快照/缺播放；零播放保留，不以高播放冒充优质", () => {
  const videos = ["a", "b", "c", "d", "e"].map(id => ({ id, published_at: id === "e" ? "2026-10-29T23:00:00Z" : "2026-10-01T00:00:00Z" }));
  const data = {
    videos,
    snapshots: [
      { video_id: "a", play_count: 60000, completion_rate: 50 },
      { video_id: "b", play_count: 0, completion_rate: 80 },
      { video_id: "d", play_count: null, completion_rate: null },
      { video_id: "e", play_count: 90000, completion_rate: 90 },
    ],
    contentQualityByVideoId: { a: { overallGrade: "良" }, b: { overallGrade: "优" } },
    evaluationStandards: { ...DEFAULT_EVALUATION_STANDARDS, minPlayCount: 5000, completionRate: { good: 40, poor: 10 } },
  };
  const summary = summarizeAuthorWorks({ userId: "u", name: "作者" }, data as never, new Date("2026-10-30T00:00:00Z"));
  assert.equal(summary.totalWorksCount, 5);
  assert.equal(summary.averagePlayCount, 30000);
  assert.equal(summary.measuredWorksCount, 2);
  assert.equal(summary.completionRatePassCount, 1);
  assert.equal(summary.qualityWorksCount, 1);
  assert.equal(summarizeAuthorWorks({userId:"u",name:"作者"}, {...data,videos:[],snapshots:[]} as never).averagePlayCount, null);
});

test("真实复盘指标用百分数存储：17.2就是17.2%，不能再乘100或按小数拒绝", () => {
  const result = summarizeAuthorWorks({userId:"u",name:"作者"}, {
    videos:[{id:"v",published_at:"2026-10-01T00:00:00Z"}], snapshots:[{video_id:"v",play_count:20000,completion_rate:17.2}],
    contentQualityByVideoId:{}, evaluationStandards:{...DEFAULT_EVALUATION_STANDARDS,completionRate:{good:15,poor:5}}
  } as never, new Date("2026-10-30T00:00:00Z"));
  assert.equal(result.completionRatePassCount,1);
});

test("作者入口按账号归属解析ID和姓名，不串用提交人", async () => {
  const {getContentOwner} = await import("./content-owner");
  const video={user_id:"submitter",accounts:{profile_id:"owner"},profiles:{name:"提交人"}};
  assert.deepEqual(getContentOwner(video,{owner:"归属人"}),{id:"owner",name:"归属人"});
  assert.deepEqual(getContentOwner(video),{id:"owner",name:"账号归属人"});
  assert.deepEqual(getContentOwner({...video,accounts:{profile_id:null}}),{id:"submitter",name:"提交人"});
});
