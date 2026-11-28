import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BreakdownWorksSection } from "./BreakdownWorksSection";
import { formatPostSubmitInterval } from "@/lib/command-hub/domain/workbench-rules";
import { SubmissionRule } from "@/app/(app)/admin/caliber/submission-rule";

for (const timestamp of ["2026-11-26T16:30:00Z", "2026-11-26T23:59:00Z", "2026-11-27T00:00:00Z"]) {
  test(`20：核查卡和选题作品均按上海发布日显示 ${timestamp}`, () => {
    assert.equal(formatPostSubmitInterval({ elapsed_hours: null, published_at: timestamp, uploaded_at: "2026-11-27T17:00:00Z", business_date: undefined }), "发布 2026-11-27 → 上传 2026-11-28");
    const html = renderToStaticMarkup(createElement(BreakdownWorksSection, {
      worksQuery: { page: 1, sort: "best" }, loadWorksPage: async () => {}, worksError: null, worksLoading: false,
      activeWorks: { items: [{ id: "work", videoTitle: "作品", content: null, playCount: 100, publishedAt: timestamp, uploadedAt: "2026-11-28T00:00:00Z", userId: "author", displayName: "作者", contentQuality: null }], similarReferences: [], summary: null, pagination: { page: 1, pageSize: 20, totalItems: 1 } },
      worksTotalItems: 1, canReviewContent: false,
    }));
    assert.match(html, /发布日 2026-11-27/);
  });
}

test("21：口径页呈现现行先入库后核查与无效不计优规则", () => {
  const html = renderToStaticMarkup(createElement(SubmissionRule));
  assert.match(html, /超过 72 小时/);
  assert.match(html, /手工填写或修改/);
  assert.match(html, /直接入库/);
  assert.match(html, /事后核查判为无效的作品不计优结算/);
  assert.doesNotMatch(html, /不能直接交|先申请补交/);
});
