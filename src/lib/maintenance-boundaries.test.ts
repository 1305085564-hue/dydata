import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import test from "node:test";
import ts from "typescript";

const repoRoot = resolve(process.cwd());
const appRoot = resolve(repoRoot, "src/app");

const boundaryFiles = [
  "src/lib/ai-config/key-patch.ts",
  "src/lib/ai-config/swap-key-priority.ts",
  "src/lib/content-comparison-reference.ts",
  "src/lib/loaders/dashboard-activity.ts",
  "src/lib/loaders/dashboard-page.ts",
  "src/lib/dashboard-submission-state.ts",
];

function readModuleSpecifiers(filePath: string) {
  const source = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const specifiers: string[] = [];

  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      specifiers.push(node.moduleSpecifier.text);
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      specifiers.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers;
}

function resolveImportPath(importerPath: string, specifier: string) {
  if (specifier.startsWith("@/")) return resolve(repoRoot, "src", specifier.slice(2));
  if (specifier.startsWith(".")) return resolve(dirname(importerPath), specifier);
  return null;
}

test("三组已治理 lib 工具不能反向依赖 src/app", () => {
  for (const relativePath of boundaryFiles) {
    const filePath = resolve(repoRoot, relativePath);
    const appImports = readModuleSpecifiers(filePath)
      .map((specifier) => resolveImportPath(filePath, specifier))
      .filter((importPath): importPath is string => Boolean(importPath))
      .filter((importPath) => importPath === appRoot || importPath.startsWith(`${appRoot}/`));

    assert.deepEqual(appImports, [], `${relativePath} must not import src/app`);
  }
});

test("Dashboard helper 已从页面目录移除，旧路径不保留转发壳", () => {
  const oldPaths = [
    "src/app/(app)/dashboard/video-submit-panel-state.ts",
    "src/app/(app)/dashboard/video-submit-panel-state.test.ts",
  ];

  for (const relativePath of oldPaths) {
    assert.equal(existsSync(resolve(repoRoot, relativePath)), false, relativePath);
  }

  assert.equal(
    existsSync(resolve(repoRoot, "src/lib/dashboard-submission-state.ts")),
    true,
    relative(repoRoot, resolve(repoRoot, "src/lib/dashboard-submission-state.ts")),
  );
});
