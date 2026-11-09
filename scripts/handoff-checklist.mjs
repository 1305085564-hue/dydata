#!/usr/bin/env node
// 交接检查：只读、只报警、不修改交接文档。人工交接环节手动跑，不挂推送钩子。
// 用法：node scripts/handoff-checklist.mjs [交接文档路径]
// 默认检查模板 docs/通用管理/上下文交接.md；实际交接请传 docs/plans/上下文交接/ 下的交接文件。
// 判据（与模板页首铁律一致）：
//   1. 缺强制字段 = 未交接
//   2. 验收证据只有"没问题/测试通过"等自报而无证据对 = 拒收
import { readFileSync } from "node:fs";

const DEFAULT_PATH = "docs/通用管理/上下文交接.md";
const target = process.argv[2] ?? DEFAULT_PATH;

const REQUIRED_FIELDS = [
  { label: "本轮允许上线的范围", pattern: /本轮允许上线的范围/ },
  { label: "已改动清单", pattern: /已改动清单/ },
  { label: "未完成事项", pattern: /未完成事项/ },
  { label: "验收证据", pattern: /验收证据/ },
];

// 自报短语：出现且没有证据对时判拒收。
const SELF_REPORT = /(测试通过|验收通过|全部通过|均已通过|均通过|没问题|一切正常|无异常)/;
// 证据对三要素标签（容忍引用块、列表、加粗等写法）。
const EVIDENCE_LABELS = [
  { label: "要求", pattern: /要求\s*[：:]/ },
  { label: "实际", pattern: /实际\s*[：:]/ },
  { label: "覆盖范围", pattern: /覆盖(?:范围)?\s*[：:]/ },
];

function extractEvidenceSection(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /验收证据/.test(line));
  if (start < 0) return null;
  const body = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^#{1,6}\s/.test(lines[i])) break;
    body.push(lines[i]);
  }
  // 起始行自身可能带内容（如列表项"4. **验收证据**：…"），一并纳入。
  body.unshift(lines[start]);
  return body.join("\n");
}

function check(text) {
  const problems = [];

  for (const field of REQUIRED_FIELDS) {
    if (!field.pattern.test(text)) {
      problems.push(`缺"${field.label}"`);
    }
  }

  const section = extractEvidenceSection(text);
  if (section !== null) {
    const found = EVIDENCE_LABELS.filter((item) => item.pattern.test(section));
    const hasSelfReport = SELF_REPORT.test(section);
    if (found.length === 0) {
      if (hasSelfReport) {
        problems.push('"验收证据"只写了自报（如"测试通过"），没有原始命令和结果');
      } else {
        problems.push('"验收证据"为空，没有任何证据对');
      }
    } else if (found.length < EVIDENCE_LABELS.length) {
      const missing = EVIDENCE_LABELS.filter((item) => !item.pattern.test(section)).map((item) => item.label);
      problems.push(`证据对不完整：缺 ${missing.join("、")}`);
    } else {
      const emptyActual = section
        .split(/\r?\n/)
        .filter((line) => /实际\s*[：:]/.test(line))
        .filter((line) => !line.split(/实际\s*[：:]/)[1].trim());
      if (emptyActual.length > 0) {
        problems.push(`证据对里的"实际"留空（${emptyActual.length} 处），必须给命令+输出/截图/对比结果`);
      }
    }
  }

  return problems;
}

let text;
try {
  text = readFileSync(target, "utf8");
} catch {
  console.log(`❌ 交接检查失败（1 项问题）\n- 文件不存在或不可读：${target}`);
  process.exit(1);
}

const problems = check(text);
if (problems.length === 0) {
  console.log(`✅ 交接检查通过（${target}）`);
} else {
  console.log(`❌ 交接检查失败（${problems.length} 项问题）`);
  for (const problem of problems) console.log(`- ${problem}`);
  console.log(`\n判据：缺强制字段 = 未交接；只说"没问题"不给证据 = 拒收。`);
  process.exit(1);
}
