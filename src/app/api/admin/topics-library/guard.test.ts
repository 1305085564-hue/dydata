import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ADMIN_TOPIC_LIBRARY_ROUTES = [
  "src/app/api/admin/topics-library/import/parse/route.ts",
  "src/app/api/admin/topics-library/import/confirm/route.ts",
  "src/app/api/admin/topics-library/toggle/route.ts",
  "src/app/api/admin/topics-library/evaluate/route.ts",
  "src/app/api/admin/content/topic-library-status/route.ts",
];

test("选题库管理接口必须经过 requireAdminActor 且要求 review_content 权限", () => {
  for (const relativePath of ADMIN_TOPIC_LIBRARY_ROUTES) {
    const source = readFileSync(join(process.cwd(), relativePath), "utf8");
    assert.match(
      source,
      /requireAdminActor\(\{\s*requiredPermission:\s*"review_content"\s*\}\)/,
      `${relativePath} 缺少 review_content 服务端鉴权`,
    );
  }
});

test("视频提交链路必须挂载干货自动入库钩子", () => {
  const source = readFileSync(join(process.cwd(), "src/app/api/video-submit/route.ts"), "utf8");
  assert.match(source, /ensureInternalLibraryEntry/);
});
