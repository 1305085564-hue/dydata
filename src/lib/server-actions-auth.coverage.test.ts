import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const root = process.cwd();
// 精确到统一入口的模块和符号；同名本地空函数、注释、字符串不能冒充鉴权。
const guards = new Map([
  ["src/lib/current-user-context.ts#getCurrentUserContext", "CloudBase 会话验证包含在职状态检查"],
  ["src/lib/current-permission-context.ts#getCurrentPermissionContext", "统一身份、在职状态和可信范围"],
  ["src/lib/permissions.ts#getUserPermissions", "统一固定权限和在职身份"],
  ["src/lib/admin-auth.ts#requireAdminActor", "管理权限入口"],
  ["src/lib/admin-auth.ts#requireAdminContext", "管理权限和范围入口"],
  ["src/lib/cloudbase/auth-client.ts#getUser", "本人连接的会话验证包含在职状态检查"],
  ["src/app/(app)/admin/collaboration/work-group-write.ts#runWorkGroupAction", "受审计的统一小队写入口，服务端注入 resolveContext，检查管理角色和可信团队"],
  ["src/app/(app)/admin/modules/work-group-member-write.ts#assignMemberWorkGroupForManagement", "受审计的统一成员小队入口，服务端注入权限上下文并校验目标归属"],
  ["src/app/(app)/admin/modules/work-group-member-write.ts#unassignMemberWorkGroupForManagement", "同上，解除归属也校验管理角色与目标团队"],
]);
const exemptions = new Map([
  ["src/app/(auth)/login/page.tsx#inline:loginAction", "公开登录入口，以账号密码认证，在职状态由 CloudBase 登录验证"],
  ["src/app/(auth)/register/page.tsx#inline:registerAction", "公开员工注册入口，固定角色、服务端注册事务校验，不接收管理角色"],
  ["src/lib/account-actions.ts#signOut", "仅撤销本人会话与截图 Cookie；未登录或归档仍应允许退出"],
  ...["assignWorkGroupMemberAction", "unassignWorkGroupMemberAction", "assignWorkGroupMembersAction"].map((name) => [
    `src/app/(app)/admin/collaboration/work-group-actions.ts#${name}`,
    "已退役入口，无条件返回 403，不读写数据",
  ] as const),
]);

function key(file: ts.SourceFile, name: string) {
  return `${path.relative(root, file.fileName).split(path.sep).join("/")}#${name}`;
}
function isServerBody(statements: ts.NodeArray<ts.Statement>) {
  for (const statement of statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) break;
    if (statement.expression.text === "use server") return true;
  }
  return false;
}

function consumesResult(call: ts.CallExpression) {
  let parent: ts.Node = call;
  let awaited = false;
  while (parent.parent && !ts.isFunctionLike(parent.parent)) {
    parent = parent.parent;
    if (ts.isAwaitExpression(parent)) awaited = true;
    if (ts.isReturnStatement(parent)) return true; // 包括薄委托 return guardedAction(...)
    if (ts.isVariableDeclaration(parent) || (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken)) return awaited;
    if (ts.isStatement(parent)) return false;
  }
  return false;
}

function audit(program: ts.Program, files: readonly ts.SourceFile[], exceptions = exemptions) {
  const checker = program.getTypeChecker();
  const entries: Array<{ id: string; declaration: ts.Declaration }> = [];
  const seenExemptions = new Set<string>();
  const resolve = (symbol: ts.Symbol | undefined): ts.Symbol | undefined =>
    symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;

  function guarded(node: ts.Node, seen = new Set<ts.Node>()): boolean {
    if (seen.has(node)) return false;
    seen.add(node);
    let found = false;
    function visit(child: ts.Node) {
      // 未调用的嵌套函数不能给外层入口提供鉴权证明。
      if (child !== node && ts.isFunctionLike(child)) return;
      if (ts.isCallExpression(child)) {
        const target = ts.isPropertyAccessExpression(child.expression) ? child.expression.name : child.expression;
        const symbol = resolve(checker.getSymbolAtLocation(target));
        for (const declaration of symbol?.declarations ?? []) {
          if (!consumesResult(child)) continue;
          if (guards.has(key(declaration.getSourceFile(), symbol!.name))) found = true;
          else if (ts.isFunctionDeclaration(declaration) || ts.isMethodDeclaration(declaration)) {
            if (declaration.body && guarded(declaration.body, seen)) found = true;
          } else if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
            const value = declaration.initializer;
            if ((ts.isArrowFunction(value) || ts.isFunctionExpression(value)) && guarded(value.body, seen)) found = true;
          }
        }
      }
      ts.forEachChild(child, visit);
    }
    visit(node);
    return found;
  }

  for (const file of files) {
    if (isServerBody(file.statements)) {
      const symbol = checker.getSymbolAtLocation(file);
      for (const exported of symbol ? checker.getExportsOfModule(symbol) : []) {
        const value = resolve(exported);
        if (!value || !(value.flags & ts.SymbolFlags.Value)) continue;
        const declaration = value.valueDeclaration ?? value.declarations?.[0];
        if (declaration) entries.push({ id: key(file, exported.name), declaration });
      }
    }
    function inline(node: ts.Node) {
      if (ts.isFunctionLike(node) && "body" in node && node.body && ts.isBlock(node.body) && isServerBody(node.body.statements)) {
        entries.push({ id: `${key(file, "inline")}:${"name" in node && node.name && ts.isIdentifier(node.name) ? node.name.text : file.getLineAndCharacterOfPosition(node.getStart()).line + 1}`, declaration: node as ts.Declaration });
      }
      ts.forEachChild(node, inline);
    }
    inline(file);
  }
  const missing = entries.filter(({ id, declaration }) => {
    const reason = exceptions.get(id);
    if (reason?.trim()) { seenExemptions.add(id); return false; }
    const body = ts.isFunctionDeclaration(declaration) ? declaration.body
      : ts.isVariableDeclaration(declaration) && declaration.initializer && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))
        ? declaration.initializer.body : declaration;
    return !body || !guarded(body);
  }).map(({ id }) => id);
  return { entries: entries.map(({ id }) => id), missing, stale: [...exceptions.keys()].filter((id) => !seenExemptions.has(id)) };
}

test("全仓 Server Actions：逐个导出及内联动作追踪统一鉴权调用或登记豁免", () => {
  const config = ts.readConfigFile(path.join(root, "tsconfig.json"), ts.sys.readFile);
  const options = ts.parseJsonConfigFileContent(config.config, ts.sys, root).options;
  const names = ts.sys.readDirectory(path.join(root, "src"), [".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs"], ["**/*.test.*", "**/*.d.ts"]);
  const program = ts.createProgram(names, options);
  const files = names.map((name) => program.getSourceFile(name)).filter((file): file is ts.SourceFile => Boolean(file));
  const result = audit(program, files);
  assert.notEqual(result.entries.length, 0, "必须实际扫描到入口，不能零入口假绿");
  assert.deepEqual(result.missing, [], "以下 Server Action 缺少统一鉴权调用（委托必须逐函数可追踪），或需要明确豁免理由");
  assert.deepEqual(result.stale, [], "豁免登记失效，需删除");
});

test("AST 识别函数、箭头、别名导出、重导出和内联动作，注释/字符串/未调用闭包不能冒充", () => {
  const filename = path.join(root, "src/action-guard-fixture.ts");
  const remote = path.join(root, "src/action-guard-remote.ts");
  const source = `"use server";
    import { getCurrentUserContext as authenticate } from "./lib/current-user-context";
    async function naked() { return true; }
    export { naked as alias };
    export const arrow = async () => true;
    export default async function main() { const unused = async () => requireAdminActor(); return "requireAdminActor()"; }
    export async function commented() { /* await requireAdminActor(); */ return true; }
    export async function nested() { async function inline() { "use server"; return true; } return inline(); }
    export { remote } from "./action-guard-remote";
    export async function ignored() { authenticate(); return true; }
    export async function discarded() { await authenticate(); return true; }
    export async function safe() { const actor = await authenticate(); return actor; }
  `;
  const host = ts.createCompilerHost({});
  const read = host.getSourceFile.bind(host);
  const exists = host.fileExists.bind(host);
  host.fileExists = (name) => name === remote || exists(name);
  host.getSourceFile = (name, language, onError, create) => name === filename
    ? ts.createSourceFile(name, source, language, true)
    : name === remote ? ts.createSourceFile(name, "export async function remote() { return true; }", language, true) : read(name, language, onError, create);
  const program = ts.createProgram([filename], {}, host);
  const file = program.getSourceFile(filename)!;
  const result = audit(program, [file], new Map());
  assert.equal(result.entries.length, 10);
  assert.equal(result.missing.length, 9);
  assert.equal(result.missing.includes("src/action-guard-fixture.ts#safe"), false);
  assert.equal(result.missing.includes("src/action-guard-fixture.ts#remote"), true);
  assert.equal(result.missing.includes("src/action-guard-fixture.ts#ignored"), true);
  assert.equal(result.missing.includes("src/action-guard-fixture.ts#discarded"), true);
});
