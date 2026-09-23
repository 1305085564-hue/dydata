import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * 岗位/数据管理「组员范围」安全不变量（回归护栏）。
 * 只读源码级断言（与本仓 work-group-write / modules 的接线不变量测试同风格）：
 * 一旦有人放宽过滤、把 restrictUserId 从某条名单上摘掉，或让认证候选越权/失败拖垮整页，测试即红。
 * 真正的越权语义由 data-access-scope.test.ts 覆盖 resolveCollaborationScope；此处锁"容器消费口径一致"。
 */
const containerSource = readFileSync(
  new URL("./collaboration-data-container.tsx", import.meta.url),
  "utf8",
);

test("四类岗位名单按同一个 restrictUserId 收窄：运营/达人经 buildCollaborationPageData，文案/剪辑经显式 filter", () => {
  // restrictUserId 只在 restrictToSelf 时取本人 userId，否则 undefined（全量给组长/所有者）
  assert.match(
    containerSource,
    /const restrictUserId = restrictToSelf \? context\.scope\.userId : undefined/,
    "restrictUserId 必须由 restrictToSelf 决定，不能恒为 undefined（否则组员越权看全公司）",
  );
  // 运营/达人/汇总走 pageData，第三参必须是 restrictUserId
  assert.match(
    containerSource,
    /buildCollaborationPageData\(\s*dataset,\s*null,\s*restrictUserId\s*\)/,
    "运营/达人必须与文案/剪辑用同一个 restrictUserId 收窄，口径同源",
  );
  // 文案名单：restrictUserId 存在时按本人过滤
  assert.match(
    containerSource,
    /writerStaff = restrictUserId \? writerList\.filter\(\(r\) => r\.userId === restrictUserId\) : writerList/,
    "文案名单必须按 restrictUserId 收窄，防越权外泄他人作品",
  );
  // 剪辑名单：同样必须收窄（不能只窄文案、漏剪辑）
  assert.match(
    containerSource,
    /editorStaff = restrictUserId \? editorList\.filter\(\(r\) => r\.userId === restrictUserId\) : editorList/,
    "剪辑名单必须按 restrictUserId 收窄，与文案同口径",
  );
});

test("认证候选仅组长/所有者加载且单独 try/catch 容错，失败不拖垮整页", () => {
  // 门控：只有组长/所有者才加载候选（组员不加载，避免越权/无用查询）
  assert.match(
    containerSource,
    /if \(isOwnerOrTeamAdmin\) \{[\s\S]*?loadWriterCandidates\(/,
    "认证候选必须由 isOwnerOrTeamAdmin 门控",
  );
  // 容错：候选加载单独 try/catch，失败降级为空数组，不冒泡到外层把整页判为 loadFailed
  assert.match(
    containerSource,
    /try \{[\s\S]*?loadWriterCandidates\([\s\S]*?\} catch \{\s*writerCandidates = \[\];\s*\}/,
    "候选加载失败必须被就地吞掉降级为空，不能连带清空运营/达人/小队视图",
  );
});
