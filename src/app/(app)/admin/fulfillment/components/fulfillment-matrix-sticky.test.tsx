import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import test from "node:test";
import { OverflowFreezeTableCard } from "@/components/ui/overflow-freeze-table-card";
import { FakeElement, FakeEvent, FakeMouseEvent, setupDomTestEnv } from "@/lib/testing/dom-harness";
import { FulfillmentMatrixRoster } from "./fulfillment-matrix-roster";

function makeMember() {
  return {
    userId: "u1",
    userName: "测试成员",
    teamId: "t1",
    teamName: "内容组",
    publishedCount: 10,
    requiredCount: 12,
    totalDays: 30,
    publishedDays: 10,
    absentDays: 0,
    unconfirmedDays: 2,
    remainingCount: 2,
    fulfillmentRate: 83,
    leaveDays: 0,
    waivedDays: 0,
    consecutiveMissing: 0,
    days: {},
  };
}

test("OverflowFreezeTableCard 在不溢出与溢出两种容器下仅于横向溢出时标记并启用首列冻结", async () => {
  const env = setupDomTestEnv();

  const renderSampleTable = () => (
    <OverflowFreezeTableCard freezeFirstCol>
      <table className="w-full min-w-[520px] table-fixed">
        <thead>
          <tr>
            <th>账号 / 作品标题</th>
            <th>日期</th>
            <th>播放量</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>测试作品</td>
            <td>2026-11-25</td>
            <td>1.2万</td>
          </tr>
        </tbody>
      </table>
    </OverflowFreezeTableCard>
  );

  // 1) 不溢出容器（宽屏 800px 放得下 520px 表格）
  const wideMount = await env.mount(renderSampleTable(), (host) => {
    const origAppend = host.appendChild.bind(host);
    host.appendChild = (child) => {
      const appended = origAppend(child);
      if (child instanceof FakeElement) {
        child.clientWidth = 800;
        child.scrollWidth = 520;
      }
      return appended;
    };
  });

  // 2) 溢出容器（窄屏 360px 放不下 520px 表格）
  const narrowMount = await env.mount(renderSampleTable(), (host) => {
    const origAppend = host.appendChild.bind(host);
    host.appendChild = (child) => {
      const appended = origAppend(child);
      if (child instanceof FakeElement) {
        child.clientWidth = 360;
        child.scrollWidth = 520;
      }
      return appended;
    };
  });

  try {
    const wideCard = wideMount.container.firstElementChild;
    const narrowCard = narrowMount.container.firstElementChild;
    assert.ok(wideCard && narrowCard);

    assert.equal(wideCard.getAttribute("data-overflow-x"), null, "未溢出容器不应打 data-overflow-x 标记");
    assert.equal(narrowCard.getAttribute("data-overflow-x"), "true", "溢出容器应标记 data-overflow-x=true");

    // 冻结样式仅通过 data-overflow-x=true 条件选择器激活，宽屏不强行 sticky
    assert.match(narrowCard.className, /\[&\[data-overflow-x=true\]_th:first-child\]:sticky/);
    assert.match(narrowCard.className, /\[&\[data-overflow-x=true\]_td:first-child\]:sticky/);
    assert.match(narrowCard.className, /\[&\[data-overflow-x=true\]_td:first-child\]:bg-white/);

    // 3) 动态缩放：宽容器缩窄后触发 ResizeObserver，自动冻结；重新放宽后解除冻结
    wideCard.clientWidth = 360;
    await act(async () => {
      env.triggerResizeObserver(wideCard);
    });
    assert.equal(wideCard.getAttribute("data-overflow-x"), "true", "容器变窄溢出后应开启首列冻结");

    wideCard.clientWidth = 800;
    await act(async () => {
      env.dispatchWindowEvent(new FakeEvent("resize"));
    });
    assert.equal(wideCard.getAttribute("data-overflow-x"), null, "容器恢复宽屏后应撤除首列冻结");

    // 4) 成员主页两张表（代表作 / 异常作品）均接入 OverflowFreezeTableCard freezeFirstCol
    const profileSrc = readFileSync(resolve(process.cwd(), "src/app/(app)/people/[userId]/page.tsx"), "utf8");
    const freezeUsages = profileSrc.match(/<OverflowFreezeTableCard\s+freezeFirstCol>/g) ?? [];
    assert.equal(freezeUsages.length, 2, "成员主页代表作表与异常作品表均应使用 OverflowFreezeTableCard freezeFirstCol");
  } finally {
    await wideMount.unmount();
    await narrowMount.unmount();
    env.cleanup();
  }
});

test("FulfillmentMatrixRoster 真实渲染粘性表头、同步横滚并响应排序点击", async () => {
  const env = setupDomTestEnv();
  const sortChanges: Array<"asc" | "desc"> = [];

  const { container, unmount } = await env.mount(
    <FulfillmentMatrixRoster
      year={2026}
      month={11}
      today="2026-11-25"
      sortDir="desc"
      onSortDirChange={(dir) => sortChanges.push(dir)}
      emptyText="暂无成员"
      onCellClick={() => {}}
      members={[makeMember()]}
    />,
  );

  try {
    const stickyHeader = container.querySelector('[data-slot="fulfillment-sticky-header"]');
    const rosterBody = container.querySelector('[data-slot="fulfillment-roster-body"]');
    assert.ok(stickyHeader && rosterBody);

    assert.match(stickyHeader.className, /\bsticky\b/);
    assert.match(stickyHeader.className, /top-\[var\(--app-top-offset,64px\)\]/);
    assert.match(rosterBody.className, /\boverflow-x-auto\b/);
    assert.doesNotMatch(rosterBody.className, /max-h-/);
    assert.equal(container.querySelectorAll("colgroup").length, 2, "表头与表体应共用同款 colgroup 对齐列宽");

    // 滚动表体应同步表头 scrollLeft，刷新帧后再滚动表头应同步表体 scrollLeft
    rosterBody.scrollLeft = 180;
    await act(async () => {
      rosterBody.dispatchEvent(new FakeEvent("scroll"));
    });
    assert.equal(stickyHeader.scrollLeft, 180);

    env.flushAnimationFrames();
    stickyHeader.scrollLeft = 45;
    await act(async () => {
      stickyHeader.dispatchEvent(new FakeEvent("scroll"));
    });
    assert.equal(rosterBody.scrollLeft, 45);

    // 点击「本月」排序按钮应翻转排序方向
    const sortBtn = stickyHeader.querySelector("button");
    assert.ok(sortBtn);
    await act(async () => {
      sortBtn.dispatchEvent(new FakeMouseEvent("click"));
    });
    assert.deepEqual(sortChanges, ["asc"]);
  } finally {
    await unmount();
    env.cleanup();
  }
});
