import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { RetentionBreakdownContent } from "@/components/admin/quality-tooltip-content";
import { contentQualityRules } from "@/lib/content-quality";
import type { ContentQualitySummary, WorkContentQuality } from "@/lib/collaboration/content-quality-contract";
import { DEFAULT_EVALUATION_STANDARDS, type EvaluationStandards } from "@/lib/evaluation-standards";
import type { OperatorRow, PersonDetailData, StaffRow, TalentRow, WorkGroupMemberRow, WorkGroupSummaryRow } from "@/lib/collaboration/types";
import { OperatorTab } from "./operator-tab";
import { PersonalCardWorks } from "./personal-card-works";
import { TalentTab } from "./talent-tab";
import { WorkGroupDetailView } from "./work-group-detail-view";
import { WorkGroupListTab } from "./work-group-list-tab";
import { WriterTab } from "./writer-tab";
import { qualityColumns, rateColumns, retentionDetailColumns } from "./collaboration-quality-hints";

const noop = () => {};

function extractCells(html: string): string[] {
  return [...html.matchAll(/<td\b[^>]*>[\s\S]*?<\/td>/g)].map((m) => m[0]);
}

function extractHeaders(html: string): string[] {
  return [...html.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
    m[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
  );
}

function colIndex(headers: string[], label: string): number {
  const idx = headers.indexOf(label);
  assert.notEqual(idx, -1, `找不到列头：${label}`);
  return idx;
}

function makeQuality(overrides: Partial<ContentQualitySummary> = {}): ContentQualitySummary {
  return {
    totalCount: 2,
    achievementSampleCount: 2,
    interactionSampleCount: 2,
    ratedCount: 2,
    unratedReasons: { unlinked: 0, pendingSnapshot: 0, invalidPlay: 0, missingMetrics: 0 },
    retentionAverages: {
      bounceRate2s: 20, // good (<= 25) -> 红
      completionRate5s: 45, // poor (<= 50) -> 绿
      avgPlayDuration: 40, // normal (30..50)
      avgPlayRatio: 15, // poor (< 20) -> 绿
      completionRate: 12, // good (>= 10) -> 红
    },
    avgInteractionAchievement: 110, // good (>= 100) -> 红
    avgContentAchievement: 55, // poor (<= 60) -> 绿
    overallGradeCounts: { excellent: 1, good: 0, fair: 1 },
    goodExcellentRate: 0.5,
    ...overrides,
  };
}

test("岗位主表（达人/文案/运营）：按 5,000 门槛标好红差绿，良优率/转粉率/产量不上色且不卡 3 篇", () => {
  const goodHighPlay: TalentRow = {
    userId: "u-high",
    name: "高播达人",
    accountCount: 1,
    reportCount: 2, // 少于 3 篇但条均 >= 5000，仍应标红绿
    followerConversionRate: 0.02, // 转粉率高但不上色
    interactionRate: 0.04, // >= 3.5% -> 红
    likeRate: 0.03,
    commentRate: 0.005,
    shareRate: 0.002,
    favoriteRate: 0.003,
    totalPlay: 20000,
    avgPlay: 10000,
    totalFollowerConvert: 400,
    accounts: [],
    writerQuality: { state: "ready", summary: makeQuality() },
  };
  const lowAvgPlay: TalentRow = {
    ...goodHighPlay,
    userId: "u-low",
    name: "低播达人",
    totalPlay: 8000,
    avgPlay: 4000, // < 5000 -> 降灰不上红绿
    interactionRate: 0.01,
    writerQuality: {
      state: "ready",
      summary: makeQuality({ avgInteractionAchievement: 40, avgContentAchievement: 120 }),
    },
  };

  const talentHtml = renderToStaticMarkup(
    <TalentTab
      talents={[goodHighPlay, lowAvgPlay]}
      evaluationStandards={DEFAULT_EVALUATION_STANDARDS}
      onSelectPerson={noop}
      onPrefetchPerson={noop}
    />,
  );

  const talentHeaders = extractHeaders(talentHtml);
  const rows = [...talentHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].slice(1).map((m) => m[1]);
  assert.equal(rows.length, 2);

  // 高播行（默认全展开：基础 + 互动四项 + 质量 + 留存五项）
  const highCells = extractCells(rows[0]);
  assert.doesNotMatch(highCells[colIndex(talentHeaders, "本月作品")], /text-status-/);
  assert.doesNotMatch(highCells[colIndex(talentHeaders, "总播放")], /text-status-/);
  assert.doesNotMatch(highCells[colIndex(talentHeaders, "条均播放")], /text-status-/);
  assert.doesNotMatch(highCells[colIndex(talentHeaders, "转粉率")], /text-status-/, "转粉率不上红绿");
  assert.match(highCells[colIndex(talentHeaders, "互动率")], /text-status-danger/, "互动率好标准标红");
  assert.match(highCells[colIndex(talentHeaders, "互动达成")], /text-status-danger/, "互动达成好标准标红（不卡 3 篇）");
  assert.match(highCells[colIndex(talentHeaders, "留存达成")], /text-status-success/, "留存达成差标准标绿（不卡 3 篇）");
  assert.doesNotMatch(highCells[colIndex(talentHeaders, "良优率")], /text-status-/, "良优率不上红绿");

  // 低播行（avgPlay=4000 < 5000）：互动率、互动达成、留存达成变灰，不上红绿
  const lowCells = extractCells(rows[1]);
  assert.match(lowCells[colIndex(talentHeaders, "互动率")], /text-\[#A8A29E\]/);
  assert.match(lowCells[colIndex(talentHeaders, "互动达成")], /text-\[#A8A29E\]/);
  assert.match(lowCells[colIndex(talentHeaders, "留存达成")], /text-\[#A8A29E\]/);
  assert.doesNotMatch(rows[1], /text-status-danger|text-status-success/);

  // 运营表：互动率按 5,000 门槛标绿，转粉率不上色
  const opRow: OperatorRow = {
    userId: "op-1",
    name: "张运营",
    reportCount: 4,
    followerConversionRate: 0.001,
    interactionRate: 0.015, // <= 2.1% -> 绿
    likeRate: null,
    commentRate: null,
    shareRate: null,
    favoriteRate: null,
    totalPlay: 40000,
    avgPlay: 10000,
    totalFollowerConvert: 40,
    accountCount: 1,
    operatedProfileCount: 1,
    accounts: [],
  };
  const opHtml = renderToStaticMarkup(
    <OperatorTab operators={[opRow]} evaluationStandards={DEFAULT_EVALUATION_STANDARDS} onSelectPerson={noop} />,
  );
  const opCells = extractCells(opHtml);
  assert.doesNotMatch(opCells[4], /text-status-/);
  assert.match(opCells[5], /text-status-success/);

  // 文案表：优条数不上红绿，互动达成/留存达成/互动率受自定义公司标准驱动
  const customStandards: EvaluationStandards = {
    ...DEFAULT_EVALUATION_STANDARDS,
    minPlayCount: 3000,
    targets: { interactionRate: 5, followerRate: 1 },
  };
  const writerRow: StaffRow = {
    userId: "w-1",
    name: "李文案",
    reportCount: 2,
    followerConversionRate: 0.01,
    interactionRate: 0.04, // 4% / 5% = 80% -> normal（不再是默认 3.5% 的红）
    likeRate: null,
    commentRate: null,
    shareRate: null,
    favoriteRate: null,
    certifiedByName: "管理员",
    isCertified: true,
    totalPlay: 7000,
    avgPlay: 3500, // 达到自定义 3000
    involvedAccounts: [],
    involvedAccountTotal: 0,
    recentWorks: [],
    works: [],
    writerQuality: {
      state: "ready",
      summary: makeQuality({ avgInteractionAchievement: 80, avgContentAchievement: 105 }),
    },
  };
  const writerHtml = renderToStaticMarkup(
    <WriterTab
      rows={[writerRow]}
      candidates={[]}
      canCertify={false}
      evaluationStandards={customStandards}
      onSelectPerson={noop}
      onPrefetchPerson={noop}
    />,
  );
  const writerHeaders = extractHeaders(writerHtml);
  const wCells = extractCells(writerHtml);
  assert.doesNotMatch(wCells[colIndex(writerHeaders, "互动率")], /text-status-/, "按自定义 5% 互动基准，4% 属普通不上色");
  assert.match(wCells[colIndex(writerHeaders, "留存达成")], /text-status-danger/, "达到自定义 3000 门槛且留存达成 105% 标红");
  assert.doesNotMatch(wCells[colIndex(writerHeaders, "优条数")], /text-status-/, "优条数不上红绿");
});

test("展开留存明细五项：按公司好差线好红差绿，低播放降灰", () => {
  type Row = { avgPlay: number; quality: { state: "ready"; summary: ContentQualitySummary } };
  const rowHigh: Row = { avgPlay: 8000, quality: { state: "ready", summary: makeQuality() } };
  const rowLow: Row = { avgPlay: 3000, quality: { state: "ready", summary: makeQuality() } };
  const cols = retentionDetailColumns<Row>((r) => r.quality, { standards: DEFAULT_EVALUATION_STANDARDS });

  assert.equal(cols[0].cellClassName?.(rowHigh), "text-status-danger", "2s跳出20%<=25% 标红");
  assert.equal(cols[1].cellClassName?.(rowHigh), "text-status-success", "5s完播45%<=50% 标绿");
  assert.equal(cols[2].cellClassName?.(rowHigh), "", "均播40s在30-50间 普通");
  assert.equal(cols[3].cellClassName?.(rowHigh), "text-status-success", "播放占比15%<20% 标绿");
  assert.equal(cols[4].cellClassName?.(rowHigh), "text-status-danger", "整体完播12%>=10% 标红");

  for (const col of cols) {
    assert.equal(col.cellClassName?.(rowLow), "text-[#A8A29E]");
  }
  assert.equal(rateColumns({ standards: DEFAULT_EVALUATION_STANDARDS }).length, 2);
  assert.equal(qualityColumns<Row>((r) => r.quality).length, 3);
});

test("小队视图（小队列表与小队详情含全队合计）：使用 2,000 播放门槛标红绿", () => {
  const agg = {
    reportCount: 4,
    snapshotCount: 4,
    totalPlay: 10000,
    avgPlay: 2500, // 介于 2000..5000：岗位表不上色，小队应正常上色
    followerConversionRate: 0.01,
    interactionRate: 0.04, // 红
    likeRate: null,
    commentRate: null,
    shareRate: null,
    favoriteRate: null,
  };
  const groupSummary: WorkGroupSummaryRow = {
    id: "wg-1",
    name: "文案一组",
    kind: "writer",
    teamId: "t-1",
    memberCount: 2,
    aggregate: agg,
    contentQuality: makeQuality(),
  };
  const lowGroupSummary: WorkGroupSummaryRow = {
    ...groupSummary,
    id: "wg-2",
    name: "低播小队",
    aggregate: { ...agg, avgPlay: 1999 }, // < 2000 -> 降灰不上红绿
  };

  const listHtml = renderToStaticMarkup(
    <WorkGroupListTab
      groups={[groupSummary, lowGroupSummary]}
      evaluationStandards={DEFAULT_EVALUATION_STANDARDS}
      onSelectGroup={noop}
    />,
  );
  const listHeaders = extractHeaders(listHtml);
  const listRows = [...listHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].slice(1).map((m) => m[1]);
  const g1Cells = extractCells(listRows[0]);
  const g2Cells = extractCells(listRows[1]);
  assert.match(g1Cells[colIndex(listHeaders, "互动率")], /text-status-danger/, "小队条均 2500 >= 2000，互动率标红");
  assert.match(g1Cells[colIndex(listHeaders, "互动达成")], /text-status-danger/, "小队条均 2500 >= 2000，互动达成标红");
  assert.match(g1Cells[colIndex(listHeaders, "留存达成")], /text-status-success/, "小队条均 2500 >= 2000，留存达成标绿");
  assert.match(g2Cells[colIndex(listHeaders, "互动率")], /text-\[#A8A29E\]/, "小队条均 < 2000，不上红绿");
  assert.doesNotMatch(listRows[1], /text-status-danger|text-status-success/);

  const m1: WorkGroupMemberRow = { userId: "u1", name: "甲", ...agg, contentQuality: makeQuality() };
  const m2: WorkGroupMemberRow = {
    userId: "u2",
    name: "乙",
    ...agg,
    avgPlay: 1500,
    contentQuality: makeQuality(),
  };
  const detailHtml = renderToStaticMarkup(
    <WorkGroupDetailView
      detail={{ summary: groupSummary, members: [m1, m2] }}
      evaluationStandards={DEFAULT_EVALUATION_STANDARDS}
      onBack={noop}
      onSelectPerson={noop}
    />,
  );
  const detailHeaders = extractHeaders(detailHtml);
  const detailRows = [...detailHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].slice(1).map((m) => m[1]);
  assert.equal(detailRows.length, 3); // 全队合计 + 2 名组员
  assert.match(extractCells(detailRows[0])[colIndex(detailHeaders, "互动率")], /text-status-danger/, "全队合计行条均 2500 标红");
  assert.match(extractCells(detailRows[1])[colIndex(detailHeaders, "互动达成")], /text-status-danger/, "小队成员条均 2500 标红");
  assert.match(extractCells(detailRows[2])[colIndex(detailHeaders, "互动达成")], /text-\[#A8A29E\]/, "小队成员条均 1500 降灰");
});

test("个人档案「本月作品」：>=5000 按好红差绿上色，<5000 变灰不上红绿", () => {
  const workHigh: WorkContentQuality = {
    topicKind: "review",
    snapshotPlayCount: 8000,
    interactionAchievement: 120, // 红
    interactionValue: 0.042,
    contentAchievement: 50, // 绿
    contentGrade: "普",
    overallGrade: "良",
    status: "rated",
  };
  const workLow: WorkContentQuality = {
    ...workHigh,
    snapshotPlayCount: 4999,
    overallGrade: "普",
  };
  const personData = {
    userId: "u1",
    name: "王文案",
    teamId: "t1",
    currentMonth: { writerCount: 2, editorCount: 0, operatorCount: 0 },
    operatorSummary: null,
    growthWorks: [],
    growthSummary: null,
    writerQuality: {
      state: "ready",
      rules: contentQualityRules(DEFAULT_EVALUATION_STANDARDS),
      monthSummary: makeQuality(),
      growthSummary: makeQuality(),
      monthWorks: [
        {
          reportId: "r-high",
          videoId: "v-high",
          reportDate: "2026-11-20",
          accountId: "a1",
          accountName: "测试号",
          title: "高播作品",
          playCount: 8000,
          interactionRate: 0.042,
          likeRate: 0.02,
          favoriteRate: 0.01,
          contentQuality: workHigh,
        },
        {
          reportId: "r-low",
          videoId: "v-low",
          reportDate: "2026-11-19",
          accountId: "a1",
          accountName: "测试号",
          title: "低播作品",
          playCount: 4999,
          interactionRate: 0.042,
          likeRate: 0.02,
          favoriteRate: 0.01,
          contentQuality: workLow,
        },
      ],
    },
    records: [],
  } as unknown as PersonDetailData;

  const html = renderToStaticMarkup(
    <PersonalCardWorks
      data={personData}
      activeTab="writers"
      evaluationStandards={DEFAULT_EVALUATION_STANDARDS}
      diagnosisContext={null}
    />,
  );
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].slice(1).map((m) => m[1]);
  assert.equal(rows.length, 2);

  // 列顺序：0=日期, 1=作品, 2=播放, 3=互动达成, 4=留存达成, 5=综合评级
  const highCells = extractCells(rows[0]);
  assert.match(highCells[3], /text-status-danger/, "高播作品互动达成标红");
  assert.match(highCells[4], /text-status-success/, "高播作品留存达成标绿");

  const lowCells = extractCells(rows[1]);
  assert.match(lowCells[3], /text-\[#A8A29E\]/, "低于 5000 作品互动达成降灰");
  assert.match(lowCells[4], /text-\[#A8A29E\]/, "低于 5000 作品留存达成降灰");
  assert.doesNotMatch(rows[1], /text-status-danger|text-status-success/);
});

test("留存明细悬停气泡统一为「好红、差绿」（修正此前好绿差红反色）", () => {
  const rules = contentQualityRules(DEFAULT_EVALUATION_STANDARDS);
  const quality: WorkContentQuality = {
    topicKind: "review",
    snapshotPlayCount: 10000,
    interactionAchievement: 100,
    contentAchievement: 90,
    contentGrade: "良",
    overallGrade: "良",
    status: "rated",
    retentionMetrics: {
      bounceRate2s: 20, // good -> 红
      completionRate5s: 40, // poor -> 绿
      avgPlayDuration: 40, // normal
      avgPlayRatio: 22, // normal
      completionRate: 15, // good -> 红
    },
  };
  const html = renderToStaticMarkup(<RetentionBreakdownContent quality={quality} rules={rules} />);
  const items = html.split(/(?=<div class="flex items-center justify-between gap-2 text-\[12px\] tabular-nums">)/);
  const bounce = items.find((s) => s.includes("2 秒跳出率")) ?? "";
  const completion5s = items.find((s) => s.includes("5 秒完播率")) ?? "";
  const avgDuration = items.find((s) => s.includes("均播时长")) ?? "";
  const completion = items.find((s) => s.includes("整体完播率")) ?? "";

  assert.match(bounce, /bg-status-danger/);
  assert.match(bounce, /text-status-danger/);
  assert.doesNotMatch(bounce, /status-success/);
  assert.match(completion5s, /bg-status-success/);
  assert.match(completion5s, /text-status-success/);
  assert.doesNotMatch(completion5s, /status-danger/);
  assert.doesNotMatch(avgDuration, /status-danger|status-success/);
  assert.match(completion, /bg-status-danger/);
  assert.match(completion, /text-status-danger/);
});
