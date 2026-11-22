// 文档链接工具：解析 Markdown 链接、判断目标是否存在、给失效链接找新位置、改写链接。
// 由 doc-health-check.mjs 使用；单独成文件是为了让「查链接」和「改链接」共用同一套解析，不各写一份。
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

export const SKIP_DIRS = new Set([".git", "node_modules", ".next", "dist", "coverage", "output", ".turbo"]);
export const MISSING_NOTE = "原稿已不在仓库";

// 文件被改名（不只是挪目录）时，按文件名找不到，要在这里登记「旧文件名 → 新位置（相对仓库根）」。
// 按文件名登记，是因为同一份旧文档在不同层级的文档里写成了不同的相对路径。
const RENAMED_DOCS = new Map([
  ["设计与决策.md", "docs/reference/设计与决策/设计与决策总纲.md"],
]);
const ARCHIVE_PREFIX = "docs/archive/";

// .claude/worktrees 下是整仓的隔离副本，扫进去会把副本当成真文件。
export function isSkippedDirectory(root, absolute, name) {
  if (SKIP_DIRS.has(name)) return true;
  return path.relative(root, absolute).split(path.sep).join("/") === ".claude/worktrees";
}

export function linesOutsideFences(text) {
  let fence = null;
  return text.split(/\r?\n/).map((line, index) => {
    const opening = line.match(/^\s*(```+|~~~+)/)?.[1];
    const inside = fence !== null;
    if (opening && (!fence || opening.startsWith(fence))) fence = fence ? null : opening.slice(0, 3);
    return { line, number: index + 1, insideFence: inside || Boolean(opening) };
  });
}

export function maskInlineCode(line) {
  return line.replace(/`+[^`]*`+/g, (match) => " ".repeat(match.length));
}

// 一行里的全部 `[文字](目标)`。start/end 是目标路径在整行里的位置（不含 <>、标题和括号），
// labelEnd 是 `]` 的位置，linkEnd 是收尾 `)` 之后的位置，改写链接要靠这几个位置。
export function markdownLinkRefs(line) {
  const refs = [];
  for (let cursor = 0; cursor < line.length;) {
    const labelEnd = line.indexOf("](", cursor);
    if (labelEnd < 0) break;
    const index = labelEnd + 2;
    if (line[index] === "<") {
      const close = line.indexOf(">", index + 1);
      if (close < 0 || line[close + 1] !== ")") {
        cursor = index + 1;
        continue;
      }
      refs.push({ target: line.slice(index + 1, close), start: index + 1, end: close, labelEnd, linkEnd: close + 2, angle: true });
      cursor = close + 2;
      continue;
    }
    let depth = 1;
    let scan = index;
    while (scan < line.length && depth > 0) {
      if (line[scan] === "\\") {
        scan += 2;
        continue;
      }
      if (line[scan] === "(") depth += 1;
      else if (line[scan] === ")") depth -= 1;
      scan += 1;
    }
    if (depth !== 0) {
      cursor = index;
      continue;
    }
    const inner = line.slice(index, scan - 1);
    const lead = inner.length - inner.trimStart().length;
    const target = inner.trim().split(/\s+/, 1)[0];
    if (target) refs.push({ target, start: index + lead, end: index + lead + target.length, labelEnd, linkEnd: scan, angle: false });
    cursor = scan;
  }
  return refs;
}

export function markdownLinks(line) {
  return markdownLinkRefs(line).map((ref) => ref.target);
}

// 把链接目标挖空，留给「纯文字里的路径」检查用，避免同一条链接被当成两种问题重复报。
export function maskMarkdownTargets(line) {
  const masked = line.split("");
  for (const ref of markdownLinkRefs(line)) {
    for (let index = ref.labelEnd + 2; index < ref.linkEnd - 1; index += 1) masked[index] = " ";
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

// 把目标拆成「文件路径」和「后缀」（锚点 #…、查询 ?…、行号 :12），改路径时后缀原样保留。
export function splitLinkTarget(raw) {
  const cut = raw.search(/[#?]/);
  let pathPart = cut < 0 ? raw : raw.slice(0, cut);
  let suffix = cut < 0 ? "" : raw.slice(cut);
  const lineNumber = pathPart.match(/:\d+(?:-\d+)?$/)?.[0];
  if (lineNumber) {
    pathPart = pathPart.slice(0, -lineNumber.length);
    suffix = lineNumber + suffix;
  }
  return { pathPart, suffix };
}

export function fileTarget(raw) {
  const target = decodeTarget(raw.trim());
  if (!target || /^(?:https?:|mailto:|data:|javascript:|#)/i.test(target)) return null;
  const { pathPart } = splitLinkTarget(target);
  if (!pathPart) return null;
  return pathPart.startsWith("/") ? pathPart.slice(1) : pathPart;
}

// 文件名 → 仓库里所有同名文件。只在真的遇到失效链接时才建（lazyFileIndex）。
export function lazyFileIndex(root) {
  let index = null;
  return () => {
    if (index) return index;
    index = new Map();
    const visit = (directory) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          if (!isSkippedDirectory(root, absolute, entry.name)) visit(absolute);
        } else if (entry.isFile()) {
          index.set(entry.name, [...(index.get(entry.name) ?? []), absolute]);
        }
      }
    };
    visit(root);
    return index;
  };
}

function commonTailLength(left, right) {
  let count = 0;
  while (count < left.length && count < right.length && left[left.length - 1 - count] === right[right.length - 1 - count]) count += 1;
  return count;
}

function relativeFrom(docPath, target) {
  return path.relative(path.dirname(docPath), target).split(path.sep).join("/");
}

// 给一条失效链接找新位置。返回：
//   { kind: "moved", path }        能确定新位置（相对文档所在目录）
//   { kind: "ambiguous", paths }   同名文件有多个且分不出来，要人选
//   { kind: "missing" }            仓库里没有同名文件，多半是原稿已删
export function suggestLinkTarget({ root, docPath, pathPart, getIndex }) {
  const resolved = path.resolve(path.dirname(docPath), pathPart);
  const oldRelative = path.relative(root, resolved).split(path.sep).join("/");
  const renamed = RENAMED_DOCS.get(path.basename(resolved));
  if (renamed && existsSync(path.join(root, renamed))) return { kind: "moved", path: relativeFrom(docPath, path.join(root, renamed)) };
  if (!path.extname(pathPart)) return { kind: "missing" };
  let candidates = getIndex().get(path.basename(resolved)) ?? [];
  // 现行文档原来指向的是现行文件：同名的有现行也有归档时，不往归档副本上指。
  const live = candidates.filter((candidate) => !path.relative(root, candidate).split(path.sep).join("/").startsWith(ARCHIVE_PREFIX));
  if (!oldRelative.startsWith(ARCHIVE_PREFIX) && live.length > 0) candidates = live;
  if (candidates.length === 0) return { kind: "missing" };
  const oldSegments = oldRelative.split("/");
  const scored = candidates.map((candidate) => ({
    candidate,
    score: commonTailLength(oldSegments, path.relative(root, candidate).split(path.sep)),
  }));
  const best = Math.max(...scored.map(({ score }) => score));
  const top = scored.filter(({ score }) => score === best).map(({ candidate }) => candidate);
  if (top.length === 1) return { kind: "moved", path: relativeFrom(docPath, top[0]) };
  return { kind: "ambiguous", paths: top.map((candidate) => relativeFrom(docPath, candidate)).sort() };
}

// 一行里所有指向不存在文件的链接，附带修法建议。fenced 代码块里的行由调用方先跳过。
export function brokenLinksInLine({ line, docPath, root, getIndex }) {
  const broken = [];
  for (const ref of markdownLinkRefs(maskInlineCode(line))) {
    const target = fileTarget(ref.target);
    if (!target) continue;
    if (existsSync(path.resolve(path.dirname(docPath), target))) continue;
    const { pathPart, suffix } = splitLinkTarget(ref.target);
    const suggestion = suggestLinkTarget({ root, docPath, pathPart: target, getIndex });
    broken.push({ ref, target, pathPart, suffix, suggestion });
  }
  return broken;
}

function labelStart(maskedLine, labelEnd) {
  let depth = 0;
  for (let index = labelEnd; index >= 0; index -= 1) {
    if (maskedLine[index] === "]") depth += 1;
    else if (maskedLine[index] === "[") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

// 按建议改写一行；返回新行和统计。ambiguous 永远不改；missing 只有 missingAsText 时才改成纯文字。
export function rewriteLine(line, broken, { missingAsText = false } = {}) {
  const masked = maskInlineCode(line);
  const stats = { moved: 0, text: 0, manual: 0 };
  let next = line;
  for (const item of [...broken].sort((a, b) => b.ref.start - a.ref.start)) {
    const { ref, suggestion, pathPart, suffix } = item;
    if (suggestion.kind === "moved") {
      const encoded = decodeTarget(pathPart) !== pathPart;
      const newPath = encoded ? suggestion.path.split("/").map(encodeURIComponent).join("/") : suggestion.path;
      if (!ref.angle && /[\s()]/.test(newPath)) {
        stats.manual += 1;
        continue;
      }
      next = next.slice(0, ref.start) + newPath + suffix + next.slice(ref.end);
      stats.moved += 1;
    } else if (suggestion.kind === "missing" && missingAsText) {
      const start = labelStart(masked, ref.labelEnd);
      if (start < 0) {
        stats.manual += 1;
        continue;
      }
      const label = next.slice(start + 1, ref.labelEnd);
      next = `${next.slice(0, start)}${label}（${MISSING_NOTE}）${next.slice(ref.linkEnd)}`;
      stats.text += 1;
    } else {
      stats.manual += 1;
    }
  }
  return { line: next, stats };
}

// 给检查报告用：这条失效链接该怎么修。
export function describeFix({ suggestion, suffix }) {
  if (suggestion.kind === "moved") return `文件已挪位置，改成「${suggestion.path}${suffix}」`;
  if (suggestion.kind === "ambiguous") return `仓库里有多个同名文件（${suggestion.paths.join("、")}），人工选定后改`;
  return `仓库里找不到同名文件；原稿确认已删就把链接改成纯文字并注明「${MISSING_NOTE}」，否则补上正确路径`;
}
