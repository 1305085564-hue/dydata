import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { planMoves } from "./archive-old-logs.mjs";

const today = new Date(2026, 10, 20);

test("planMoves：只挑 14 天以前的日志，按月归位，补充文件一起走", () => {
  const moves = planMoves(["2026-11-06.md", "2026-11-05.md", "2026-10-03-补充.md", "README.md"], today);
  assert.deepEqual(moves, [
    ["日志/2026-11-05.md", "docs/archive/日志/2026-11/2026-11-05.md"],
    ["日志/2026-10-03-补充.md", "docs/archive/日志/2026-10/2026-10-03-补充.md"],
  ]);
});

test("logs:archive：移动、重算相对链接、改写引用方；连跑两次第二次不动", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "dydata-logs-"));
  const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  const script = path.resolve("scripts/archive-old-logs.mjs");
  try {
    git("init", "-q");
    git("config", "user.email", "t@t");
    git("config", "user.name", "t");
    mkdirSync(path.join(root, "日志"));
    mkdirSync(path.join(root, "docs/plans"), { recursive: true });
    writeFileSync(path.join(root, "docs/plans/a.md"), "# a\n");
    writeFileSync(path.join(root, "日志/2020-01-02.md"), "见[方案](../docs/plans/a.md)\n");
    writeFileSync(path.join(root, "日志/2020-01-03.md"), "上一天 `日志/2020-01-02.md` 与[链接](2020-01-02.md)\n");
    writeFileSync(path.join(root, "docs/plans/b.md"), "依据[日志](../../日志/2020-01-02.md)\n");
    writeFileSync(path.join(root, "日志/9999-01-01.md"), "未来的日志留着\n");
    git("add", "-A");
    git("commit", "-qm", "init");
    const run = () => execFileSync("node", [script], { cwd: root, encoding: "utf8" });
    run();
    const moved = path.join(root, "docs/archive/日志/2020-01/2020-01-02.md");
    assert.ok(existsSync(moved));
    assert.ok(existsSync(path.join(root, "日志/9999-01-01.md")));
    assert.match(readFileSync(moved, "utf8"), /\]\(\.\.\/\.\.\/\.\.\/plans\/a\.md\)|\]\(\.\.\/\.\.\/\.\.\/docs\/plans\/a\.md\)/);
    assert.match(readFileSync(path.join(root, "docs/plans/b.md"), "utf8"), /\]\(\.\.\/archive\/日志\/2020-01\/2020-01-02\.md\)/);
    const second = readFileSync(path.join(root, "docs/archive/日志/2020-01/2020-01-03.md"), "utf8");
    assert.match(second, /docs\/archive\/日志\/2020-01\/2020-01-02\.md/);
    assert.match(second, /\]\(2020-01-02\.md\)/);
    assert.match(run(), /没有需要归档/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
