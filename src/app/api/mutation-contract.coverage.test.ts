import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const API_ROOT = path.resolve(process.cwd(), "src/app/api");

// This is a route inventory, not an implementation-string assertion. The guard
// only discovers route files and their exported HTTP method shape; the contract
// behavior tests call the exported handlers directly.
const CONTRACT_ROUTES = [
  "admin/ai-config/check-dependencies/route.ts",
  "admin/ai-config/route.ts",
  "admin/ai-config/sync-models/route.ts",
  "admin/collaboration/attribution/route.ts",
  "admin/collaboration/writer-certification/route.ts",
  "admin/content/[videoId]/review-status/route.ts",
  "admin/content/topic-library-status/route.ts",
  "admin/content-analysis/route.ts",
  "admin/execute-tool/route.ts",
  "admin/fulfillment/appeal/reopen/route.ts",
  "admin/fulfillment/appeals/resume/route.ts",
  "admin/fulfillment/appeals/route.ts",
  "admin/fulfillment/bulk-mark/route.ts",
  "admin/fulfillment/mark/route.ts",
  "admin/fulfillment/remove/route.ts",
  "admin/member-ai-suggestion/route.ts",
  "admin/system/settings/route.ts",
  "admin/topics-library/evaluate/route.ts",
  "admin/topics-library/feishu-url/route.ts",
  "admin/topics-library/import/confirm/route.ts",
  "admin/topics-library/import/parse/route.ts",
  "admin/topics-library/toggle/route.ts",
  "admin/video-assets/[videoId]/route.ts",
  "admin/videos/[videoId]/lifecycle/route.ts",
  "dashboard/sample-quality-check/route.ts",
  "exemptions/apply/route.ts",
  "exemptions/permanent/route.ts",
  "exemptions/reopen/route.ts",
  "exemptions/review/route.ts",
  "group-mode/enter/route.ts",
  "group-mode/exit/route.ts",
  "notifications/[id]/done/route.ts",
  "notifications/[id]/read/route.ts",
  "ocr-screenshot/route.ts",
  "permission-requests/apply/route.ts",
  "submission-screenshots/route.ts",
  "topics/sub-topics/[id]/claim/route.ts",
  "topics/sub-topics/[id]/return/route.ts",
  "topics/sub-topics/[id]/route.ts",
  "topics/sub-topics/[id]/start-scripting/route.ts",
  "topics/sub-topics/route.ts",
  "usage-events/route.ts",
  "video-submit/route.ts",
] as const;

const EXEMPTIONS = {
  "admin/fulfillment/appeal/handle/route.ts": "样板区路由：派令明确只读，不在本批改动",
  "feishu/event/route.ts": "外部 webhook：请求签名与重试语义不适用统一页面写入契约",
} as const;

type Method = "POST" | "PUT" | "PATCH" | "DELETE";

function routeFiles(dir: string, prefix = ""): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry);
    const relativePath = path.join(prefix, entry);
    if (statSync(fullPath).isDirectory()) return routeFiles(fullPath, relativePath);
    return entry === "route.ts" ? [relativePath.split(path.sep).join("/")] : [];
  });
}

function exportedMethods(relativePath: string): Method[] {
  const source = readFileSync(path.join(API_ROOT, relativePath), "utf8");
  const methods: Method[] = [];
  for (const method of ["POST", "PUT", "PATCH", "DELETE"] as const) {
    if (new RegExp(`export\\s+(?:async\\s+)?(?:function|const)\\s+${method}\\b`).test(source)) methods.push(method);
  }
  return methods;
}

test("契约覆盖守卫：每个写入路由都在统一出口清单或显式豁免中", () => {
  const discovered = routeFiles(API_ROOT).filter((relativePath) => exportedMethods(relativePath).length > 0).sort();
  const expected = [...CONTRACT_ROUTES, ...Object.keys(EXEMPTIONS)].sort();
  assert.deepEqual(discovered, expected, "新增或遗漏写入路由：请补统一契约接入，或登记带理由的豁免");

  for (const relativePath of CONTRACT_ROUTES) {
    assert.ok(exportedMethods(relativePath).length > 0, `${relativePath} 必须导出写入 handler`);
  }
  for (const [relativePath, reason] of Object.entries(EXEMPTIONS)) {
    assert.ok(reason.length > 0, `${relativePath} 的豁免必须写明理由`);
    assert.ok(exportedMethods(relativePath).length > 0, `${relativePath} 豁免项仍须保留写入 handler`);
  }
});
