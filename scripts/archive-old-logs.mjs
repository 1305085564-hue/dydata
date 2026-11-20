#!/usr/bin/env node
// 日志归档：`日志/` 只留最近 14 天，更早的按月移入 `docs/archive/日志/YYYY-MM/`。
// 幂等：已归档的不重复移动；移动时重算文件内相对链接，并改写其他文档里指向它们的链接与路径。
// 用法：npm run logs:archive（可加 --dry-run 只列清单）
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const KEEP_DAYS = 14;
const LOG_FILE = /^(\d{4})-(\d{2})-(\d{2})[^/]*\.md$/;

export function planMoves(names, today, keepDays = KEEP_DAYS) {
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const moves = [];
  for (const name of names) {
    const match = name.match(LOG_FILE);
    if (!match) continue;
    const day = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (Math.floor((todayUtc - day) / 86400000) > keepDays) {
      moves.push([`日志/${name}`, `docs/archive/日志/${match[1]}-${match[2]}/${name}`]);
    }
  }
  return moves;
}

const LINK = /\]\(([^)#\s]+)(#[^)]*)?\)/g;

function rewriteLinks(text, fromDir, toDir, resolveMoved) {
  return text.replace(LINK, (whole, target, hash = "") => {
    if (/^(https?:|mailto:|\/)/.test(target)) return whole;
    let decoded = target;
    try {
      decoded = decodeURIComponent(target);
    } catch {
      return whole;
    }
    const resolved = path.normalize(path.join(fromDir, decoded));
    const mapped = resolveMoved(resolved) ?? resolved;
    const next = path.relative(toDir, mapped).split(path.sep).join("/");
    return next === decoded ? whole : `](${next}${hash})`;
  });
}

function main() {
  const root = process.cwd();
  const dryRun = process.argv.includes("--dry-run");
  const names = existsSync("日志") ? execFileSync("ls", ["日志"], { encoding: "utf8" }).split("\n").filter(Boolean) : [];
  const moves = planMoves(names, new Date());
  if (!moves.length) {
    console.log("logs:archive 没有需要归档的日志（14 天内的都留着）。");
    return;
  }
  console.log(`logs:archive ${dryRun ? "将归档" : "归档"} ${moves.length} 个文件（${moves[0][0]} … ${moves[moves.length - 1][0]}）`);
  if (dryRun) return;

  const moved = new Map(moves.map(([from, to]) => [path.normalize(from), to]));
  const oldHome = new Map(moves.map(([from, to]) => [path.normalize(to), from]));
  const resolveMoved = (p) => moved.get(p);

  // 先搬（git 索引偶尔被别的进程短暂占用，失败就等一下重试），再改写链接
  for (const [from, to] of moves) {
    mkdirSync(path.dirname(to), { recursive: true });
    for (let attempt = 0; ; attempt += 1) {
      try {
        execFileSync("git", ["mv", from, to], { cwd: root, stdio: "pipe" });
        break;
      } catch (error) {
        if (attempt >= 7) throw error;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500);
      }
    }
  }

  // 改写所有文档里指向被移文件的链接与路径；被移文件自己的相对链接按旧位置解析、按新位置重算
  const tracked = execFileSync("git", ["ls-files", "-z", "--", "*.md", "*.mjs", "*.ts", "*.json"], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
  for (const file of tracked) {
    if (!existsSync(file)) continue;
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const original = text;
    const before = oldHome.get(path.normalize(file)) ?? file;
    text = rewriteLinks(text, path.dirname(before), path.dirname(file), resolveMoved);
    for (const [from, to] of moves) {
      const name = path.basename(from);
      const plain = new RegExp(`(^|[\\s\`（(「])日志/${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "gm");
      text = text.replace(plain, (_, lead) => `${lead}${to}`);
    }
    if (text !== original) writeFileSync(file, text);
  }
  console.log("logs:archive 完成。请 git status 查看后提交。");
}

import { fileURLToPath } from "node:url";
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
