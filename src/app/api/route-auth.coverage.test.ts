import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

// 接口鉴权清点守卫：每个 route.ts 要么在自身（或登记的委托文件）里调用统一鉴权入口，
// 要么登记为"有意公开"并写明靠什么保护。新增接口忘了鉴权会在这里直接报红，
// 不再依赖人工审查发现。统一入口说明见 docs/reference/链路设计与决策/权限链路.md。
const API_ROOT = path.resolve(process.cwd(), "src/app/api");

/** 统一鉴权入口（会话 + 身份 + 数据范围），或机器入口的密钥校验。 */
const GUARDS = [
  "requireAdminActor",
  "requireAdminContext",
  "requireAdminServiceClient",
  "requireSystemActor",
  "requireActiveTeamContext",
  "requireTopicsContext",
  "requireScopedAdminVideo",
  "requireAdminModulesAccess",
  "resolvePermissionCore",
  "getCurrentPermissionContext",
  "requireOwnerOrAdminActor",
  "requireExemptionManagerActor",
  "requireCompanyOwnerActor",
  "requireSignedInUser",
  "requireVerifiedCloudBaseSession",
  "isCronAuthorized",
  // 仅会话校验：只允许操作本人数据的员工端接口（归属由查询条件绑定 user.id）。
  "auth.getUser",
  "getCurrentUserContext",
] as const;

/** 路由本身很薄、鉴权写在委托文件里：登记委托文件，守卫去那里找。 */
const DELEGATES: Record<string, string> = {
  "admin/ai-config/ocr-logs/route.ts": "admin/ai-config/ocr-logs/route-core.ts",
  "admin/collaboration/attribution/route.ts": "admin/collaboration/handlers.ts",
  "admin/collaboration/person/route.ts": "admin/collaboration/handlers.ts",
  "admin/collaboration/unattributed/route.ts": "admin/collaboration/handlers.ts",
  "admin/collaboration/work-video/route.ts": "admin/collaboration/work-video/route-core.ts",
  "admin/collaboration/writer-certification/route.ts": "admin/collaboration/writer-certification/route-core.ts",
  "admin/modules/member-emails/route.ts": "admin/modules/member-emails/response.ts",
  "admin/videos/[videoId]/lifecycle/route.ts": "../../lib/video-lifecycle.ts",
  "video-submit/route.ts": "video-submit/route-core.ts",
};

/** 有意不要求登录的接口：必须写明靠什么保护。 */
const PUBLIC_ROUTES: Record<string, string> = {
  "health/route.ts": "健康检查：只返回服务与依赖是否在线，不返回业务数据",
  "register-teams/route.ts": "注册页团队选择：登录前必须可读，只返回团队名称列表",
  "feishu/event/route.ts": "飞书事件回调：靠 FEISHU_APP_VERIFICATION_TOKEN／加密密钥校验来源",
  "cloudbase/auth/signin/route.ts": "登录入口本身：来源校验 + 账号密码",
  "cloudbase/auth/refresh/route.ts": "会话续期：只认 HttpOnly Cookie 中的刷新凭据",
  "cloudbase/auth/signout/route.ts": "退出：只清除本人 Cookie",
};

/**
 * 不带 requiredPermission 调用 requireAdminActor()/requireAdminContext() 只证明"有任意一项权限"，
 * 普通组员也能通过。这类调用所在文件必须再做一次能力或范围收窄。
 */
const NO_ARG_ADMIN_GUARD = /\brequire(?:AdminActor|AdminContext)\(\s*\)/;
const NARROWING_CHECK = /canAccessAdminPath|canReadWorkVideo|canAccess[A-Z]\w*|permissions\.[a-z_]+|requiredPermission|resolveActorCompanyRole|resolveCollaborationScope|companyRole\s*===/;

function routeFiles(dir: string, prefix = ""): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry);
    const relativePath = path.join(prefix, entry);
    if (statSync(fullPath).isDirectory()) return routeFiles(fullPath, relativePath);
    return entry === "route.ts" ? [relativePath.split(path.sep).join("/")] : [];
  });
}

function read(relativePath: string) {
  return readFileSync(path.join(API_ROOT, relativePath), "utf8");
}

function guardSource(route: string) {
  const delegate = DELEGATES[route];
  return delegate ? `${read(route)}\n${read(delegate)}` : read(route);
}

test("接口鉴权清点：每个接口都调用统一鉴权入口，或登记为有意公开并写明保护方式", () => {
  const routes = routeFiles(API_ROOT).sort();
  const missing = routes.filter((route) => !PUBLIC_ROUTES[route] && !GUARDS.some((guard) => guardSource(route).includes(guard)));
  assert.deepEqual(missing, [], "以下接口没有找到统一鉴权入口：补上鉴权，或登记到 PUBLIC_ROUTES 并写明保护方式；鉴权在委托文件里的登记到 DELEGATES");

  for (const [route, reason] of Object.entries(PUBLIC_ROUTES)) {
    assert.ok(routes.includes(route), `PUBLIC_ROUTES 里的 ${route} 已不存在，删掉这条登记`);
    assert.ok(reason.length > 0, `${route} 必须写明保护方式`);
  }
  for (const [route, delegate] of Object.entries(DELEGATES)) {
    assert.ok(routes.includes(route), `DELEGATES 里的 ${route} 已不存在，删掉这条登记`);
    assert.ok(existsSync(path.join(API_ROOT, delegate)), `${route} 的委托文件 ${delegate} 不存在`);
  }
});

test("接口鉴权清点：不带权限要求的管理端入口后面必须再做能力或范围收窄", () => {
  const unnarrowed = routeFiles(API_ROOT).sort().filter((route) => {
    const source = guardSource(route);
    return NO_ARG_ADMIN_GUARD.test(source) && !NARROWING_CHECK.test(source);
  });
  assert.deepEqual(unnarrowed, [], "这些接口只校验了'有任意权限'，组员也能通过：传 requiredPermission，或在调用后检查页面权限／数据范围");
});

function ignoredAuthResults(source: string) {
  const file = ts.createSourceFile("route.ts", source, ts.ScriptTarget.Latest, true);
  const ignored: Array<{ guard: string; line: number }> = [];
  const guardName = /^require(?:\w*(?:Actor|Context|Access)|SignedInUser|VerifiedCloudBaseSession)$/;
  function visit(node: ts.Node) {
    if (ts.isAwaitExpression(node) && ts.isCallExpression(node.expression)) {
      const callee = node.expression.expression;
      const name = ts.isIdentifier(callee) ? callee.text
        : ts.isPropertyAccessExpression(callee) ? callee.name.text : "";
      if (guardName.test(name)) {
        let parent = node.parent;
        let received = false;
        while (parent && !ts.isSourceFile(parent)) {
          if (ts.isVariableDeclaration(parent) || ts.isReturnStatement(parent)
            || (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken)
            || (ts.isArrowFunction(parent) && !ts.isBlock(parent.body))) {
            received = true;
            break;
          }
          if (ts.isStatement(parent) || ts.isFunctionLike(parent)) break;
          parent = parent.parent;
        }
        if (!received) ignored.push({ guard: name, line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1 });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return ignored;
}

test("鉴权返回值守卫：能识别裸调用，接受赋值和返回，忽略注释与字符串", () => {
  const source = [
    'await requireSystemActor();',
    'await deps.requireAdminContext({ requiredPermission: "manage_system" });',
    'await requireAdminModulesAccess();',
    'await requireSignedInUser();',
    'await deps.requireVerifiedCloudBaseSession();',
    'const auth = await requireSystemActor();',
    'auth = await deps.requireAdminContext();',
    'async function authenticate() { return await requireSignedInUser(); }',
    'const authenticate = async () => await requireSystemActor();',
    '// await requireSystemActor();',
    'const text = "await requireAdminActor();";',
  ].join("\n");
  assert.deepEqual(ignoredAuthResults(source), [
    { guard: "requireSystemActor", line: 1 },
    { guard: "requireAdminContext", line: 2 },
    { guard: "requireAdminModulesAccess", line: 3 },
    { guard: "requireSignedInUser", line: 4 },
    { guard: "requireVerifiedCloudBaseSession", line: 5 },
  ]);
});

test("全站鉴权返回值守卫：接口及登记的委托文件不得丢弃统一鉴权结果", () => {
  const files = [...new Set([...routeFiles(API_ROOT), ...Object.values(DELEGATES)])].sort();
  const violations = files.flatMap((file) => ignoredAuthResults(read(file)).map((match) => ({ file, ...match })));
  assert.deepEqual(violations, [], "必须接收鉴权结果并拦截 error；不能把返回错误的鉴权函数当成抛异常的断言");
});
