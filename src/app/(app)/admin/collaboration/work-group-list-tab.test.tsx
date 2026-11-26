import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { WorkGroupListTab } from "./work-group-list-tab";
import type { WorkGroupSummaryRow } from "@/lib/collaboration/domain/types";

/**
 * 小队列表用真实渲染出的 DOM 断言：列头、小队名下的工种与人数、数值格式、键盘可达、空态。
 * 和四张岗位表同一套表格，列名、口径一致。
 */

const noop = () => {};

function stripTags(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function tableHeaderLabels(html: string) {
  return [...html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((match) => stripTags(match[1]));
}

function group(overrides: Partial<WorkGroupSummaryRow> = {}): WorkGroupSummaryRow {
  return {
    id: "wg-1",
    name: "文案一组",
    kind: "writer",
    teamId: "team-1",
    memberCount: 0,
    aggregate: {
      reportCount: 0,
      snapshotCount: 0,
      totalPlay: 0,
      avgPlay: 0,
      followerConversionRate: null,
      interactionRate: null,
      likeRate: null,
      commentRate: null,
      shareRate: null,
      favoriteRate: null,
    },
    contentQuality: null,
    ...overrides,
  };
}

function renderList(groups: WorkGroupSummaryRow[], canManage = false) {
  return renderToStaticMarkup(
    <WorkGroupListTab groups={groups} canManage={canManage} onSelectGroup={noop} />,
  );
}

test("列表列头：默认全展开（运营小队含基础与互动明细 10 列，不出评级列）", () => {
  const html = renderList([group({ kind: "operator" })]);
  assert.deepEqual(tableHeaderLabels(html), [
    "小队",
    "本月作品",
    "总播放",
    "条均播放",
    "转粉率",
    "互动率",
    "点赞率",
    "评论率",
    "分享率",
    "收藏率",
  ]);
});

test("小队名下一行灰字写工种与人数，不用英文代号", () => {
  const html = renderList([
    group({ id: "wg-w", name: "文案一组", kind: "writer", memberCount: 3 }),
    group({ id: "wg-t", name: "达人一组", kind: "talent", memberCount: 1 }),
    group({ id: "wg-o", name: "运营一组", kind: "operator", memberCount: 2 }),
  ]);
  const text = stripTags(html);
  assert.ok(text.includes("文案小队 · 3 人"));
  assert.ok(text.includes("达人小队 · 1 人"));
  assert.ok(text.includes("运营小队 · 2 人"));
  assert.equal(html.includes("writer"), false, "不把英文代号渲染给用户");
});

test("绩效列按数值格式化：比率保留 1 位小数", () => {
  const html = renderList([
    group({
      aggregate: {
        reportCount: 3,
        snapshotCount: 2,
        totalPlay: 60000,
        avgPlay: 30000,
        followerConversionRate: 700 / 60000,
        interactionRate: 2700 / 60000,
        likeRate: 1500 / 60000,
        commentRate: 300 / 60000,
        shareRate: 150 / 60000,
        favoriteRate: 750 / 60000,
      },
    }),
  ]);
  const text = stripTags(html);
  assert.ok(text.includes("6.0万"), "总播放 60000 格式化为 6.0万");
  assert.ok(text.includes("3.0万"), "条均 30000 格式化为 3.0万");
  assert.ok(text.includes("1.2%"), "转粉率 700/60000 ≈ 1.2%");
  assert.ok(text.includes("4.5%"), "互动率 2700/60000 = 4.5%");
});

test("无快照的组：比率列显示 —，不显示 0.0%", () => {
  const html = renderList([group({ memberCount: 2, kind: "operator" })]);
  const table = html.slice(html.indexOf("<table"), html.indexOf("</table>"));
  assert.equal(table.includes("0.0%"), false, "没有快照时不得显示 0.0%");
  assert.equal((stripTags(table).match(/—/g) ?? []).length, 6, "转粉率/互动率及四项互动明细空值用 — 兜底");
});

test("进入详情靠名字格里的真按钮，整行不冒充 button，表下不压脚注", () => {
  const html = renderList([group({ name: "文案一组" })]);
  assert.match(html, /<button[^>]*aria-label="进入文案一组小队详情"/);
  assert.equal(html.includes('role="button"'), false, "不为整行 <tr> 添加 button 角色");
  assert.match(html, /<tr[^>]*cursor-pointer/, "整行仍可点击进入");
  assert.equal(html.includes("与数据复盘抽屉同源"), false, "口径收进列头悬停，不在表下压脚注");
});

test("空态与未就绪态不出表格，文案随权限变化", () => {
  const notReady = renderToStaticMarkup(<WorkGroupListTab groups={[]} ready={false} onSelectGroup={noop} />);
  assert.ok(notReady.includes("小队功能还在上线中"));
  assert.equal(notReady.includes("<table"), false, "未就绪时不出表格");

  const emptyReadonly = renderList([]);
  assert.ok(emptyReadonly.includes("团队负责人建好小队后"), "只读用户看到等负责人的说明");

  const emptyManageable = renderList([], true);
  assert.ok(emptyManageable.includes("点右上角「管理小队」"), "可管理用户看到新建引导");
  assert.equal(emptyManageable.includes("<table"), false, "没有小队时不出表格");
});

test("文案小队含质量数据时：默认全展开 18 列（含互动明细、评级、留存明细），运营小队那一行写 —", () => {
  const writerWithQuality = group({
    id: "wg-w",
    name: "文案一组",
    kind: "writer",
    contentQuality: {
      totalCount: 10,
      achievementSampleCount: 8,
      interactionSampleCount: 9,
      ratedCount: 8,
      goodExcellentRate: 0.75,
      overallGradeCounts: { excellent: 3, good: 3, fair: 1 },
      unratedReasons: {
        unlinked: 1,
        pendingSnapshot: 1,
        invalidPlay: 0,
        missingMetrics: 0,
        topicUnavailable: 0,
      },
      avgInteractionAchievement: 90,
      avgContentAchievement: 87.5,
      retentionAverages: null,
    },
  });

  const html = renderList([writerWithQuality, group({ id: "wg-o", name: "运营一组", kind: "operator" })]);
  assert.deepEqual(tableHeaderLabels(html), [
    "小队",
    "本月作品",
    "总播放",
    "条均播放",
    "转粉率",
    "互动率",
    "点赞率",
    "评论率",
    "分享率",
    "收藏率",
    "互动达成",
    "留存达成",
    "良优率",
    "2秒跳出率",
    "5秒完播率",
    "均播时长",
    "播放占比",
    "整体完播率",
  ]);
  const text = stripTags(html);
  assert.ok(text.includes("90%"));
  assert.ok(text.includes("88%"));
  assert.ok(text.includes("75%"));
});
