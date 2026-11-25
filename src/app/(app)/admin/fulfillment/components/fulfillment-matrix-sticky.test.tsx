import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { OverflowFreezeTableCard } from "@/components/ui/overflow-freeze-table-card";
import { FulfillmentMatrixRoster } from "./fulfillment-matrix-roster";

test("FulfillmentMatrixRoster 使用粘性顶部表头与同步横滚正文，避免双层竖向小滚动框", () => {
  const html = renderToStaticMarkup(
    <FulfillmentMatrixRoster
      year={2026}
      month={11}
      today="2026-11-25"
      sortDir="desc"
      emptyText="暂无成员"
      onCellClick={() => {}}
      members={[
        {
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
        },
      ]}
    />,
  );

  assert.match(html, /data-slot="fulfillment-sticky-header"[^>]*class="[^"]*sticky top-\[var\(--app-top-offset,64px\)\]/);
  assert.match(html, /data-slot="fulfillment-roster-body"[^>]*class="[^"]*overflow-x-auto/);
  assert.doesNotMatch(html, /data-slot="fulfillment-roster-body"[^>]*max-h-/);
  const colgroupMatches = html.match(/<colgroup>/g) ?? [];
  assert.equal(colgroupMatches.length, 2, "表头与表体应共用同款 colgroup 保持列宽精确对齐");
});

test("OverflowFreezeTableCard 默认未溢出时不打 data-overflow-x 标记", () => {
  const html = renderToStaticMarkup(
    <OverflowFreezeTableCard freezeFirstCol>
      <table>
        <tbody>
          <tr>
            <td>作品标题</td>
          </tr>
        </tbody>
      </table>
    </OverflowFreezeTableCard>,
  );
  assert.doesNotMatch(html, /data-overflow-x="true"/);
});
