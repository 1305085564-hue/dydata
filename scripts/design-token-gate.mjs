#!/usr/bin/env node
// 设计令牌门禁：把《组件与场景契约》§7.1 的机械检查固化为命令，基线棘轮模式。
// 存量违规记录在 scripts/design-token-baseline.json（含抖音待换皮页、terms/privacy 字重豁免）；
// 任何文件新增违规或计数上升即红灯。改基线须走《哲学》定律2（阿禅确认+纠错索引留档）。
// 用法：node scripts/design-token-gate.mjs [--update-baseline]
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const baselinePath = "scripts/design-token-baseline.json";

const VALID_FONT_PX = new Set(["12", "13", "14", "20", "28"]);

// 28 色封闭系统：生产代码只允许这 28 个十六进制色（测试夹具除外）。
const VALID_HEX = new Set([
  "#141413", "#1F1E1D", "#78716C", "#A8A29E", "#FFFFFF", "#FCFCFB",
  "#F1F1F0", "#F7F7F6", "#EBEBE9", "#E4E4E1", "#E2E2DF", "#D6D3D1",
  "#D97757", "#C46A4D",
  "#6FAA7D", "#4B6B4E", "#F0F6F2", "#C0685C", "#F7EAEA", "#B98A54",
  "#8A6A2F", "#F7F3ED", "#43718E", "#EEF2F5",
  "#7E5C99", "#A85A6B", "#6F6B2F", "#2F6F66",
].map((h) => h.toUpperCase()));

const rules = [
  {
    id: "font-size",
    label: "字号封闭系统（只允许 12/13/14/20/28px；13px 专供高密度内容[数据表格/长文案]；落地页 Hero 豁免）",
    args: ["-n", "-o", "text-\\[[0-9.]+px\\]", "src/", "-g", "!**/app/page.tsx"],
    violation: (match) => {
      const px = match.match(/\[([0-9.]+)px\]/)?.[1];
      return px !== undefined && !VALID_FONT_PX.has(px);
    },
  },
  {
    id: "ink",
    label: "墨度封闭系统（禁 Tailwind 原生灰阶 text-stone/zinc/gray/slate）",
    args: ["-n", "text-(slate|zinc|gray|stone)-\\d+", "src/"],
    violation: () => true,
  },
  {
    id: "gap-half",
    label: "元素间距禁半档（gap/space-y 的 1.5/2.5/3.5/4.5）",
    args: ["-n", "(gap|space-y|space-x)-(1\\.5|2\\.5|3\\.5|4\\.5)", "src/"],
    violation: () => true,
  },
  {
    id: "font-weight",
    label: "字重一档（全站仅 400；OG 分享图豁免）",
    args: [
      "-n",
      "font-(medium|semibold|bold|extrabold|black)|font-\\[[0-9]+\\]|fontWeight|font-weight",
      "src/",
      "-g", "!**/opengraph-image.tsx",
    ],
    violation: (line) => !/[:=]\s*['"]?(400|normal)\b/.test(line),
  },
  {
    id: "serif-floor",
    label: "衬线下限（font-serif 不得与小于 20px 的字号同现）",
    args: ["-n", "font-serif", "src/"],
    violation: (line) => /text-\[(12|13|14|18)px\]/.test(line),
  },
  {
    id: "rounded",
    label: "圆角三档+全圆（禁 rounded-sm/lg/3xl、裸 rounded、自定义像素圆角）",
    args: [
      "-n",
      "-e", "rounded-(sm|lg|3xl)",
      "-e", "rounded-\\[[0-9]",
      "-e", "[\"' ]rounded[\"' ]",
      "src/",
    ],
    violation: () => true,
  },
  {
    id: "shadow",
    label: "阴影四档 Token（禁 Tailwind 原生 shadow-2xs/xs/sm/md/2xl 与裸 shadow）",
    args: [
      "-n",
      "-e", "shadow-(2xs|xs|sm|md|2xl)\\b",
      "-e", "[\"' ]shadow[\"' ]",
      "src/",
    ],
    violation: () => true,
  },
];

async function runRule(rule) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync("rg", rule.args, { cwd: root, maxBuffer: 32 * 1024 * 1024 }));
  } catch (error) {
    if (String(error.stdout ?? "").trim() === "" && error.code === 1) return {};
    throw new Error(`rg failed for ${rule.id}: ${error.message}`);
  }
  const counts = {};
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    const first = line.indexOf(":");
    const second = line.indexOf(":", first + 1);
    if (first < 0 || second < 0) continue;
    // 剥离 "file:line:" 前缀再判定，防止行号 400 等数字被误读为合规声明
    const file = path.relative(root, line.slice(0, first)).split(path.sep).join("/");
    const content = line.slice(second + 1);
    if (!rule.violation(content, { match: content })) continue;
    counts[file] = (counts[file] ?? 0) + 1;
  }
  return counts;
}

async function checkPalette() {
  let stdout;
  try {
    ({ stdout } = await execFileAsync(
      "rg",
      ["-n", "-o", "#[0-9a-fA-F]{6}", "src/", "-g", "!**/*.test.*"],
      { cwd: root, maxBuffer: 32 * 1024 * 1024 },
    ));
  } catch (error) {
    if (String(error.stdout ?? "").trim() === "" && error.code === 1) return [];
    throw new Error(`rg failed for palette: ${error.message}`);
  }
  const counts = new Map();
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    const first = line.indexOf(":");
    const second = line.indexOf(":", first + 1);
    if (first < 0 || second < 0) continue;
    const file = path.relative(root, line.slice(0, first)).split(path.sep).join("/");
    const hex = line.slice(second + 1).trim().toUpperCase();
    if (VALID_HEX.has(hex)) continue;
    const key = `${file} ${hex}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(
    ([key, n]) => `[palette] ${key}: 散色 ${n} 处 —— 调色板封闭系统（只允许 28 色）`,
  );
}

async function main() {
  const update = process.argv.includes("--update-baseline");
  let baseline = { _note: "设计令牌存量违规基线（棘轮下界）。新增/上升即红灯；下调须走定律2。", rules: {} };
  if (!update) {
    try {
      baseline = JSON.parse(await fs.readFile(path.join(root, baselinePath), "utf8"));
    } catch {
      console.error(`缺少基线文件 ${baselinePath}，先运行 --update-baseline 生成`);
      process.exit(1);
    }
  }

  const current = {};
  const problems = [];
  for (const rule of rules) {
    const counts = await runRule(rule);
    current[rule.id] = counts;
    const base = baseline.rules?.[rule.id] ?? {};
    for (const [file, n] of Object.entries(counts)) {
      if (update) continue;
      const allowed = base[file] ?? 0;
      if (n > allowed) {
        problems.push(`[${rule.id}] ${file}: 违规 ${n} 处，基线允许 ${allowed} 处 —— ${rule.label}`);
      }
    }
  }

  if (!update) {
    problems.push(...(await checkPalette()));
  }

  if (update) {
    baseline.rules = current;
    await fs.writeFile(path.join(root, baselinePath), JSON.stringify(baseline, null, 2) + "\n");
    const total = Object.values(current).reduce((s, c) => s + Object.values(c).reduce((a, b) => a + b, 0), 0);
    console.log(`基线已更新：存量违规共 ${total} 处。请人工确认无意外项后随代码提交。`);
    return;
  }

  if (problems.length > 0) {
    console.error(`设计令牌门禁红灯（${problems.length} 项超标）：`);
    for (const p of problems) console.error(`  ${p}`);
    console.error("修法：改用规范档位；确属例外走定律2（阿禅确认+纠错索引留档）后 --update-baseline。");
    process.exit(1);
  }
  console.log("设计令牌门禁绿灯：无新增违规（字号/墨度/间距/字重/衬线/圆角/阴影/调色板 8 项，基线棘轮）。");
}

main().catch((error) => {
  console.error(String(error.message ?? error));
  process.exit(1);
});
