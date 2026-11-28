import path from "node:path";
import ts from "typescript";

export const ARCH_BASELINE_PATH = "scripts/arch-boundary-baseline.json";
const testPath = /(?:^|\/)(?:__tests__|__fixtures__)\/|\.(?:test|spec)\.[^.]+$/;
const extensions = [".ts", ".tsx", ".mjs", ".js", ".jsx", ".mts", ".cts", ".cjs"];

/** 只解析实际执行的导入/转发；纯 type 声明不会进入运行时图。 */
export function runtimeImports(file, source, includeTypes = false) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const imports = [];
  const add = (node) => { if (node && ts.isStringLiteralLike(node)) imports.push(node.text); };
  const hasRuntimeBindings = (clause) => {
    if (clause.isTypeOnly) return false;
    if (clause.name) return true;
    const bindings = clause.namedBindings ?? clause.exportClause;
    return !bindings || !ts.isNamedImports(bindings) && !ts.isNamedExports(bindings)
      || bindings.elements.length === 0 || bindings.elements.some((element) => !element.isTypeOnly);
  };
  const visit = (node) => {
    if (includeTypes && ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      add(node.argument.literal);
    } else if (ts.isImportDeclaration(node)) {
      if (includeTypes || !node.importClause || hasRuntimeBindings(node.importClause)) add(node.moduleSpecifier);
    } else if (ts.isExportDeclaration(node)) {
      if (includeTypes || hasRuntimeBindings(node)) add(node.moduleSpecifier);
    } else if (ts.isImportEqualsDeclaration(node) && (includeTypes || !node.isTypeOnly) && ts.isExternalModuleReference(node.moduleReference)) {
      add(node.moduleReference.expression);
    } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === "require")) {
      add(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return [...new Set(imports)];
}

export function resolveModule(file, specifier, sources) {
  const stem = specifier.startsWith("@/") ? path.posix.normalize(`src/${specifier.slice(2)}`)
    : specifier.startsWith(".") ? path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier)) : null;
  if (!stem) return null;
  const withoutExtension = stem.replace(/\.(?:js|jsx|mjs|cjs)$/, "");
  const candidates = [stem, ...extensions.map((extension) => withoutExtension + extension), ...extensions.map((extension) => `${stem}/index${extension}`)];
  return candidates.find((candidate) => Object.hasOwn(sources, candidate)) ?? null;
}

function stronglyConnected(graph) {
  const indices = new Map();
  const low = new Map();
  const stack = [];
  const active = new Set();
  const components = [];
  let index = 0;
  const visit = (node) => {
    indices.set(node, index); low.set(node, index++); stack.push(node); active.add(node);
    for (const next of graph.get(node) ?? []) {
      if (!indices.has(next)) { visit(next); low.set(node, Math.min(low.get(node), low.get(next))); }
      else if (active.has(next)) low.set(node, Math.min(low.get(node), indices.get(next)));
    }
    if (low.get(node) === indices.get(node)) {
      const component = [];
      let next;
      do { next = stack.pop(); active.delete(next); component.push(next); } while (next !== node);
      components.push(component.sort());
    }
  };
  for (const node of [...graph.keys()].sort()) if (!indices.has(node)) visit(node);
  return components;
}

function pathBack(graph, from, to, component) {
  const queue = [[from]];
  const seen = new Set([from]);
  for (let index = 0; index < queue.length; index++) {
    const route = queue[index];
    const last = route.at(-1);
    if (last === to) return route;
    for (const next of graph.get(last) ?? []) {
      if (component.has(next) && !seen.has(next)) { seen.add(next); queue.push([...route, next]); }
    }
  }
  return [];
}

/** 用环内的精确有向边锁基线，避免只记 SCC 名字后同一组模块能悄悄增加新环。 */
export function scanArchitecture(sources) {
  const graph = new Map();
  const boundaries = [];
  for (const file of Object.keys(sources).sort()) {
    if (!file.startsWith("src/lib/") || testPath.test(file) || /\.d\.ts$/.test(file)) continue;
    const targets = runtimeImports(file, sources[file]).map((specifier) => resolveModule(file, specifier, sources)).filter(Boolean);
    graph.set(file, [...new Set(targets.filter((target) => target.startsWith("src/lib/") && !testPath.test(target) && !/\.d\.ts$/.test(target)))].sort());
    const allTargets = runtimeImports(file, sources[file], true).map((specifier) => resolveModule(file, specifier, sources)).filter(Boolean);
    for (const target of new Set(allTargets)) {
      if (/^src\/(?:app|components)\//.test(target)) boundaries.push({ key: `${file} -> ${target}`, file, target });
    }
  }
  const cycles = [];
  const components = stronglyConnected(graph).filter((nodes) => nodes.length > 1 || graph.get(nodes[0])?.includes(nodes[0]));
  for (const nodes of components) {
    const component = new Set(nodes);
    for (const file of nodes) for (const target of graph.get(file) ?? []) {
      if (component.has(target)) cycles.push({ key: `${file} -> ${target}`, file, target, path: [file, ...pathBack(graph, target, file, component)] });
    }
  }
  return { moduleCount: graph.size, components, cycles, boundaries };
}

/** 当前名单必须带理由，且不能超出基线版本；首次装门禁也只能豁免原已存在的依赖。 */
export function checkArchitecture(sources, baseline = {}, baseBaseline = null, baseSources = {}) {
  const scan = scanArchitecture(sources);
  const original = baseBaseline ? null : scanArchitecture(baseSources);
  const violations = [];
  for (const kind of ["cycles", "boundaries"]) {
    const allowed = baseline[kind] ?? {};
    const previous = baseBaseline?.[kind] ?? Object.fromEntries((original?.[kind] ?? []).map((entry) => [entry.key, true]));
    for (const [key, reason] of Object.entries(allowed)) {
      if (typeof reason !== "string" || !reason.trim()) violations.push({ type: "architecture-baseline", path: ARCH_BASELINE_PATH, detail: `${kind}: ${key} 缺少保留理由` });
      if (!Object.hasOwn(previous, key)) violations.push({ type: "architecture-baseline", path: ARCH_BASELINE_PATH, detail: `${kind}: ${key} 新增豁免，基线只准减不准增` });
    }
    for (const entry of scan[kind]) {
      if (Object.hasOwn(allowed, entry.key) && Object.hasOwn(previous, entry.key) && typeof allowed[entry.key] === "string" && allowed[entry.key].trim()) continue;
      violations.push({
        type: kind === "cycles" ? "runtime-cycle" : "layer-boundary",
        path: entry.file,
        detail: kind === "cycles" ? `${entry.path.join(" -> ")}；移出共享常量/纯函数，或改用 import type 解耦，禁止新增运行时环。`
          : `${entry.key}；src/lib/ 禁止反向导入 src/app/ 或 src/components/；共享逻辑应下沉到 src/lib/。`,
      });
    }
  }
  return { ...scan, violations };
}
