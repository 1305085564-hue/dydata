#!/usr/bin/env node
/**
 * 统一禁用清单（第五批 B）：把「不准再写第二次」的规矩收成一个检查。
 *
 * 只在 `npm run gate:static` 里跑（第 7 步，与源码文字测试门禁同一格），不单独占一步。
 * 每条违规都写明「该用什么」，不只说「不许」。
 *
 * 分三类判定：
 * 1. 新增面（只拦本次新增的行与白名单外的新文件）：已下线功能不准加回来、
 *    迁移文件只准新增、supabase-js 的 eslint 规则必须还在。
 * 2. 棘轮面（全量扫描 + 豁免名单只减不增）：数据库原始报错回页面、已经收成一份的
 *    规则被抄第二份（豁免类别换算文案、按天推进日期、指标数字解析）。
 * 3. 名单面：设计令牌基线、接口失败路径豁免、截图存储白名单、读代码测试名单，
 *    新增条目必须写明理由，计数只准降。
 *
 * 已由别的检查守住、这里故意不重复造的：
 * - 北京时间（+08:00 / Asia/Shanghai / toISOString 切日期）→ scripts/maintainability-gate.mjs
 * - 组员可见范围（activeVisibleUserIds 三处公开类型必填）→ tsc
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const EXEMPTIONS_PATH = "scripts/guard-exemptions.json";
export const REASONS_PATH = "scripts/guard-reasons.json";
export const SCREENSHOT_ALLOWLIST_PATH = "scripts/screenshot-storage-allowlist.json";

/** 每条规矩的「该用什么」；报错正文直接引用，避免只说禁止。 */
export const GUIDANCE = {
  backendSwitch:
    "后端开关已经下线（2026-11-23 第四批）：全站只剩腾讯云 CloudBase 一套后台。直接调转接层 @/lib/supabase/server、@/lib/supabase/admin、@/lib/supabase/client，不要再按 DYDATA_BACKEND / isCloudBaseBackend 分叉。",
  screenshotStorage:
    "截图存储只剩腾讯云 COS 一套（SCREENSHOT_STORAGE 开关已删除）。上传与读取统一走 src/lib/screenshot-storage.ts；读取失败用 notFound 区分「文件不存在」（404）与「服务暂时不可用」（502）。",
  vercel:
    "Vercel 已于 2026-11-22 暂停，整站迁腾讯云上海云托管。部署走 scripts/cloudbase/deploy-service.mjs；不要再加 vercel.json，也不要读 VERCEL_* 环境变量。",
  baiduOcr:
    "百度 OCR 已于 2026-11-22 下线，改由后台算力池承接。截图识别走 src/lib/clairic-ocr.ts 与 /api/ocr-screenshot 的通道配置，不要再引百度 SDK 或 BAIDU_* 变量。",
  migrationImmutable:
    "已经执行过的迁移文件不能改，只能新增（线上已按它建过结构，改了等于两边不一致）。要改结构请新增文件：supabase/migrations/<YYYYMMDDHHMMSS>_<说明>.sql，只增不改、向后兼容，本机先 npm run db:replay 重放。",
  dbErrorLeak:
    "不要把数据库/底层的原始报错（.message / .details / .hint）放进返回给页面的对象：它带表名列名，用户也看不懂。改成固定文案 + 错误码（{ error: \"保存失败，请重试\", error_code: \"...\" }），原始报错写日志并用 requestId 关联（src/lib/request-context.ts）。",
  exemptionCategory:
    "豁免类别的换算与展示文案只有一个出处 src/lib/exemption-category.ts（normalizeExemptionCategory / getEmployeeExemptionCategoryLabel / getAdminExemptionCategoryLabel）。不要再写 category === \"leave\" ? \"请假\" : ... 这类分支。",
  manualDateAdvance:
    "按天推进日期只有一个出处 src/lib/business-time.ts（shiftDateOnly / addShanghaiDateOnly / expandShanghaiDateRange）。不要自己 setDate(getDate() ± n)：那是设备时区，北京时间凌晨会差一天。",
  manualMetricParse:
    "指标数字解析只有一个出处 src/lib/dashboard-logic/metric-input-cleaner.ts（cleanMetricInputValue / parseMetric，已支持 1.2w、3k、12,345、35.5%、45s）。不要自己 replace 掉单位再 parseFloat。",
  supabaseAdapter:
    "supabase-js 只准转接层引入的规则在 eslint.config.mjs（no-restricted-imports + no-restricted-syntax，由 gate:static 第 4 步 lint 执行）。规则被删了就在这里恢复，不要另写一套扫描。",
};

const RETIRED_PATTERNS = [
  {
    id: "backend-switch",
    pattern: /\b(?:NEXT_PUBLIC_)?DYDATA_BACKEND\b|\bisCloudBaseBackend\b/,
    guidance: GUIDANCE.backendSwitch,
  },
  {
    id: "screenshot-storage",
    pattern: /\bSCREENSHOT_STORAGE\b/,
    guidance: GUIDANCE.screenshotStorage,
  },
  {
    id: "vercel",
    pattern: /\bvercel\.json\b|\bVERCEL_(?:ENV|URL|REGION)\b|\bprocess\.env\.VERCEL\b/i,
    guidance: GUIDANCE.vercel,
  },
  {
    id: "baidu-ocr",
    pattern: /\bba[i]du\b|(?<![\w$])BAIDU_[A-Z0-9_]+/i,
    guidance: GUIDANCE.baiduOcr,
  },
];

// 数据库原始报错回页面：属性名是 error/message/detail(s)/hint，值直接取底层报错文本。
const DB_ERROR_LEAK_PATTERN =
  /(?:^|[{,\s])(?:error|message|detail|details|hint)\s*:\s*[A-Za-z_$][\w$]*(?:\s*\?\s*[^:]+)?\.(?:message|details|hint)\b/;
// 豁免类别换算/文案手写一份：同一行里既有 "leave" 又有「请假/免交」。
const EXEMPTION_COPY_PATTERN = /(["'])leave\1/;
const EXEMPTION_LABEL_PATTERN = /(["'])(?:请假|免交)\1/;
// 手写按天推进日期。
const MANUAL_DATE_PATTERN = /setDate\([^)]*getDate\(\)/;
// 手写「去单位 + 转数字」。
const MANUAL_METRIC_NUMBER_PATTERN = /(?:parseFloat|Number\.parseFloat|Number\()/;
const MANUAL_METRIC_UNIT_PATTERN = /replace\(\s*\/[^/]*(?:%|秒|万|w|W|k|K|千)[^/]*\//;

export const SCAN_RULES = [
  {
    id: "db-error-leak",
    label: "数据库原始报错回页面",
    roots: ["src/app"],
    match: (line) => DB_ERROR_LEAK_PATTERN.test(line),
    guidance: GUIDANCE.dbErrorLeak,
  },
  {
    id: "exemption-category-copy",
    label: "豁免类别换算/文案手写第二份",
    roots: ["src"],
    skip: ["src/lib/exemption-category.ts"],
    match: (line) => EXEMPTION_COPY_PATTERN.test(line) && EXEMPTION_LABEL_PATTERN.test(line),
    guidance: GUIDANCE.exemptionCategory,
  },
  {
    id: "manual-date-advance",
    label: "手写按天推进日期",
    roots: ["src"],
    skip: ["src/lib/business-time.ts"],
    match: (line) => MANUAL_DATE_PATTERN.test(line),
    guidance: GUIDANCE.manualDateAdvance,
  },
  {
    id: "manual-metric-parse",
    label: "手写指标数字解析",
    roots: ["src"],
    skip: ["src/lib/dashboard-logic/metric-input-cleaner.ts"],
    match: (line) => MANUAL_METRIC_NUMBER_PATTERN.test(line) && MANUAL_METRIC_UNIT_PATTERN.test(line),
    guidance: GUIDANCE.manualMetricParse,
  },
];

const SOURCE_EXTENSION = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/;
const TEST_FILE = /\.(?:test|spec)\.(?:ts|tsx|js|jsx|mjs|cjs)$/;

function isComment(line) {
  const text = line.trim();
  return text.startsWith("//") || text.startsWith("*") || text.startsWith("/*");
}

function gitList(root, directory) {
  return execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", directory], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  })
    .split("\0")
    .filter(Boolean);
}

/** 全量扫描用的源文件清单：不读测试文件（测试允许提旧名字做反向断言）。 */
export function sourceFiles(root, directory) {
  return gitList(root, directory)
    .filter((file) => SOURCE_EXTENSION.test(file) && !TEST_FILE.test(file))
    .filter((file) => existsSync(path.join(root, file)));
}

/** 新增面：本次相对基线新加的行（含白名单外新文件的全文）。 */
export function addedLines(root, baseRef) {
  let diff = "";
  try {
    diff = execFileSync("git", ["diff", "--no-renames", "--unified=0", baseRef, "--", "src"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    diff = "";
  }
  const hits = [];
  let current = null;
  for (const raw of diff.split(/\r?\n/)) {
    const header = raw.match(/^\+\+\+ b\/(.+)$/);
    if (header) {
      current = header[1] === "/dev/null" ? null : header[1];
      continue;
    }
    if (raw.startsWith("@@")) continue;
    if (!current || !raw.startsWith("+")) continue;
    hits.push({ file: current, text: raw.slice(1) });
  }
  // 未跟踪的新文件不会出现在 diff 里，全文都算新增。
  const untracked = execFileSync("git", ["ls-files", "-z", "--others", "--exclude-standard", "--", "src"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  })
    .split("\0")
    .filter(Boolean);
  for (const file of untracked) {
    const absolute = path.join(root, file);
    if (!existsSync(absolute) || TEST_FILE.test(file)) continue;
    for (const text of readFileSync(absolute, "utf8").split(/\r?\n/)) hits.push({ file, text });
  }
  return hits.filter((hit) => !TEST_FILE.test(hit.file));
}

export function findRetiredUsage(lines) {
  const hits = [];
  for (const { file, text } of lines) {
    if (isComment(text)) continue;
    for (const rule of RETIRED_PATTERNS) {
      if (rule.pattern.test(text)) hits.push({ rule: rule.id, file, text: text.trim(), guidance: rule.guidance });
    }
  }
  return hits;
}

export function countScanRule(rule, files) {
  const counts = {};
  for (const [file, source] of Object.entries(files)) {
    if (rule.skip?.includes(file)) continue;
    let count = 0;
    for (const line of source.split(/\r?\n/)) {
      if (isComment(line)) continue;
      if (rule.match(line)) count += 1;
    }
    if (count > 0) counts[file] = count;
  }
  return counts;
}

/** 读 git 基线版本；文件在基线里不存在时返回 null。 */
export function readBaseJson(root, baseRef, relative) {
  try {
    return JSON.parse(
      execFileSync("git", ["show", `${baseRef}:${relative}`], {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
  } catch {
    return null;
  }
}

/** 豁免名单：每条都要写理由；相对基线只准减、计数只准降。 */
export function evaluateExemptions(baseJson, currentJson) {
  const issues = [];
  for (const rule of SCAN_RULES) {
    const base = baseJson?.[rule.id] ?? {};
    const current = currentJson?.[rule.id] ?? {};
    for (const [file, entry] of Object.entries(current)) {
      if (!String(entry?.reason ?? "").trim()) {
        issues.push(`${rule.id} / ${file}：豁免条目没写 reason（说不清为什么放过的，就不该放过）`);
        continue;
      }
      if (baseJson) {
        const baseEntry = base[file];
        if (!baseEntry) {
          issues.push(`${rule.id} / ${file}：新增豁免条目（${entry.count} 处）；这类名单只准减不准增，确需新增必须在 ${REASONS_PATH} 登记理由并由复验方追加`);
          continue;
        }
        const before = Number(baseEntry.count ?? 0);
        if (Number(entry.count) > before) {
          issues.push(`${rule.id} / ${file}：豁免数 ${before} -> ${entry.count}；只准减不准增`);
        }
      }
    }
  }
  return issues;
}

/** 名单面：设计令牌基线 / 接口失败路径豁免 / 截图存储白名单 / 读代码测试名单。 */
export function registryEntries(id, json) {
  const entries = {};
  if (!json) return entries;
  if (id === "design-token") {
    for (const [ruleId, files] of Object.entries(json.rules ?? {})) {
      for (const [file, count] of Object.entries(files ?? {})) {
        entries[`${ruleId}/${file}`] = { count: Number(count), reason: "" };
      }
    }
    return entries;
  }
  if (id === "source-text-test") {
    for (const [file, count] of Object.entries(json.files ?? {})) {
      entries[file] = { count: Number(count), reason: "" };
    }
    return entries;
  }
  if (id === "api-failure") {
    for (const [routePath, reason] of Object.entries(json)) {
      entries[routePath] = { count: 1, reason: String(reason ?? "").trim() };
    }
    return entries;
  }
  if (id === "screenshot-storage") {
    for (const group of ["production", "scripts", "migrations"]) {
      for (const entry of json[group] ?? []) {
        entries[`${group}: ${entry.path}`] = { count: 1, reason: String(entry.reason ?? "").trim() };
      }
    }
    return entries;
  }
  return entries;
}

export function evaluateRegistry({ id, base, current, reasons, hardBlockNew }) {
  const issues = [];
  const info = [];
  const baseEntries = registryEntries(id, base);
  const currentEntries = registryEntries(id, current);
  for (const [key, entry] of Object.entries(currentEntries)) {
    const baseEntry = baseEntries[key];
    const reason = entry.reason || reasons?.[id]?.[key] || "";
    if (!baseEntry) {
      if (!base) {
        // 名单本身是这次新引入的（基线里没有）：同样要求每条写明理由，只是不逐条提示。
        if (!hardBlockNew && !reason) {
          issues.push(`新增条目「${key}」没写理由：在 ${REASONS_PATH} 的 ${id}.${key} 写清为什么必须新增，或在条目里加 reason 字段`);
        }
        continue;
      }
      if (hardBlockNew) {
        issues.push(`新增条目「${key}」：该名单已封闭（第二批定，禁止新增读代码文字的测试），只能减不能加`);
      } else if (!reason) {
        issues.push(
          `新增条目「${key}」没写理由：在 ${REASONS_PATH} 的 ${id}.${key} 写清为什么必须新增，或在条目里加 reason 字段（名单只准减，确需新增必须留理由）`,
        );
      } else {
        info.push(`新增豁免已登记理由：${id} / ${key} —— ${reason}`);
      }
      continue;
    }
    if (entry.count > baseEntry.count) {
      issues.push(`${id} 条目「${key}」计数 ${baseEntry.count} -> ${entry.count}；这类名单只准减不准增`);
    }
  }
  return { issues, info };
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/** 直接运行判断：用 realpath 比较，macOS 的 /var → /private/var 软链会让简单比较失效（测试夹具就跑不起来）。 */
function isDirectRun(scriptPath) {
  try {
    return realpathSync(scriptPath) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

export function runGuard(root, baseRef) {
  const problems = [];
  const notes = [];

  try {
    execFileSync("git", ["rev-parse", "--verify", `${baseRef}^{commit}`], { cwd: root, encoding: "utf8", stdio: "ignore" });
  } catch {
    return { problems: [`找不到基线 ${baseRef}：先 git fetch origin main 再跑（不对比基线就分不清存量与新增）`], notes, ruleCount: 0 };
  }

  // 一、已下线功能不准加回来（只看新增行与新文件）。
  for (const hit of findRetiredUsage(addedLines(root, baseRef))) {
    problems.push(`[下线功能加回][${hit.rule}] ${hit.file}: ${hit.text.slice(0, 120)}\n  该用什么：${hit.guidance}`);
  }
  if (existsSync(path.join(root, "vercel.json"))) {
    problems.push(`[下线功能加回][vercel] 仓库根目录出现 vercel.json\n  该用什么：${GUIDANCE.vercel}`);
  }

  // 二、已经执行过的迁移文件不准修改（只能新增）。
  const changedMigrations = execFileSync(
    "git",
    ["diff", "--name-status", "--diff-filter=MDR", `${baseRef}...HEAD`, "--", "supabase/migrations"],
    { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  )
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  // 工作区里改了还没提交的迁移也算（push 前拦截才是真拦截）。
  const dirtyMigrations = execFileSync("git", ["diff", "HEAD", "--name-status", "--diff-filter=MDR", "--", "supabase/migrations"], {
    cwd: root,
    encoding: "utf8",
  })
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of [...new Set([...changedMigrations, ...dirtyMigrations])]) {
    problems.push(`[迁移文件被改] ${line}\n  该用什么：${GUIDANCE.migrationImmutable}`);
  }

  // 三、棘轮面：全量扫描，超出豁免即报（豁免名单只减不增）。
  const exemptions = readJson(path.join(root, EXEMPTIONS_PATH));
  if (!exemptions) {
    return { problems: [`缺少 ${EXEMPTIONS_PATH}（存量豁免名单），先恢复它再跑`], notes, ruleCount: 0 };
  }
  const baseExemptions = readBaseJson(root, baseRef, EXEMPTIONS_PATH);
  problems.push(...evaluateExemptions(baseExemptions, exemptions).map((issue) => `[豁免名单只减不增] ${issue}`));

  for (const rule of SCAN_RULES) {
    const files = {};
    for (const directory of rule.roots) {
      for (const file of sourceFiles(root, directory)) files[file] = readFileSync(path.join(root, file), "utf8");
    }
    const counts = countScanRule(rule, files);
    for (const [file, count] of Object.entries(counts)) {
      const allowed = Number(exemptions[rule.id]?.[file]?.count ?? 0);
      if (count > allowed) {
        problems.push(
          `[${rule.label}] ${file}: ${count} 处，豁免名单允许 ${allowed} 处\n  该用什么：${rule.guidance}\n  确需保留：在 ${EXEMPTIONS_PATH} 的 ${rule.id} 下登记并写明 reason（名单只减不增）。`,
        );
      }
    }
  }

  // 四、四个名单：新增条目必须带理由，计数只准降。
  const reasonFile = readJson(path.join(root, REASONS_PATH)) ?? {};
  const registries = [
    { id: "design-token", file: "scripts/design-token-baseline.json", label: "设计令牌基线" },
    { id: "api-failure", file: "scripts/api-failure-path-exemptions.json", label: "接口失败路径豁免" },
    { id: "screenshot-storage", file: SCREENSHOT_ALLOWLIST_PATH, label: "截图存储白名单" },
    { id: "source-text-test", file: "scripts/source-text-test-baseline.json", label: "读代码测试名单", hardBlockNew: true },
  ];
  for (const registry of registries) {
    const current = readJson(path.join(root, registry.file));
    if (!current) {
      problems.push(`[名单缺失] ${registry.file} 读不到或不是合法 JSON；${registry.label}必须保留并只减不增。`);
      continue;
    }
    const result = evaluateRegistry({
      id: registry.id,
      base: readBaseJson(root, baseRef, registry.file),
      current,
      reasons: reasonFile,
      hardBlockNew: registry.hardBlockNew,
    });
    for (const issue of result.issues) problems.push(`[${registry.label}] ${issue}`);
    notes.push(...result.info);
  }

  // 五、supabase-js 只准转接层引入：规则在 eslint 里，这里只确认它没被删掉。
  const eslintConfig = readFileSync(path.join(root, "eslint.config.mjs"), "utf8");
  const supabaseRuleIntact =
    eslintConfig.includes("@supabase/supabase-js")
    && eslintConfig.includes("no-restricted-imports")
    && /\bsupabaseAdapterFiles\b/.test(eslintConfig);
  if (!supabaseRuleIntact) {
    problems.push(`[supabase-js 越界保护缺失] eslint.config.mjs 里找不到「只准转接层引入」的规则\n  该用什么：${GUIDANCE.supabaseAdapter}`);
  }

  const ruleCount = RETIRED_PATTERNS.length + 1 + SCAN_RULES.length + registries.length + 1;
  return { problems, notes, ruleCount };
}

function main() {
  const baseArg = process.argv.find((arg) => arg.startsWith("--base="));
  const baseRef = baseArg ? baseArg.slice("--base=".length) : "origin/main";
  const { problems, notes, ruleCount } = runGuard(process.cwd(), baseRef);

  for (const note of notes) console.log(`[forbidden-list] ${note}`);
  if (problems.length > 0) {
    console.error(`❌ 统一禁用清单未通过（${problems.length} 项）：`);
    for (const problem of problems) console.error(`- ${problem}`);
    process.exit(1);
  }
  console.log(`✅ 统一禁用清单通过（${ruleCount} 条规矩：下线功能 ${RETIRED_PATTERNS.length} 条 + 迁移只增不改 + 棘轮 ${SCAN_RULES.length} 条 + 名单 ${4} 个 + supabase-js 转接层确认）`);
}

if (process.argv[1] && isDirectRun(process.argv[1])) {
  main();
}
