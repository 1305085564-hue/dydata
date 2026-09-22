import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { WorkGroupDetailView } from "./work-group-detail-view";
import { StaffHeaderRow } from "./staff-tab";
import { TalentHeaderRow } from "./talent-tab";
import { OperatorHeaderRow } from "./operator-tab";
import { Table, TableHeader } from "@/components/ui/table";
import type {
  OperatorRow,
  StaffRow,
  TalentRow,
  WorkGroupDetailView as WorkGroupDetailViewType,
} from "@/app/api/admin/collaboration/_shared";

/**
 * 组详情与岗位 Tab 的列一致性靠「同一份列头/行组件」保证，
 * 这里用真实渲染出的 DOM 做可观察断言：列头文本、列序、行单元格数都必须与岗位 Tab 同源。
 */

const noop = () => {};

const staffSort = {
  sortField: "reportCount",
  sortOrder: "desc" as const,
  onSort: noop,
  renderSortIcon: () => null,
};

function stripTags(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function tableHeaderLabels(html: string) {
  return [...html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((match) => stripTags(match[1]));
}

function bodyRowCellCounts(html: string) {
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((match) => match[1]);
  // 第一个 <tr> 是表头，其余是数据行（组综合 + 组员行）
  return rows.slice(1).map((row) => (row.match(/<td/g) ?? []).length);
}

function renderTabHeader(node: React.ReactElement) {
  return tableHeaderLabels(
    renderToStaticMarkup(<Table><TableHeader>{node}</TableHeader></Table>),
  );
}

function renderDetail(detail: WorkGroupDetailViewType) {
  return renderToStaticMarkup(
    <WorkGroupDetailView detail={detail} canManage onBack={noop} onSelectPerson={noop} />,
  );
}

function zeroStaff(userId: string, name: string, overrides: Partial<StaffRow> = {}): StaffRow {
  return {
    userId,
    name,
    reportCount: 0,
    effectiveCount: 0,
    excellentCount: 0,
    billingCount: null,
    certifiedByName: null,
    isCertified: false,
    totalPlay: 0,
    avgPlay: 0,
    selfHandledCount: 0,
    involvedAccounts: [],
    involvedAccountTotal: 0,
    recentWorks: [],
    works: [],
    ...overrides,
  };
}

function zeroTalent(userId: string, name: string, overrides: Partial<TalentRow> = {}): TalentRow {
  return {
    userId,
    name,
    accountCount: 0,
    reportCount: 0,
    effectiveCount: 0,
    excellentCount: 0,
    totalPlay: 0,
    avgPlay: 0,
    totalFollowerConvert: 0,
    hitCount: 0,
    selfHandledCount: 0,
    accounts: [],
    ...overrides,
  };
}

function zeroOperator(userId: string, name: string, overrides: Partial<OperatorRow> = {}): OperatorRow {
  return {
    userId,
    name,
    reportCount: 0,
    effectiveCount: 0,
    excellentCount: 0,
    totalPlay: 0,
    avgPlay: 0,
    totalFollowerConvert: 0,
    hitCount: 0,
    momChange: null,
    accountCount: 0,
    operatedProfileCount: 0,
    accounts: [],
    ...overrides,
  };
}

test("文案组详情列头与文案岗位 Tab 完全同源同序（含绩效条数、认证状态）", () => {
  const tabLabels = renderTabHeader(
    <StaffHeaderRow role="writer" sort={staffSort} />,
  );
  const detail = renderDetail({
    summary: {
      id: "wg-writer",
      name: "文案一组",
      kind: "writer",
      teamId: "team-1",
      memberCount: 1,
      aggregate: {
        kind: "writer",
        reportCount: 2,
        accountCount: 1,
        totalPlay: 31000,
        avgPlay: 15500,
        effectiveCount: 2,
        excellentCount: 1,
        billingCount: 4,
        certifiedMemberCount: 1,
      },
    },
    members: [zeroStaff("writer-1", "张文案")],
  });

  assert.deepEqual(tableHeaderLabels(detail), tabLabels, "组详情没有自己的列头，直接复用岗位 Tab 的");
  assert.deepEqual(tabLabels, [
    "",
    "姓名",
    "负责账号",
    "最近作品",
    "总播放",
    "条均播放",
    "本月篇数",
    "有效作品",
    "优秀作品",
    "绩效条数",
    "认证状态",
  ]);
});

test("达人组详情列头与达人岗位 Tab 完全同源同序", () => {
  const tabLabels = renderTabHeader(<TalentHeaderRow sort={staffSort} />);
  const detail = renderDetail({
    summary: {
      id: "wg-talent",
      name: "达人一组",
      kind: "talent",
      teamId: "team-1",
      memberCount: 1,
      aggregate: {
        kind: "talent",
        accountCount: 2,
        reportCount: 5,
        totalPlay: 20000,
        avgPlay: 4000,
        effectiveCount: 4,
        excellentCount: 1,
        hitCount: 1,
        selfHandledCount: 3,
      },
    },
    members: [zeroTalent("owner-1", "达人甲")],
  });

  assert.deepEqual(tableHeaderLabels(detail), tabLabels);
  assert.deepEqual(tabLabels, [
    "达人姓名",
    "账号数",
    "本月作品",
    "总播放",
    "条均播放",
    "有效作品",
    "优秀作品",
    "爆款作品",
    "独立完成",
    "名下账号",
  ]);
});

test("运营组详情列头与运营岗位 Tab 完全同源同序（环比仍在最后一列）", () => {
  const tabLabels = renderTabHeader(<OperatorHeaderRow sort={staffSort} />);
  const detail = renderDetail({
    summary: {
      id: "wg-operator",
      name: "运营一组",
      kind: "operator",
      teamId: "team-1",
      memberCount: 1,
      aggregate: {
        kind: "operator",
        accountCount: 1,
        reportCount: 3,
        totalPlay: 9000,
        avgPlay: 3000,
        totalFollowerConvert: 12,
        effectiveCount: 3,
        excellentCount: 0,
        hitCount: 0,
        momChange: 0.125,
      },
    },
    members: [zeroOperator("operator-1", "王运营")],
  });

  assert.deepEqual(tableHeaderLabels(detail), tabLabels);
  assert.deepEqual(tabLabels, [
    "",
    "运营姓名",
    "负责账号",
    "本月作品",
    "总播放",
    "条均播放",
    "导粉",
    "有效作品",
    "优秀作品",
    "爆款数",
    "环比",
  ]);
});

test("组详情的组综合行与组员行单元格数与列头逐列对齐（三种工种）", () => {
  const cases: Array<[WorkGroupDetailViewType, number]> = [
    [
      {
        summary: {
          id: "wg-writer",
          name: "文案一组",
          kind: "writer",
          teamId: "team-1",
          memberCount: 2,
          aggregate: {
            kind: "writer",
            reportCount: 2,
            accountCount: 1,
            totalPlay: 31000,
            avgPlay: 15500,
            effectiveCount: 2,
            excellentCount: 1,
            billingCount: null,
            certifiedMemberCount: 0,
          },
        },
        members: [zeroStaff("writer-1", "张文案"), zeroStaff("writer-2", "李文案")],
      },
      11,
    ],
    [
      {
        summary: {
          id: "wg-talent",
          name: "达人一组",
          kind: "talent",
          teamId: "team-1",
          memberCount: 2,
          aggregate: {
            kind: "talent",
            accountCount: 0,
            reportCount: 0,
            totalPlay: 0,
            avgPlay: 0,
            effectiveCount: 0,
            excellentCount: 0,
            hitCount: 0,
            selfHandledCount: 0,
          },
        },
        members: [zeroTalent("owner-1", "达人甲"), zeroTalent("owner-2", "达人乙")],
      },
      10,
    ],
    [
      {
        summary: {
          id: "wg-operator",
          name: "运营一组",
          kind: "operator",
          teamId: "team-1",
          memberCount: 2,
          aggregate: {
            kind: "operator",
            accountCount: 0,
            reportCount: 0,
            totalPlay: 0,
            avgPlay: 0,
            totalFollowerConvert: 0,
            effectiveCount: 0,
            excellentCount: 0,
            hitCount: 0,
            momChange: null,
          },
        },
        members: [zeroOperator("operator-1", "王运营"), zeroOperator("operator-2", "赵运营")],
      },
      11,
    ],
  ];

  for (const [detail, expectedColumns] of cases) {
    const html = renderDetail(detail);
    assert.equal(
      (html.match(/<th[\s>]/g) ?? []).length,
      expectedColumns,
      `${detail.summary.name} 列数应为 ${expectedColumns}`,
    );
    assert.deepEqual(
      bodyRowCellCounts(html),
      [expectedColumns, expectedColumns, expectedColumns],
      `${detail.summary.name} 的组综合行与组员行都必须与列头同宽`,
    );
  }
});

test("零产出组员照样出行：三种工种都不被统计口径吞掉，数值落 0 / —", () => {
  const writerHtml = renderDetail({
    summary: {
      id: "wg-writer",
      name: "文案一组",
      kind: "writer",
      teamId: "team-1",
      memberCount: 2,
      aggregate: {
        kind: "writer",
        reportCount: 0,
        accountCount: 0,
        totalPlay: 0,
        avgPlay: 0,
        effectiveCount: 0,
        excellentCount: 0,
        billingCount: null,
        certifiedMemberCount: 0,
      },
    },
    members: [zeroStaff("writer-1", "零产出甲"), zeroStaff("writer-2", "零产出乙", { isCertified: true, certifiedByName: "认证管理员", billingCount: 0 })],
  });

  assert.match(writerHtml, /零产出甲/);
  assert.match(writerHtml, /零产出乙/);
  assert.match(writerHtml, /未认证/);
  assert.match(writerHtml, /认证管理员认证/);
  assert.match(writerHtml, /0\/2 人已认证/, "组综合认证列按「已认证人数/编制人数」出");

  const talentHtml = renderDetail({
    summary: {
      id: "wg-talent",
      name: "达人一组",
      kind: "talent",
      teamId: "team-1",
      memberCount: 1,
      aggregate: {
        kind: "talent",
        accountCount: 0,
        reportCount: 0,
        totalPlay: 0,
        avgPlay: 0,
        effectiveCount: 0,
        excellentCount: 0,
        hitCount: 0,
        selfHandledCount: 0,
      },
    },
    members: [zeroTalent("owner-2", "闲置达人")],
  });
  assert.match(talentHtml, /闲置达人/);

  const operatorHtml = renderDetail({
    summary: {
      id: "wg-operator",
      name: "运营一组",
      kind: "operator",
      teamId: "team-1",
      memberCount: 1,
      aggregate: {
        kind: "operator",
        accountCount: 0,
        reportCount: 0,
        totalPlay: 0,
        avgPlay: 0,
        totalFollowerConvert: 0,
        effectiveCount: 0,
        excellentCount: 0,
        hitCount: 0,
        momChange: null,
      },
    },
    members: [zeroOperator("operator-2", "闲置运营")],
  });
  assert.match(operatorHtml, /闲置运营/);
  assert.doesNotMatch(operatorHtml, /NaN/);
});

test("组综合行仍为浅砂底 #F1F1F0 且数值直接取 aggregate（不在前端重算）", () => {
  const html = renderDetail({
    summary: {
      id: "wg-writer",
      name: "文案一组",
      kind: "writer",
      teamId: "team-1",
      memberCount: 2,
      aggregate: {
        kind: "writer",
        reportCount: 2,
        accountCount: 1,
        totalPlay: 31000,
        avgPlay: 15500,
        effectiveCount: 2,
        excellentCount: 1,
        billingCount: 4,
        certifiedMemberCount: 1,
      },
    },
    members: [zeroStaff("writer-1", "张文案"), zeroStaff("writer-2", "李文案")],
  });

  const summaryRow = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((match) => match[0])[1] ?? "";
  assert.match(summaryRow, /#F1F1F0/, "组综合行保持浅砂微气垫底");
  assert.match(summaryRow, /组综合/);
  assert.match(summaryRow, /全组合计/);
  assert.match(summaryRow, /3\.1万/, "组总播放取 aggregate.totalPlay");
  assert.match(summaryRow, /1\.6万/, "组条均播放取 aggregate.avgPlay，前端不重算");
  assert.match(summaryRow, /1\/2 人已认证/);

  // 组员行不掺组综合数值：张文案自身仍是 0
  const memberRow = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((match) => match[0])[2] ?? "";
  assert.match(memberRow, /张文案/);
  assert.doesNotMatch(memberRow, /3\.1万/);
});

test("组员行仍可整行点击开档案、键盘 Enter 可进档案，行内链接点击不误开档案", () => {
  const html = renderDetail({
    summary: {
      id: "wg-writer",
      name: "文案一组",
      kind: "writer",
      teamId: "team-1",
      memberCount: 1,
      aggregate: {
        kind: "writer",
        reportCount: 0,
        accountCount: 0,
        totalPlay: 0,
        avgPlay: 0,
        effectiveCount: 0,
        excellentCount: 0,
        billingCount: null,
        certifiedMemberCount: 0,
      },
    },
    members: [zeroStaff("writer-1", "张文案")],
  });

  const memberRow = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((match) => match[0])[2] ?? "";
  assert.match(memberRow, /role="button"/);
  assert.match(memberRow, /tabindex="0"/i);
  assert.match(memberRow, /aria-label="查看张文案的个人档案"/);
});

test("空小队显示空态而不是空表；可管理时给出调配入口文案", () => {
  const html = renderDetail({
    summary: {
      id: "wg-empty",
      name: "文案二组",
      kind: "writer",
      teamId: "team-1",
      memberCount: 0,
      aggregate: {
        kind: "writer",
        reportCount: 0,
        accountCount: 0,
        totalPlay: 0,
        avgPlay: 0,
        effectiveCount: 0,
        excellentCount: 0,
        billingCount: null,
        certifiedMemberCount: 0,
      },
    },
    members: [],
  });

  assert.match(html, /该小队当前暂无成员/);
  assert.match(html, /调配本组编制/);
  assert.doesNotMatch(html, /组综合/);
});
