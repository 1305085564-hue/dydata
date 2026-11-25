import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/** 权限范围由统一 scope resolver 提供，当前页签 loader 必须完整接收并执行。 */
const containerSource = readFileSync(
  new URL("./collaboration-data-container.tsx", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const loaderSource = readFileSync(
  new URL("../../../../lib/collaboration/data/workbench-loader.ts", import.meta.url),
  "utf8",
);

test("容器把统一解析后的可见范围交给当前页签 loader", () => {
  assert.match(containerSource, /resolveCollaborationScope\(supabase, context\.scope\)/);
  assert.match(containerSource, /visibleUserIds: resolution\.visibleUserIds/);
  assert.match(containerSource, /activeVisibleUserIds: context\.scope\.activeVisibleUserIds/);
  assert.match(containerSource, /restrictToSelf,/);
  assert.match(containerSource, /userId: context\.scope\.userId/);
  assert.match(loaderSource, /const targetUser = \(userId: string\) => !input\.restrictToSelf \|\| userId === input\.userId/);
  assert.match(loaderSource, /\.filter\(\(row\) => targetUser\(row\.userId\)\)/);
});

test("认证候选只在有权限的文案页签加载，候选查询失败不拖垮其他数据", () => {
  assert.match(pageSource, /isOwnerOrTeamAdmin=\{permissionInfo\.companyRole === "company_owner" \|\| permissionInfo\.companyRole === "admin"\}/);
  assert.match(loaderSource, /if \(input\.tab === "writers"\)[\s\S]*?if \(input\.canLoadWriterCandidates && input\.supabase\)/);
  assert.match(loaderSource, /\(input\.writerCandidateLoader \?\? loadWriterCandidates\)\([\s\S]*?\)\.catch\(\(\) => \[\]\)/);
});
