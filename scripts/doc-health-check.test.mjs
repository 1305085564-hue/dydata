import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { extractCurrentBasis, fixLinks, scan, scanLinks } from "./doc-health-check.mjs";

function withRoot(files, run) {
  const root = mkdtempSync(path.join(os.tmpdir(), "doc-health-check-"));
  try {
    for (const [file, content] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), content);
    }
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const read = (root, file) => readFileSync(path.join(root, file), "utf8");
const summary = (issues) => issues.map(({ category, target }) => `${category}:${target}`);

test("当前依据 = AGENTS.md + docs/reference 下全部 Markdown，其他目录不扫", () => {
  withRoot({
    "AGENTS.md": "入口\n",
    "docs/reference/a.md": "a\n",
    "docs/reference/设计与决策/b.md": "b\n",
    "docs/reference/note.txt": "不是 md\n",
    "docs/plans/c.md": "计划不扫\n",
    "docs/archive/d.md": "归档不扫\n",
  }, (root) => {
    const basis = extractCurrentBasis(root).map((file) => path.relative(root, file).split(path.sep).join("/"));
    assert.deepEqual(basis, ["AGENTS.md", "docs/reference/a.md", "docs/reference/设计与决策/b.md"]);
  });
});

test("文档引用检查只核对当前依据，并识别文件、链接、表名和函数缺项", () => {
  withRoot({
    "docs/reference/index.md": "[有效链接](../guide/current.md)\n",
    "docs/guide/not-basis.md": "表 `unscanned_table`。\n[坏链接但不在依据内](./nope.md)\n",
    "docs/reference/current.md": [
      "[有效链接](./page-(x).md)",
      "[失效链接](./missing.md)",
      "文件 `src/present.ts` 与 `src/missing.ts`。",
      "未加反引号的路径 scripts/plain-missing.mjs:12",
      "日期占位符 `日志/YYYY-MM-DD.md` 不算真路径。",
      "表 `profiles`，表 `absent_table`。",
      "旧数据表 `profiles(status=active)`。",
      "RPC `known_rpc()`，RPC `absent_rpc()`。",
      "函数签名 `known_signature(userId: string, date?: string)`。",
      "函数签名 `mismatch_signature(userId: string, date?: string)`。",
      "响应类型 `KnownResponse` 与 `AbsentResponse`。",
      "```md",
      "[代码示例链接](./not-a-real-link.md)",
      "```",
    ].join("\n"),
    "docs/reference/page-(x).md": "存在\n",
    "src/present.ts": [
      "export type KnownResponse = string;",
      "const absent_rpc = 'a stale identifier, not a function';",
      "export function known_signature(userId: string, date?: string) {}",
      "export function mismatch_signature(userId: string) {}",
    ].join("\n"),
    "supabase/migrations/001.sql": [
      "create table public.profiles (id uuid);",
      "create function public.known_rpc() returns void language sql as $$ select; $$;",
    ].join("\n"),
  }, (root) => {
    const shallow = scan(root);
    assert.equal(shallow.docs, 3);
    assert.deepEqual(summary(shallow.issues), [
      "内部链接:./missing.md",
      "文件路径:src/missing.ts",
      "文件路径:scripts/plain-missing.mjs",
      "表名:absent_table",
      "函数名:absent_rpc",
      "内部链接:../guide/current.md", // 来自 index.md（按文件名排序在 current.md 之后）
    ]);

    const deep = scan(root, true);
    assert.ok(deep.issues.some(({ category, target }) => category === "类型定义" && target === "AbsentResponse"));
    assert.ok(deep.issues.some(({ category, target }) => category === "函数声明" && target === "absent_rpc"));
    assert.ok(deep.issues.some(({ category, target }) => category === "函数签名" && target === "mismatch_signature"));
    assert.ok(!deep.issues.some(({ category, target }) => category === "函数签名" && target === "known_signature"));
    assert.ok(!deep.issues.some(({ target }) => target === "not-a-real-link.md"));
    assert.ok(!deep.issues.some(({ target }) => target === "unscanned_table" || target === "./nope.md"));
  });
});

test("快速模式只查链接，报出文件、行号、坏链接和修法，不报文件路径/表名这类问题", () => {
  withRoot({
    "docs/reference/old.md": [
      "第一行",
      "看 [权限链路](../链路设计与决策/权限链路.md#现行设计) 和 `src/missing.ts`、表 `absent_table`。",
    ].join("\n"),
    "docs/reference/设计与决策/权限链路.md": "# 权限\n",
  }, (root) => {
    const { docs, issues } = scanLinks(root);
    assert.equal(docs, 2);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].doc, "docs/reference/old.md");
    assert.equal(issues[0].line, 2);
    assert.equal(issues[0].category, "内部链接");
    assert.equal(issues[0].target, "../链路设计与决策/权限链路.md");
    assert.match(issues[0].detail, /改成「设计与决策\/权限链路\.md#现行设计」/);
  });
});

test("修法建议：挪了目录按文件名找到、改了名按登记表、同名多份优先现行、真没了才说原稿已删", () => {
  withRoot({
    "AGENTS.md": "x\n",
    "docs/reference/页面.md": [
      "[上线](../全站设计与决策/上线与运维.md)",
      "[总纲](../设计与决策.md)",
      "[数据管理](页面设计与决策/数据管理.md#第1条)",
      "[归档稿](../../archive/批次/旧稿.md)",
      "[已删稿](../../archive/批次/不存在的稿.md)",
      "[入口](../../../AGENTS.md#规则)",
      "[同名无法分辨](无关目录/重名.md)",
    ].join("\n"),
    "docs/reference/上线与运维.md": "x\n",
    "docs/reference/设计与决策/设计与决策总纲.md": "x\n",
    "docs/reference/设计与决策/数据管理.md": "现行\n",
    "docs/archive/页面功能说明/数据管理.md": "归档副本\n",
    "docs/archive/新批次/旧稿.md": "x\n",
    "docs/plans/重名.md": "x\n",
    "docs/reference/其他/重名.md": "x\n",
  }, (root) => {
    const byTarget = Object.fromEntries(scanLinks(root).issues.map((issue) => [issue.target, issue.detail]));
    assert.match(byTarget["../全站设计与决策/上线与运维.md"], /改成「上线与运维\.md」/);
    assert.match(byTarget["../设计与决策.md"], /改成「设计与决策\/设计与决策总纲\.md」/);
    assert.match(byTarget["页面设计与决策/数据管理.md"], /改成「设计与决策\/数据管理\.md#第1条」/);
    assert.match(byTarget["../../archive/批次/旧稿.md"], /改成「\.\.\/archive\/新批次\/旧稿\.md」/);
    assert.match(byTarget["../../archive/批次/不存在的稿.md"], /找不到同名文件.*原稿已不在仓库/);
    assert.match(byTarget["../../../AGENTS.md"], /改成「\.\.\/\.\.\/AGENTS\.md#规则」/);
    assert.match(byTarget["无关目录/重名.md"], /有多个同名文件（.*plans\/重名\.md.*其他\/重名\.md.*）.*人工选定/);
  });
});

test("--fix-links 只改文件路径、保留锚点和链接文字；原稿已删的默认不动，加开关才改成纯文字", () => {
  const files = {
    "docs/reference/页面.md": [
      "| 看 [上线](../全站设计与决策/上线与运维.md#现行-部署) 与 [老稿](../../archive/批次/不存在的稿.md) |",
      "```md",
      "[代码块里的坏链接不动](./不存在.md)",
      "```",
      "行内 `[行内代码里的](./不存在.md)` 也不动，[好链接](./上线与运维.md) 不动。",
    ].join("\n"),
    "docs/reference/上线与运维.md": "x\n",
  };
  withRoot(files, (root) => {
    const first = fixLinks(root);
    assert.deepEqual(first, { files: 1, moved: 1, text: 0, manual: 1 });
    const afterMove = read(root, "docs/reference/页面.md");
    assert.match(afterMove, /\[上线\]\(上线与运维\.md#现行-部署\)/);
    assert.match(afterMove, /\[老稿\]\(\.\.\/\.\.\/archive\/批次\/不存在的稿\.md\)/);
    assert.match(afterMove, /\[代码块里的坏链接不动\]\(\.\/不存在\.md\)/);
    assert.match(afterMove, /`\[行内代码里的\]\(\.\/不存在\.md\)`/);

    const second = fixLinks(root, { missingAsText: true });
    assert.deepEqual(second, { files: 1, moved: 0, text: 1, manual: 0 });
    const afterText = read(root, "docs/reference/页面.md");
    assert.match(afterText, /老稿（原稿已不在仓库）/);
    assert.doesNotMatch(afterText, /不存在的稿\.md/);
    assert.match(afterText, /\[好链接\]\(\.\/上线与运维\.md\)/);

    assert.equal(scanLinks(root).issues.length, 0);
    assert.deepEqual(fixLinks(root, { missingAsText: true }), { files: 0, moved: 0, text: 0, manual: 0 });
  });
});

test("路径被 .gitignore 明确忽略的本地私有文件，不算仓库里找不到", () => {
  withRoot({
    "docs/reference/a.md": "账号见 `docs/私有/测试账号.md`，另见 `docs/私有/别的.md`。\n",
    "supabase/migrations/001.sql": "create table public.t (id uuid);\n",
  }, (root) => {
    writeFileSync(path.join(root, ".gitignore"), "docs/私有/测试账号.md\n");
    execFileSync("git", ["init", "-q"], { cwd: root, stdio: "ignore" });
    assert.deepEqual(summary(scan(root).issues), ["文件路径:docs/私有/别的.md"]);
  });
});
