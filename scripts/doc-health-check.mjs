#!/usr/bin/env node
// 文档引用检查。三种用法：
//   node scripts/doc-health-check.mjs                    基础扫描：链接、文件路径、表名、函数名（npm run doc:scan）
//   node scripts/doc-health-check.mjs --deep             再加类型定义、函数声明与签名（npm run doc:scan-deep）
//   node scripts/doc-health-check.mjs --links            快速模式：只查链接是否指向存在的文件，秒级，推送前门禁用
//   加 --fix-links                                        先把「文件已挪位置」的链接自动改对；
//   再加 --missing-as-text                                仓库里已找不到的原稿，把链接改成纯文字并注明「原稿已不在仓库」
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  brokenLinksInLine, describeFix, fileTarget, isSkippedDirectory, lazyFileIndex, linesOutsideFences,
  markdownLinks, maskInlineCode, maskMarkdownTargets, rewriteLine,
} from "./doc-links.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY_DOC = "AGENTS.md";
const REFERENCE_DIR = "docs/reference";
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".sql", ".sh", ".py"]);
const FILE_EXTENSIONS = new Set([".md", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".sql", ".sh", ".py", ".json", ".css", ".scss", ".html", ".yaml", ".yml", ".toml"]);
const BUILTIN_FUNCTIONS = new Set(["btrim", "cache", "floor", "includes", "lower", "max", "min", "toISOString"]);

function relative(file, root = ROOT) {
  return path.relative(root, file).split(path.sep).join("/");
}

// 当前依据 = 规则入口 AGENTS.md + docs/reference 下全部 Markdown。
// 2026-11-21 文档重构删掉了「设计与决策.md」里的文件清单，不能再靠清单圈范围，改为按目录圈。
function extractCurrentBasis(root = ROOT) {
  const documents = [];
  const entry = path.join(root, ENTRY_DOC);
  if (existsSync(entry)) documents.push(entry);
  const visit = (directory) => {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) documents.push(absolute);
    }
  };
  visit(path.join(root, REFERENCE_DIR));
  return documents.sort();
}

function walkSourceFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory() && isSkippedDirectory(root, absolute, entry.name)) continue;
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))
          && !/(?:\.test|\.spec)\.[^.]+$/i.test(entry.name)) files.push(absolute);
    }
  };
  visit(root);
  return files;
}

function collectCode(root) {
  const files = walkSourceFiles(root);
  const contents = files.map((file) => ({ file, text: readFileSync(file, "utf8") }));
  const tables = new Set();
  const sqlFunctions = new Set();
  const declarations = new Set();
  const functionSignatures = new Map();
  const types = new Set();

  for (const { text } of contents) {
    for (const match of text.matchAll(/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(?:public|auth)\.)?["`]?([a-z_][a-z\d_]*)/gi)) tables.add(match[1]);
    for (const match of text.matchAll(/\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:(?:public|auth)\.)?["`]?([a-z_][a-z\d_]*)\s*\(([^)]*)\)/gi)) {
      sqlFunctions.add(match[1]);
      addSignature(functionSignatures, match[1], match[2]);
    }
    for (const match of text.matchAll(/\b(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/g)) {
      declarations.add(match[1]);
      addSignature(functionSignatures, match[1], match[2]);
    }
    for (const match of text.matchAll(/\b(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:[A-Za-z_$][\w$]*\s*\(\s*(?:async\s*)?)?(?:async\s*)?\(([^)]*)\)\s*=>/g)) {
      declarations.add(match[1]);
      addSignature(functionSignatures, match[1], match[2]);
    }
    for (const match of text.matchAll(/\b(?:export\s+)?(?:type|interface|class|enum)\s+([A-Za-z_$][\w$]*)\b/g)) types.add(match[1]);
  }
  return { contents, tables, sqlFunctions, declarations, functionSignatures, types };
}

function splitParameters(parameters) {
  const result = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  for (let index = 0; index < parameters.length; index += 1) {
    const character = parameters[index];
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (["'", '"', "`"].includes(character)) quote = character;
    else if ("([{<".includes(character)) depth += 1;
    else if (character === ">" && parameters[index - 1] === "=") continue;
    else if (")]}>".includes(character)) depth -= 1;
    else if (character === "," && depth === 0) {
      result.push(parameters.slice(start, index));
      start = index + 1;
    }
  }
  if (parameters.slice(start).trim()) result.push(parameters.slice(start));
  return result;
}

function signatureParameters(parameters) {
  return splitParameters(parameters).map((parameter) => {
    const match = /^\s*(?:\.\.\.)?([A-Za-z_$][\w$]*)(\?)?\s*(?::|=|\s+[A-Za-z_$]|$)/.exec(parameter);
    return match ? {
      name: match[1],
      optional: Boolean(match[2]),
    } : null;
  });
}

function addSignature(signatures, name, parameters) {
  const parsed = signatureParameters(parameters);
  if (parsed.some((parameter) => parameter === null)) return;
  const values = signatures.get(name) ?? [];
  values.push(parsed);
  signatures.set(name, values);
}

function findInlineCode(line) {
  return [...line.matchAll(/`+([^`]+)`+/g)].map((match) => match[1].trim());
}

function documentedSignatures(value) {
  return [...value.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(([^()]*)\)/g)]
    .map((match) => ({ name: match[1], parameters: signatureParameters(match[2]) }))
    .filter(({ parameters }) => parameters.length > 0 && parameters.every(Boolean));
}

function pathCandidates(value) {
  const candidate = value.trim()
    .replace(/[.,;]+$/, "")
    .replace(/:\d+(?:-\d+)?$/, "")
    .replace(/(\.(?:md|ts|tsx|js|jsx|mjs|cjs|sql|sh|py|json|css|scss|html|ya?ml|toml)):[A-Za-z_$][\w$]*(?:\([^)]*\))?$/i, "$1");
  if (!candidate || /^(?:https?:|mailto:|~\/|\/)/i.test(candidate) || /[*?]/.test(candidate)) return [];
  const hasKnownExtension = FILE_EXTENSIONS.has(path.posix.extname(candidate));
  const hasRepoPrefix = /^(?:src|scripts|supabase|docs|public|tests?)\//.test(candidate);
  if (candidate.includes("/") && (hasKnownExtension || hasRepoPrefix)) return [candidate];
  if (hasKnownExtension && !candidate.includes(" ") && !candidate.includes("/")) return [candidate];
  return [];
}

function walkRepoFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory() && isSkippedDirectory(root, absolute, entry.name)) continue;
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  };
  visit(root);
  return files;
}

function addIssue(issues, doc, line, category, target, detail) {
  const key = `${doc}:${line}:${category}:${target}`;
  if (issues.some((issue) => issue.key === key)) return;
  issues.push({ key, doc, line, category, target, detail });
}

// 被 .gitignore 明确忽略的路径是本地私有文件（如含明文密码的测试账号），本来就不会在仓库里。
function isGitIgnored(root, relativePath) {
  try {
    execFileSync("git", ["check-ignore", "-q", "--no-index", relativePath], { cwd: root, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function addLinkIssues(issues, { doc, docPath, number, line, root, getIndex }) {
  for (const item of brokenLinksInLine({ line, docPath, root, getIndex })) {
    addIssue(issues, doc, number, "内部链接", item.target, `指向的文件不存在 → ${describeFix(item)}`);
  }
}

// 快速模式：只查链接，不读源码、不扫全仓文件，推送前门禁用。
function scanLinks(root = ROOT) {
  const docs = extractCurrentBasis(root);
  const getIndex = lazyFileIndex(root);
  const issues = [];
  for (const docPath of docs) {
    const doc = relative(docPath, root);
    for (const { line, number, insideFence } of linesOutsideFences(readFileSync(docPath, "utf8"))) {
      if (!insideFence) addLinkIssues(issues, { doc, docPath, number, line, root, getIndex });
    }
  }
  return { docs: docs.length, issues };
}

// 自动修链接：文件已挪位置的改成新路径；原稿找不到的，加 missingAsText 才改成纯文字。
function fixLinks(root = ROOT, { missingAsText = false } = {}) {
  const getIndex = lazyFileIndex(root);
  const totals = { files: 0, moved: 0, text: 0, manual: 0 };
  for (const docPath of extractCurrentBasis(root)) {
    const original = readFileSync(docPath, "utf8");
    const raw = original.split("\n");
    const rows = linesOutsideFences(original);
    let changed = false;
    rows.forEach(({ insideFence }, index) => {
      if (insideFence) return;
      const broken = brokenLinksInLine({ line: raw[index], docPath, root, getIndex });
      if (broken.length === 0) return;
      const result = rewriteLine(raw[index], broken, { missingAsText });
      totals.moved += result.stats.moved;
      totals.text += result.stats.text;
      totals.manual += result.stats.manual;
      if (result.line !== raw[index]) {
        raw[index] = result.line;
        changed = true;
      }
    });
    if (changed) {
      writeFileSync(docPath, raw.join("\n"));
      totals.files += 1;
    }
  }
  return totals;
}

function scan(root = ROOT, deep = false) {
  const docs = extractCurrentBasis(root);
  const code = collectCode(root);
  const repoFiles = walkRepoFiles(root);
  const repoFileSet = new Set(repoFiles.map((file) => path.resolve(file)));
  const repoBasenames = new Set(repoFiles.map((file) => path.basename(file)));
  const getIndex = lazyFileIndex(root);
  const issues = [];
  for (const docPath of docs) {
    const doc = relative(docPath, root);
    const rows = linesOutsideFences(readFileSync(docPath, "utf8"));
    let tableSection = false;
    for (let index = 0; index < rows.length; index += 1) {
      const { line, number, insideFence } = rows[index];
      const heading = line.match(/^#{1,6}\s+(.+)/)?.[1] ?? "";
      if (/表关系|数据表|核心数据表/.test(heading)) tableSection = true;
      else if (/^#{1,6}\s+/.test(line)) tableSection = false;

      if (!insideFence) {
        addLinkIssues(issues, { doc, docPath, number, line, root, getIndex });

        const filePaths = new Set(findInlineCode(line).flatMap(pathCandidates));
        const plainText = maskInlineCode(maskMarkdownTargets(line));
        for (const match of plainText.matchAll(/(?:^|[^\w`])((?:src|scripts|supabase|docs|public|tests?)\/[^\s`<>)\],|]+)/g)) {
          for (const candidate of pathCandidates(match[1])) filePaths.add(candidate);
        }
        for (const candidate of filePaths) {
          const target = fileTarget(candidate);
          if (!target || /YYYY|MM-DD/.test(target)) continue; // 日期占位符（如 日志/YYYY-MM-DD.md）不是真路径
          const absolute = path.resolve(root, target);
          const suffix = `/${target.replace(/^\.\//, "")}`;
          const exists = target.includes("/")
            ? repoFileSet.has(absolute) || existsSync(absolute) || [...repoFileSet].some((file) => file.endsWith(suffix))
            : repoBasenames.has(target);
          const explicitlyHistorical = /(?:已删除|已下线|已退役|不存在|查无此项)/.test(line);
          if (!exists && !explicitlyHistorical && !isGitIgnored(root, target)) addIssue(issues, doc, number, "文件路径", candidate, "仓库中找不到该路径");
        }
      }

      const codeRefs = findInlineCode(line);
      for (const value of codeRefs) {
        const publicFunction = value.match(/\bpublic\.([a-z][a-z\d_]*)\s*\(/)?.[1]
          ?? value.match(/\bpublic\.([a-z][a-z\d_]*)\b/)?.[1];
        const callName = value.match(/^(?:([a-z][A-Za-z\d_]*)|public\.([a-z][A-Za-z\d_]*))\s*\([^]*\)$/)?.slice(1).find(Boolean);
        const sqlFunction = value.match(/\bfunction\s+(?:public\.)?([a-z][a-z\d_]*)\b/i)?.[1];
        const functionName = publicFunction ?? sqlFunction ?? (callName && !/\([^)]*\b[A-Za-z_$][\w$]*\s*=/.test(value) ? callName : null);
        if (functionName && !BUILTIN_FUNCTIONS.has(functionName)
            && !code.declarations.has(functionName) && !code.sqlFunctions.has(functionName)) {
          addIssue(issues, doc, number, "函数名", functionName, "仓库源码/迁移中未找到同名函数；静态匹配可能误报");
        }

        const tableName = value.match(/^(?:public\.)?([a-z][a-z\d_]*)(?:\s*\([^)]*\b[A-Za-z_$][\w$]*\s*=\s*[^)]*\))?$/)?.[1]
          ?? value.match(/^(?:public\.)?([a-z][a-z\d_]*)$/)?.[1];
        const tableContext = tableSection || /(?:数据表|表名|表关系|表\s+|table\s*[:：])/i.test(line)
          || /\([^)]*\b[A-Za-z_$][\w$]*\s*=\s*[^)]*\)/.test(value)
          || /(?:数据表|表名|表关系|table)/i.test(rows[index - 1]?.line ?? "");
        if (tableName && tableContext && !code.tables.has(tableName)) {
          addIssue(issues, doc, number, "表名", tableName, "迁移源码中未找到同名建表定义；静态匹配可能误报");
        }

        if (deep) {
          const typeName = value.match(/^[A-Z][A-Za-z\d]*$/)?.[0];
          const typeContext = /(?:类型|type|interface|响应|参数|字段定义)/i.test(line)
            || /(?:类型|type|interface|响应|参数|字段定义)/i.test(rows[index - 1]?.line ?? "");
          if (typeName && typeContext && !code.types.has(typeName)) {
            addIssue(issues, doc, number, "类型定义", typeName, "源码中未找到同名类型声明；静态匹配可能误报");
          }
          const declaredFunction = callName;
          const declarationContext = /(?:函数|方法|签名|调用|入口|RPC)/i.test(line)
            || /(?:函数|方法|签名|调用|入口|RPC)/i.test(rows[index - 1]?.line ?? "");
          if (declaredFunction && declarationContext && !BUILTIN_FUNCTIONS.has(declaredFunction)
              && !code.declarations.has(declaredFunction) && !code.sqlFunctions.has(declaredFunction)) {
            addIssue(issues, doc, number, "函数声明", declaredFunction, "源码/迁移中未找到函数声明；方法或生成代码可能误报");
          }
          const signatureContext = /(?:函数签名|接口签名|参数列表|函数参数|签名)/i.test(line)
            || /(?:函数签名|接口签名|参数列表|函数参数|签名)/i.test(rows[index - 1]?.line ?? "")
            || (/(?:函数|方法|入口|RPC)/i.test(line)
              && /\b[A-Za-z_$][\w$]*\?\s*(?:,|\))/.test(value));
          if (signatureContext) {
            for (const signature of documentedSignatures(value)) {
              const actual = code.functionSignatures.get(signature.name) ?? [];
              const matches = actual.some((candidate) => candidate.length === signature.parameters.length
                && candidate.every((parameter, parameterIndex) => {
                  const documented = signature.parameters[parameterIndex];
                  return parameter.name === documented.name && (!documented.optional || parameter.optional);
                }));
              if (actual.length && !matches) {
                addIssue(issues, doc, number, "函数签名", signature.name, "文档参数名/数量或明确标出的可选参数与源码声明不一致；静态匹配可能误报");
              }
            }
          }
        }
      }
    }
  }
  return { docs: docs.length, issues };
}

function printResult(result, mode) {
  if (mode === "links") console.log(`快速链接检查（${result.docs} 份当前依据）：只核对链接指向的文件是否存在`);
  else if (mode === "deep") console.log(`深度扫描（${result.docs} 份当前依据）：函数声明、文档显式参数签名与类型定义（可能误报：方法、生成代码和历史迁移无法仅靠静态文本完全判定）`);
  else console.log(`基础扫描（${result.docs} 份当前依据）：链接、文件路径、表名和函数名（可能误报：历史别名或生成文件）`);
  if (result.issues.length === 0) {
    console.log("✅ 文档引用检查通过");
    return;
  }
  console.log(`❌ 文档引用检查失败（${result.issues.length} 项待核）`);
  for (const issue of result.issues) {
    console.log(`- ${issue.doc}:${issue.line} ${issue.category}「${issue.target}」：${issue.detail}`);
  }
  if (result.issues.some((issue) => issue.category === "内部链接")) {
    console.log("修法：逐条按上面的提示改；文件挪位置的可一键修：node scripts/doc-health-check.mjs --links --fix-links（原稿已删的再加 --missing-as-text），改完看 git diff 再提交。");
  }
}

const FLAGS = ["--deep", "--links", "--fix-links", "--missing-as-text"];

function main(args) {
  const unknownArgs = args.filter((arg) => !FLAGS.includes(arg));
  if (unknownArgs.length) {
    console.error(`未知参数：${unknownArgs.join(" ")}；可用参数：${FLAGS.join(" ")}`);
    return 2;
  }
  const deep = args.includes("--deep");
  const linksOnly = args.includes("--links");
  if (deep && linksOnly) {
    console.error("--deep 和 --links 不能同时用：--links 是只查链接的快速模式");
    return 2;
  }
  if (args.includes("--missing-as-text") && !args.includes("--fix-links")) {
    console.error("--missing-as-text 要和 --fix-links 一起用");
    return 2;
  }
  try {
    if (args.includes("--fix-links")) {
      const fixed = fixLinks(ROOT, { missingAsText: args.includes("--missing-as-text") });
      console.log(`自动修链接：改成新路径 ${fixed.moved} 条，改成纯文字 ${fixed.text} 条，仍需人工 ${fixed.manual} 条（涉及 ${fixed.files} 份文档）`);
    }
    const mode = linksOnly ? "links" : deep ? "deep" : "base";
    const result = linksOnly ? scanLinks(ROOT) : scan(ROOT, deep);
    printResult(result, mode);
    return result.issues.length ? 1 : 0;
  } catch (error) {
    console.error(`❌ 文档引用检查无法完成：${error.message}`);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}

export { extractCurrentBasis, fileTarget, fixLinks, markdownLinks, pathCandidates, scan, scanLinks };
