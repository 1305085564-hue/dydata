#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX = "docs/reference/文档归口现状.md";
const SKIP_DIRS = new Set([".git", "node_modules", ".next", "dist", "coverage", "output", ".turbo"]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".sql", ".sh", ".py"]);
const FILE_EXTENSIONS = new Set([".md", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".sql", ".sh", ".py", ".json", ".css", ".scss", ".html", ".yaml", ".yml", ".toml"]);
const BUILTIN_FUNCTIONS = new Set(["btrim", "cache", "floor", "includes", "lower", "max", "min", "toISOString"]);

function relative(file, root = ROOT) {
  return path.relative(root, file).split(path.sep).join("/");
}

function linesOutsideFences(text) {
  let fence = null;
  return text.split(/\r?\n/).map((line, index) => {
    const opening = line.match(/^\s*(```+|~~~+)/)?.[1];
    const inside = fence !== null;
    if (opening && (!fence || opening.startsWith(fence))) fence = fence ? null : opening.slice(0, 3);
    return { line, number: index + 1, insideFence: inside || Boolean(opening) };
  });
}

function maskInlineCode(line) {
  return line.replace(/`+[^`]*`+/g, (match) => " ".repeat(match.length));
}

function markdownLinks(line) {
  const links = [];
  for (let cursor = 0; cursor < line.length;) {
    const start = line.indexOf("](", cursor);
    if (start < 0) break;
    let index = start + 2;
    let target = "";
    if (line[index] === "<") {
      const end = line.indexOf(">", index + 1);
      if (end < 0 || line[end + 1] !== ")") {
        cursor = index + 1;
        continue;
      }
      target = line.slice(index + 1, end);
      cursor = end + 2;
    } else {
      let depth = 1;
      const targetStart = index;
      while (index < line.length && depth > 0) {
        if (line[index] === "\\") {
          index += 2;
          continue;
        }
        if (line[index] === "(") depth += 1;
        else if (line[index] === ")") depth -= 1;
        index += 1;
      }
      if (depth !== 0) {
        cursor = targetStart;
        continue;
      }
      target = line.slice(targetStart, index - 1).trim().split(/\s+/, 1)[0];
      cursor = index;
    }
    if (target) links.push(target);
  }
  return links;
}

function maskMarkdownTargets(line) {
  const masked = line.split("");
  for (let cursor = 0; cursor < line.length;) {
    const start = line.indexOf("](", cursor);
    if (start < 0) break;
    const targetStart = start + 2;
    let end = targetStart;
    if (line[end] === "<") {
      const close = line.indexOf(">", end + 1);
      if (close >= 0 && line[close + 1] === ")") end = close + 1;
      else { cursor = targetStart; continue; }
    } else {
      let depth = 1;
      while (end < line.length && depth > 0) {
        if (line[end] === "\\") { end += 2; continue; }
        if (line[end] === "(") depth += 1;
        else if (line[end] === ")") depth -= 1;
        end += 1;
      }
      if (depth !== 0) { cursor = targetStart; continue; }
      end -= 1;
    }
    for (let index = targetStart; index < end; index += 1) masked[index] = " ";
    cursor = end + 1;
  }
  return masked.join("");
}

function decodeTarget(target) {
  try {
    return decodeURIComponent(target);
  } catch {
    return target;
  }
}

function fileTarget(raw) {
  let target = decodeTarget(raw.trim());
  if (!target || /^(?:https?:|mailto:|data:|javascript:|#)/i.test(target)) return null;
  target = target.split("#", 1)[0].split("?", 1)[0];
  target = target.replace(/:\d+(?:-\d+)?$/, "");
  if (!target) return null;
  return target.startsWith("/") ? target.slice(1) : target;
}

function extractCurrentBasis(root = ROOT) {
  const indexPath = path.join(root, INDEX);
  const rows = linesOutsideFences(readFileSync(indexPath, "utf8"));
  let inSection = false;
  const documents = new Set();
  for (const row of rows) {
    if (/^##\s+一、当前依据/.test(row.line)) {
      inSection = true;
      continue;
    }
    if (inSection && /^##\s+/.test(row.line)) break;
    if (!inSection || row.insideFence) continue;
    for (const href of markdownLinks(maskInlineCode(row.line))) {
      const target = fileTarget(href);
      if (!target || !target.toLowerCase().endsWith(".md")) continue;
      documents.add(path.resolve(path.dirname(indexPath), target));
    }
  }
  return [...documents].sort();
}

function walkSourceFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
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
      if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
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

function scan(root = ROOT, deep = false) {
  const indexPath = path.join(root, INDEX);
  const docs = extractCurrentBasis(root);
  const code = collectCode(root);
  const repoFiles = walkRepoFiles(root);
  const repoFileSet = new Set(repoFiles.map((file) => path.resolve(file)));
  const repoBasenames = new Set(repoFiles.map((file) => path.basename(file)));
  const issues = [];
  for (const docPath of docs) {
    if (!existsSync(docPath) || !statSync(docPath).isFile()) {
      addIssue(issues, INDEX, 1, "当前依据", relative(docPath, root), "归口清单列出的文档不存在");
      continue;
    }
    const doc = relative(docPath, root);
    const rows = linesOutsideFences(readFileSync(docPath, "utf8"));
    let tableSection = false;
    for (let index = 0; index < rows.length; index += 1) {
      const { line, number, insideFence } = rows[index];
      const heading = line.match(/^#{1,6}\s+(.+)/)?.[1] ?? "";
      if (/表关系|数据表|核心数据表/.test(heading)) tableSection = true;
      else if (/^#{1,6}\s+/.test(line)) tableSection = false;

      if (!insideFence) {
        const visibleLine = maskInlineCode(line);
        for (const href of markdownLinks(visibleLine)) {
          const target = fileTarget(href);
          if (!target) continue;
          const absolute = path.resolve(path.dirname(docPath), target);
          if (!existsSync(absolute)) addIssue(issues, doc, number, "内部链接", target, "指向的文件不存在");
        }

        const filePaths = new Set(findInlineCode(line).flatMap(pathCandidates));
        const plainText = maskInlineCode(maskMarkdownTargets(line));
        for (const match of plainText.matchAll(/(?:^|[^\w`])((?:src|scripts|supabase|docs|public|tests?)\/[^\s`<>)\],|]+)/g)) {
          for (const candidate of pathCandidates(match[1])) filePaths.add(candidate);
        }
        for (const candidate of filePaths) {
          const target = fileTarget(candidate);
          if (!target) continue;
          const absolute = path.resolve(root, target);
          const suffix = `/${target.replace(/^\.\//, "")}`;
          const exists = target.includes("/")
            ? repoFileSet.has(absolute) || existsSync(absolute) || [...repoFileSet].some((file) => file.endsWith(suffix))
            : repoBasenames.has(target);
          const explicitlyHistorical = /(?:已删除|已下线|已退役|不存在|查无此项)/.test(line);
          if (!exists && !explicitlyHistorical) addIssue(issues, doc, number, "文件路径", candidate, "仓库中找不到该路径");
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
  return { docs: docs.length, issues, indexPath };
}

function printResult(result, deep) {
  if (deep) console.log(`深度扫描（${result.docs} 份当前依据）：函数声明、文档显式参数签名与类型定义（可能误报：方法、生成代码和历史迁移无法仅靠静态文本完全判定）`);
  else console.log(`基础扫描（${result.docs} 份当前依据）：链接、文件路径、表名和函数名（可能误报：历史别名或生成文件）`);
  if (result.issues.length === 0) {
    console.log("✅ 文档引用检查通过");
    return;
  }
  console.log(`❌ 文档引用检查失败（${result.issues.length} 项待核）`);
  for (const issue of result.issues) {
    console.log(`- ${issue.doc}:${issue.line} ${issue.category}「${issue.target}」：${issue.detail}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const deep = process.argv.includes("--deep");
  const unknownArgs = process.argv.slice(2).filter((arg) => arg !== "--deep");
  if (unknownArgs.length) {
    console.error(`未知参数：${unknownArgs.join(" ")}；可用参数：--deep`);
    process.exitCode = 2;
  } else {
    try {
      const result = scan(ROOT, deep);
      printResult(result, deep);
      if (result.issues.length) process.exitCode = 1;
    } catch (error) {
      console.error(`❌ 文档引用检查无法完成：${error.message}`);
      process.exitCode = 2;
    }
  }
}

export { extractCurrentBasis, fileTarget, markdownLinks, pathCandidates, scan };
