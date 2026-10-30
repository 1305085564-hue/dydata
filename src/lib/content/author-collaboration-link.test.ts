import assert from "node:assert/strict";
import test from "node:test";
import { buildAuthorCollaborationUrl } from "./author-collaboration-link";

const now = new Date("2026-10-31T16:01:00Z");
test("文案作者直达 writers，缺发布日期时以 report_date 选最近作品及月份，不看 created_at", () => {
  const url = buildAuthorCollaborationUrl("author", [
    { id: "old", authorRole: "writer", published_at: null, report_date: "2026-08-31", created_at: "2026-12-01" },
    { id: "new", authorRole: "writer", published_at: null, report_date: "2026-09-03", created_at: "2026-01-01" },
  ], now);
  const params = new URL(url!, "http://localhost").searchParams;
  assert.equal(params.get("tab"), "writers");
  assert.equal(params.get("month"), "9");
  assert.equal(params.get("year"), "2026");
  assert.equal(params.get("videoId"), "new");
});
test("发布日优先并按上海自然日跨月；四岗位明确映射", () => {
  for (const [role, tab] of Object.entries({ talent: "talents", writer: "writers", editor: "editors", operator: "operators" })) {
    const url = buildAuthorCollaborationUrl("author", [{ id: "v", authorRole: role, published_at: "2026-09-30T16:01:00Z", report_date: "2026-08-01" }], now);
    const params = new URL(url!, "http://localhost").searchParams;
    assert.equal(params.get("tab"), tab);
    assert.equal(params.get("month"), "10");
  }
});
test("岗位缺失/未知时隐藏入口，不猜达人；无日期才取上海当前月", () => {
  for (const authorRole of [null, undefined, "admin"]) {
    assert.equal(buildAuthorCollaborationUrl("author", [{ id: "v", authorRole }], now), null);
  }
  const url = buildAuthorCollaborationUrl("author", [{ id: "v", authorRole: "editor", published_at: "invalid", report_date: null }], now);
  assert.equal(new URL(url!, "http://localhost").searchParams.get("month"), "11");
  const fallback = buildAuthorCollaborationUrl("author", [{ id: "v", authorRole: "writer", published_at: "invalid", report_date: "2026-09-12" }], now);
  assert.equal(new URL(fallback!, "http://localhost").searchParams.get("month"), "9");
});
