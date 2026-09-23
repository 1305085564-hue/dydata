import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { WorkGroupListTab } from "./work-group-list-tab";
import type { WorkGroupSummaryRow } from "@/app/api/admin/collaboration/_shared";

/**
 * 小队列表用真实渲染出的 DOM 断言列头、类型徽章、人数与口径脚注。
 * 取代原先只 grep「文案 / 达人 / 人数」这类宽泛词的做法——那些词出现在注释或描述句里
 * 也会让断言通过，删掉表格照样绿。
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
      favoriteRate: null,
    },
    ...overrides,
  };
}

function renderList(groups: WorkGroupSummaryRow[], canManage = false) {
  return renderToStaticMarkup(
    <WorkGroupListTab groups={groups} canManage={canManage} onSelectGroup={noop} />,
  );
}

test("列表列头为小队名称 + 人数 + 与复盘抽屉同源的绩效列", () => {
  const html = renderList([group()]);

  assert.deepEqual(tableHeaderLabels(html), [
    "小队名称",
    "人数",
    "作品数",
    "总播放",
    "条均播放",
    "转粉率",
    "互动率",
    "点赞率",
    "收藏率",
    "操作",
  ]);
});

test("每行渲染组名、类型徽章与人数，徽章文案按工种取值", () => {
  const html = renderList([
    group({ id: "wg-w", name: "文案一组", kind: "writer", memberCount: 3 }),
    group({ id: "wg-t", name: "达人一组", kind: "talent", memberCount: 1 }),
    group({ id: "wg-o", name: "运营一组", kind: "operator", memberCount: 2 }),
  ]);

  const text = stripTags(html);
  assert.ok(text.includes("文案一组") && text.includes("达人一组") && text.includes("运营一组"));
  assert.ok(text.includes("3 人") && text.includes("1 人") && text.includes("2 人"));

  // 三个工种徽章都要渲染出中文岗位名（不是 writer / talent / operator）
  for (const label of ["文案", "达人", "运营"]) {
    assert.ok(html.includes(`>${label}</span>`), `类型徽章缺少「${label}」`);
  }
  assert.equal(html.includes("writer"), false, "不把英文代号渲染给用户");
});

test("绩效列按数值格式化：比率保留 1 位小数，播放为 0 的比率显示 —", () => {
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
        favoriteRate: 750 / 60000,
      },
    }),
  ]);

  const text = stripTags(html);
  assert.ok(text.includes("6.0万"), "总播放 60000 格式化为 6.0万");
  assert.ok(text.includes("3.0万"), "条均 30000 格式化为 3.0万");
  assert.ok(text.includes("1.2%"), "转粉率 700/60000 ≈ 1.2%");
  assert.ok(text.includes("4.5%"), "互动率 2700/60000 = 4.5%");
  assert.ok(text.includes("2.5%"), "点赞率 1500/60000 = 2.5%");
  assert.ok(text.includes("1.3%"), "收藏率 750/60000 = 1.25% 保留 1 位小数");
});

test("无快照的组：播放为 0、四个比率显示 —，不显示 0%", () => {
  const html = renderList([group({ memberCount: 2 })]);
  const text = stripTags(html);

  assert.equal(text.includes("0.0%"), false, "没有快照时不得显示 0.0%");
  assert.equal((text.match(/—/g) ?? []).length, 4, "转粉率/互动率/点赞率/收藏率四个空值用 — 兜底");
  assert.ok(text.includes("0 0"), "总播放与条均如实显示 0，不伪装成 —");
});

test("行可键盘进入详情，且不牺牲表格语义，并带口径脚注", () => {
  const html = renderList([group({ name: "文案一组" })]);

  // 键盘可达性靠行内的真按钮，不靠把 <tr> 冒充 button：
  // <tr role="button"> 会让读屏丢掉 row 语义与列头关联，整行只剩一个光秃秃的按钮名。
  assert.match(
    html,
    /<button[^>]*aria-label="进入文案一组小队详情"/,
    "进入详情是真正的 button，可键盘聚焦并用 Enter 触发",
  );
  assert.equal(html.includes('role="button"'), false, "不为整行 <tr> 添加 button 角色");
  assert.match(html, /<tr[^>]*cursor-pointer/, "整行仍可点击进入，鼠标体验不变");
  assert.ok(
    html.includes("与视频复盘抽屉同源"),
    "表格下方有口径说明，避免把未同步作品读成 0 播放",
  );
});

test("空态与未就绪态不出表格，文案随权限变化", () => {
  const notReady = renderToStaticMarkup(
    <WorkGroupListTab groups={[]} ready={false} onSelectGroup={noop} />,
  );
  assert.ok(notReady.includes("工种小队功能准备就绪中"));
  assert.equal(notReady.includes("<table"), false, "未就绪时不出表格");

  const emptyReadonly = renderList([]);
  assert.ok(emptyReadonly.includes("当前团队尚未建立工种小队"), "只读用户看到联系负责人的文案");

  const emptyManageable = renderList([], true);
  assert.ok(emptyManageable.includes("点击上方「管理小队」按钮"), "可管理用户看到新建引导");
  assert.equal(emptyManageable.includes("<table"), false, "没有小队时不出表格");
});
