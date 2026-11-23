#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const rootArgument = process.argv.indexOf("--scan-root");
const root = rootArgument >= 0 ? path.resolve(process.argv[rootArgument + 1] ?? process.cwd()) : process.cwd();
// 白名单单独放在 JSON 里（条目带理由），统一禁用清单会核对它只减不增；不要在这个文件里手写名单。
const allowlistFile = path.join(process.cwd(), "scripts/screenshot-storage-allowlist.json");
const allowlist = JSON.parse(fs.readFileSync(allowlistFile, "utf8"));
const productionAllowlist = new Set((allowlist.production ?? []).map((entry) => entry.path));
const scriptAllowlist = new Set((allowlist.scripts ?? []).map((entry) => entry.path));
const migrationAllowlist = new Set((allowlist.migrations ?? []).map((entry) => entry.path));
const storageMethods = new Set(["upload", "download", "list", "remove", "createSignedUrl", "createSignedUrls", "getPublicUrl", "copy", "move"]);

function walk(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(target);
    return target;
  });
}

function relative(file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function sourceFiles() {
  const candidates = ["src", "scripts", "supabase"].flatMap((directory) => walk(path.join(root, directory)));
  return candidates.filter((file) => /\.(?:ts|tsx|js|jsx|mjs|sql)$/.test(file));
}

/**
 * 已知限制（2026-10-21 实测确认，属接受范围）：
 * 只识别 `X.storage.from(...)` 链式写法。以下两种能绕过，但需要有人故意这么写：
 *   const s = supabase.storage; s.from(b).upload(...)
 *   supabase["storage"].from(b).remove([...])
 * 若要收紧需追踪标识符来源，成本约 40–60 行，当前不做；修改此处前先补 fixture。
 */
function isStorageCall(node) {
  if (!ts.isCallExpression(node)) return false;
  const expression = node.expression;
  if (!ts.isPropertyAccessExpression(expression)) return false;
  if (!storageMethods.has(expression.name.text)) return false;
  const fromCall = expression.expression;
  if (!ts.isCallExpression(fromCall) || !ts.isPropertyAccessExpression(fromCall.expression) || fromCall.expression.name.text !== "from") return false;
  const storage = fromCall.expression.expression;
  return ts.isPropertyAccessExpression(storage) && storage.name.text === "storage";
}

/**
 * 把注释整体替换为等长空白，保留字节偏移与行号。
 * 注释里提到 storage.objects / /storage/v1/object/ 属于说明文字，不构成违规；
 * 但不能用正则粗暴截 //（会把 https:// 一并截断，造成漏报），所以走 TS 扫描器。
 */
function stripComments(text) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, text);
  let result = "";
  let cursor = 0;
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token !== ts.SyntaxKind.SingleLineCommentTrivia && token !== ts.SyntaxKind.MultiLineCommentTrivia) continue;
    const start = scanner.getTokenPos();
    const end = scanner.getTextPos();
    result += text.slice(cursor, start) + " ".repeat(end - start);
    cursor = end;
  }
  return result + text.slice(cursor);
}

function scanFile(file) {
  const rel = relative(file);
  if (productionAllowlist.has(rel) || scriptAllowlist.has(rel) || migrationAllowlist.has(rel)) return [];
  const sourceText = fs.readFileSync(file, "utf8");
  const findings = [];
  if (/\.(?:ts|tsx|js|jsx|mjs)$/.test(file)) {
    const extension = path.extname(file);
    const scriptKind = extension === ".tsx" ? ts.ScriptKind.TSX : extension === ".js" || extension === ".mjs" ? ts.ScriptKind.JS : ts.ScriptKind.TS;
    const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, scriptKind);
    function visit(node) {
      if (isStorageCall(node)) {
        findings.push(`${rel}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}: Supabase Storage 操作必须通过 src/lib/screenshot-storage.ts`);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  const directStorageUrl = /(?:https?:\/\/|\$\{[^}]+\})[^\n]*\/storage\/v1\/object\/(?:public|authenticated|sign|list)\/|storage\.objects/i;
  const codeText = stripComments(sourceText);
  if (!rel.includes(".test.") && directStorageUrl.test(codeText) && /submission-screenshots/i.test(codeText)) {
    const match = codeText.match(directStorageUrl);
    if (match && match.index !== undefined) {
      const line = codeText.slice(0, match.index).split(/\r?\n/).length;
      findings.push(`${rel}:${line}: 不得绕过截图存储适配器直接操作 Supabase Storage 或拼接其 URL`);
    }
  }
  return findings;
}

const findings = sourceFiles().flatMap(scanFile);
if (findings.length) {
  console.error(findings.join("\n"));
  process.exit(1);
}
console.log("[screenshot-storage-boundary] PASS");
