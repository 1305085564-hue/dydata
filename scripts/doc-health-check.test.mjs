import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { scan } from "./doc-health-check.mjs";

test("文档引用检查只核对当前依据，并识别文件、链接、表名和函数缺项", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "doc-health-check-"));
  try {
    mkdirSync(path.join(root, "docs/reference"), { recursive: true });
    mkdirSync(path.join(root, "docs/guide"), { recursive: true });
    mkdirSync(path.join(root, "src"), { recursive: true });
    mkdirSync(path.join(root, "supabase/migrations"), { recursive: true });
    writeFileSync(path.join(root, "docs/reference/文档归口现状.md"), [
      "## 一、当前依据（施工只读这里）",
      "| [依据](../guide/current.md) |",
      "## 二、历史",
      "| [不扫描](../missing.md) |",
    ].join("\n"));
    writeFileSync(path.join(root, "docs/guide/current.md"), [
      "[有效链接](./page-(x).md)",
      "[失效链接](./missing.md)",
      "文件 `src/present.ts` 与 `src/missing.ts`。",
      "未加反引号的路径 scripts/plain-missing.mjs:12",
      "表 `profiles`，表 `absent_table`。",
      "旧数据表 `profiles(status=active)`。",
      "RPC `known_rpc()`，RPC `absent_rpc()`。",
      "函数签名 `known_signature(userId: string, date?: string)`。",
      "函数签名 `mismatch_signature(userId: string, date?: string)`。",
      "响应类型 `KnownResponse` 与 `AbsentResponse`。",
      "```md",
      "[代码示例链接](./not-a-real-link.md)",
      "```",
    ].join("\n"));
    writeFileSync(path.join(root, "docs/guide/page-(x).md"), "存在\n");
    writeFileSync(path.join(root, "src/present.ts"), [
      "export type KnownResponse = string;",
      "const absent_rpc = 'a stale identifier, not a function';",
      "export function known_signature(userId: string, date?: string) {}",
      "export function mismatch_signature(userId: string) {}",
    ].join("\n"));
    writeFileSync(path.join(root, "supabase/migrations/001.sql"), [
      "create table public.profiles (id uuid);",
      "create function public.known_rpc() returns void language sql as $$ select; $$;",
    ].join("\n"));

    const shallow = scan(root);
    assert.equal(shallow.docs, 1);
    assert.deepEqual(shallow.issues.map(({ category, target }) => `${category}:${target}`), [
      "内部链接:./missing.md",
      "文件路径:src/missing.ts",
      "文件路径:scripts/plain-missing.mjs",
      "表名:absent_table",
      "函数名:absent_rpc",
    ]);

    const deep = scan(root, true);
    assert.ok(deep.issues.some(({ category, target }) => category === "类型定义" && target === "AbsentResponse"));
    assert.ok(deep.issues.some(({ category, target }) => category === "函数声明" && target === "absent_rpc"));
    assert.ok(deep.issues.some(({ category, target }) => category === "函数签名" && target === "mismatch_signature"));
    assert.ok(!deep.issues.some(({ category, target }) => category === "函数签名" && target === "known_signature"));
    assert.ok(!deep.issues.some(({ target }) => target === "not-a-real-link.md"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
