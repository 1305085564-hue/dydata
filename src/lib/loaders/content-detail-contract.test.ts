import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const sharedBoundary = resolve(process.cwd(), "src/lib/loaders/content-detail.ts");
const contentContainer = resolve(process.cwd(), "src/app/(app)/admin/content/content-data-container.tsx");
const workVideoRoute = resolve(process.cwd(), "src/app/api/admin/collaboration/work-video/route-core.ts");

test("视频复盘详情由共享 loader 边界提供，两个入口不再直接依赖页面 loader", () => {
  const boundarySource = readFileSync(sharedBoundary, "utf8");
  const contentSource = readFileSync(contentContainer, "utf8");
  const workVideoSource = readFileSync(workVideoRoute, "utf8");

  assert.match(boundarySource, /loadAdminContentVideoDetail/);
  assert.match(contentSource, /loadAdminContentVideoDetail[\s\S]*@\/lib\/loaders\/content-detail/);
  assert.match(workVideoSource, /loadAdminContentVideoDetail[\s\S]*@\/lib\/loaders\/content-detail/);
});
