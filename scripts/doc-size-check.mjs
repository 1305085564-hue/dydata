#!/usr/bin/env node
// 文档体量检查（推送前第 5 项与可维护性门禁一起跑）：
//  1) 行数：超过上限只提醒（退出码 0）；超过上限 1.5 倍才拦。上限表见 docs/reference/设计与决策.md「行数上限」。
//  2) 日志：`日志/` 里出现超过 45 天的文件就拦，修复方法 `npm run logs:archive`。
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const HARD_FACTOR = 1.5;
export const LOG_MAX_AGE_DAYS = 45;

const BIG = 300;
const MID = 200;
const SMALL = 100;

const FIXED = new Map([
  ["AGENTS.md", MID],
  ["docs/通用管理/待办清单.md", SMALL],
  ["docs/通用管理/上下文交接.md", SMALL],
  ["docs/reference/设计与决策.md", MID],
  ["docs/reference/全站设计与决策/效率美学.md", 450],
  ["docs/reference/全站设计与决策/美学宝典.md", 400],
  ["docs/reference/全站设计与决策/工程底座.md", BIG],
  ["docs/reference/全站设计与决策/上线与运维.md", BIG],
  ["docs/reference/全站设计与决策/后端工程规范.md", MID],
  ["docs/reference/全站设计与决策/纠错索引.md", MID],
]);

export function limitFor(file) {
  if (FIXED.has(file)) return FIXED.get(file);
  if (/^docs\/reference\/(页面设计与决策|链路设计与决策)\/[^/]+\.md$/.test(file)) return BIG;
  return null;
}

export function countLines(text) {
  if (!text) return 0;
  const parts = text.split("\n");
  return parts[parts.length - 1] === "" ? parts.length - 1 : parts.length;
}

function dateOnly(value) {
  return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
}

// files: 仓库相对路径数组；readText(file) 返回文件内容；today: Date（按本机日期）
export function checkDocs({ files, readText, today }) {
  const warnings = [];
  const blocks = [];
  for (const file of files) {
    const limit = limitFor(file);
    if (limit === null) continue;
    const lines = countLines(readText(file));
    if (lines > Math.floor(limit * HARD_FACTOR)) {
      blocks.push(`${file} ${lines} 行，超过硬拦线 ${Math.floor(limit * HARD_FACTOR)}（上限 ${limit}）：先压缩、清理，再拆子文件`);
    } else if (lines > limit) {
      warnings.push(`${file} ${lines} 行，超过上限 ${limit}（不拦，留给下一次文档维护任务统一压）`);
    }
  }
  for (const file of files) {
    const match = file.match(/^日志\/(\d{4})-(\d{2})-(\d{2})[^/]*\.md$/);
    if (!match) continue;
    const logDay = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    const age = Math.floor((dateOnly(today) - logDay) / 86400000);
    if (age > LOG_MAX_AGE_DAYS) blocks.push(`${file} 已放了 ${age} 天（超过 ${LOG_MAX_AGE_DAYS} 天）：运行 npm run logs:archive 归档`);
  }
  return { warnings, blocks };
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const files = execFileSync("git", ["ls-files", "-z", "--", "*.md"], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
  const { warnings, blocks } = checkDocs({
    files,
    readText: (file) => {
      try {
        return readFileSync(path.join(root, file), "utf8");
      } catch {
        return "";
      }
    },
    today: new Date(),
  });
  for (const warning of warnings) console.log(`doc size: 超限提醒：${warning}`);
  if (blocks.length) {
    for (const block of blocks) console.error(`doc size: 拦下：${block}`);
    process.exitCode = 1;
  } else {
    console.log("doc size: pass");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
