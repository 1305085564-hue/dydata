import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import ts from "typescript";

type Kind = "user" | "admin" | "userContext" | "adminContext" | "userFactory" | "adminFactory";
type ScanResult = { file: string; line: number; table: string };

const USER_WRAPPERS = new Set([
  "getCurrentUserContext",
  "resolvePermissionCore",
  "requireAdminActor",
  "requireAdminContext",
  "requireSystemActor",
  "requireExemptionManagerActor",
  "requireCompanyOwnerActor",
  "requireSignedInUser",
]);
const ADMIN_WRAPPERS = new Set(["requireAdminServiceClient"]);

// These helpers receive the already-created session client as a parameter.
// Keep the parameter names explicit so a future direct table access is checked.
const INJECTED_USER_PARAMETERS: Record<string, string[]> = {
  "src/lib/loaders/dashboard-page.ts": ["supabase"],
  "src/lib/loaders/dashboard-activity.ts": ["supabase"],
  "src/lib/exemption-application-precheck.ts": ["client"],
  "src/lib/exemption-application-write.ts": ["supabase"],
  "src/lib/audit-log.ts": ["supabase"],
  "src/lib/admin-tools/data-query.ts": ["client"],
  "src/lib/loaders/daily-reports.ts": ["supabase"],
  "src/lib/dashboard-account-provisioning.ts": ["adminSupabase"],
  "src/app/api/video-submit/route-core.ts": ["supabase"],
  // Factory indirection is a local injectable wrapper; its default implementation
  // returns createClient(), while admin reads use the separate adminClient name.
  "src/lib/team-join/service.ts": ["supabase"],
};
const INJECTED_CONTEXT_LOCALS: Record<string, string[]> = {
  "src/app/api/exemptions/apply/route.ts": ["auth"],
};
const INJECTED_CONTEXT_PATHS: Record<string, string[]> = {
  "src/app/api/admin/execute-tool/route.ts": ["input.auth"],
};

// Each live entry records why this user-scoped access is intentional. P2
// conversion targets must be removed from this list after they use admin plus
// explicit filtering; browser code is excluded by the scanner.
const ALLOWED_USER_ACCESS: Record<string, string> = {
  "src/app/(app)/admin/actions.ts": "Exemption requests are filtered to the signed-in applicant; audit writes use the actor user ID.",
  "src/app/(app)/dashboard/actions.ts": "Dashboard reads and exemption writes use the signed-in user's profile/account IDs.",
  "src/app/(app)/_components/join-banner-loader.ts": "Join banner reads the signed-in user's profile and own pending request.",
  "src/app/(app)/topics/page.tsx": "Loads the signed-in user's own profile for page context.",
  "src/app/(app)/topics/[id]/layout.tsx": "Loads the signed-in user's own profile for page context.",
  "src/app/(app)/people/[userId]/page.tsx": "Loads the signed-in user's own profile by user ID for page context.",
  "src/app/(auth)/login/page.tsx": "Authentication page reads and updates the current user's own profile.",
  "src/components/nav-bar.tsx": "Navigation reads the signed-in user's own profile and accounts for the account selector.",
  "src/app/api/exemptions/apply/route.ts": "Reads the authenticated applicant's own profile.",
  "src/app/api/dashboard/leaderboard/route.ts": "Personal account lookup is filtered by the authenticated profile ID; public rows use CloudBase's scoped loader.",
  "src/app/api/remind/count/route.ts": "Reminder count is filtered by the authenticated user ID.",
  "src/app/api/admin/execute-tool/route.ts": "Admin action log rows are bound to and rechecked against the current admin ID.",
  "src/app/api/admin/ai-config/route.ts": "Company-level AI provider, key, model, and feature configuration is company-owner-only and is not employee-scoped data.",
  "src/lib/loaders/dashboard-page.ts": "Dashboard queries use own account/profile IDs and resolved visibility scope.",
  "src/lib/loaders/dashboard-activity.ts": "Activity queries use the authenticated profile ID and owned account IDs.",
  "src/lib/exemption-application-precheck.ts": "Precheck queries only the authenticated applicant's pending requests.",
  "src/lib/exemption-application-write.ts": "Writes and compensation are limited to the authenticated applicant's request IDs.",
  "src/lib/audit-log.ts": "Audit rows are written with the authenticated actor's user ID.",
  "src/lib/admin-tools/data-query.ts": "Admin tool queries require trusted tool context and apply its explicit visible-user scope.",
  "src/lib/loaders/daily-reports.ts": "Admin tool report queries receive explicit user/account scope lists.",
  "src/lib/dashboard-account-provisioning.ts": "The fallback account lookup/insert is constrained to the authenticated profile ID.",
  "src/app/api/video-submit/edit-detail/route.ts": "Video detail and related records are checked against the signed-in user's account/video IDs.",
  "src/app/api/video-submit/route-core.ts": "Member submission uses the member session and validates the submitted account/user ownership; internal writes use admin client.",
  "src/lib/team-join/service.ts": "Remaining team-join actions filter applicant_user_id and pending status; pending-admin listing is now separately checked for explicit scope.",
};

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.(test|spec)\.[jt]sx?$/.test(entry.name) && !entry.name.endsWith(".d.ts") ? [path] : [];
  });
}

function propName(node: ts.PropertyAccessExpression | ts.ElementAccessExpression): string | undefined {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  return ts.isStringLiteralLike(node.argumentExpression) ? node.argumentExpression.text : undefined;
}

function strip(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) || ts.isAwaitExpression(current) ||
    ts.isAsExpression(current) || ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current) || ts.isSatisfiesExpression(current)
  ) current = current.expression;
  return current;
}

function analyzeText(text: string, file: string): ScanResult[] {
  if (/\.(test|spec)\.[jt]sx?$/.test(file)) return [];
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const imports = new Map<string, Kind>();
  const cloudBaseFactories = new Set<string>();
  for (const statement of sf.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const moduleName = statement.moduleSpecifier.text;
    const bindings = statement.importClause.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const item of bindings.elements) {
      const imported = (item.propertyName ?? item.name).text;
      const local = item.name.text;
      if (moduleName === "@/lib/supabase/server" && imported === "createClient") imports.set(local, "userFactory");
      if (moduleName === "@/lib/supabase/admin" && imported === "createAdminClient") imports.set(local, "adminFactory");
      if (moduleName === "@/lib/cloudbase/data-client" && imported === "createCloudBaseDataClient") cloudBaseFactories.add(local);
      if (USER_WRAPPERS.has(imported)) imports.set(local, "userContext");
      if (ADMIN_WRAPPERS.has(imported)) imports.set(local, "adminContext");
    }
  }

  const variables = new Map<string, Kind>();
  const objectProperties = new Map<string, Map<string, Kind>>();
  for (const local of INJECTED_USER_PARAMETERS[relative(process.cwd(), file)] ?? []) variables.set(local, "user");
  for (const local of INJECTED_CONTEXT_LOCALS[relative(process.cwd(), file)] ?? []) variables.set(local, "userContext");
  const injectedContextPaths = new Set(INJECTED_CONTEXT_PATHS[relative(process.cwd(), file)] ?? []);
  const expressionPath = (expression: ts.Expression): string | undefined => {
    const current = strip(expression);
    if (ts.isIdentifier(current)) return current.text;
    if (ts.isPropertyAccessExpression(current)) {
      const parent = expressionPath(current.expression);
      return parent ? `${parent}.${current.name.text}` : undefined;
    }
    return undefined;
  };
  const localName = (node: ts.Expression): string | undefined => {
    const current = strip(node);
    return ts.isIdentifier(current) ? current.text : undefined;
  };
  const propertyKind = (receiver: ts.Expression, key: string): Kind | undefined => {
    const path = expressionPath(receiver);
    if (path && injectedContextPaths.has(`${path}.${key}`)) return "userContext";
    if (path && injectedContextPaths.has(path) && key === "supabase") return "user";
    const name = localName(receiver);
    if (!name) return undefined;
    const objectKind = variables.get(name) ?? imports.get(name);
    if (objectKind === "userContext" && key === "supabase") return "user";
    if (objectKind === "adminContext" && key === "userSupabase") return "user";
    if (objectKind === "adminContext" && (key === "supabase" || key === "adminSupabase")) return "admin";
    return objectProperties.get(name)?.get(key);
  };
  const classify = (expression: ts.Expression): Kind | undefined => {
    const current = strip(expression);
    if (ts.isBinaryExpression(current) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(current.operatorToken.kind)) {
      return classify(current.left) ?? classify(current.right);
    }
    if (ts.isConditionalExpression(current)) return classify(current.whenTrue) ?? classify(current.whenFalse);
    if (ts.isIdentifier(current)) return variables.get(current.text) ?? imports.get(current.text);
    if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
      const key = propName(current);
      if (key === "storage") return undefined;
      const property = key ? propertyKind(current.expression, key) : undefined;
      if (property === "userFactory") return "userFactory";
      if (property === "adminFactory") return "adminFactory";
      return property;
    }
    if (ts.isCallExpression(current)) {
      if (ts.isIdentifier(strip(current.expression))) {
        const callee = (strip(current.expression) as ts.Identifier).text;
        const kind = variables.get(callee) ?? imports.get(callee);
        if (kind === "userFactory") return "user";
        if (kind === "adminFactory") return "admin";
        if (kind === "userContext" || kind === "adminContext") return kind;
      }
      if (ts.isIdentifier(strip(current.expression)) && cloudBaseFactories.has((strip(current.expression) as ts.Identifier).text)) {
        if (current.arguments.some((arg) => /role\s*:\s*["']user["']/.test(arg.getText(sf)))) return "user";
        return undefined;
      }
      if (ts.isPropertyAccessExpression(current.expression) || ts.isElementAccessExpression(current.expression)) {
        const method = propName(current.expression);
        const kind = method ? propertyKind(current.expression.expression, method) : undefined;
        if (kind === "userFactory") return "user";
        if (kind === "adminFactory") return "admin";
        if (kind === "userContext" || kind === "adminContext") return kind;
      }
      if (ts.isIdentifier(strip(current.expression))) {
        const callee = (strip(current.expression) as ts.Identifier).text;
        if ((imports.get(callee) ?? variables.get(callee)) === "userFactory" && current.arguments.some((arg) => /role\s*:\s*["']user["']/.test(arg.getText(sf)))) return "user";
      }
    }
    return undefined;
  };
  const assignBinding = (name: ts.BindingName, initializer: ts.Expression | undefined, value: Kind | undefined) => {
    if (!value || !initializer) return;
    if (ts.isIdentifier(name)) variables.set(name.text, value);
    else if (ts.isObjectBindingPattern(name)) {
      for (const element of name.elements) {
        if (!ts.isIdentifier(element.name)) continue;
        const key = element.propertyName && ts.isIdentifier(element.propertyName) ? element.propertyName.text : element.name.text;
        const fromObject = propertyKind(initializer, key);
        if (fromObject) variables.set(element.name.text, fromObject);
        else if ((value === "userContext" && key === "supabase") || (value === "adminContext" && key === "userSupabase")) variables.set(element.name.text, "user");
        else if (value === "adminContext" && (key === "supabase" || key === "adminSupabase")) variables.set(element.name.text, "admin");
      }
    }
  };

  let changed = true;
  for (let pass = 0; changed && pass < 8; pass++) {
    changed = false;
    const before = variables.size + objectProperties.size;
    const visit = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && node.initializer) {
        const initializer = strip(node.initializer);
        const kind = classify(initializer);
        if (kind) assignBinding(node.name, initializer, kind);
        if (ts.isIdentifier(node.name) && ts.isObjectLiteralExpression(initializer)) {
          const props = new Map<string, Kind>();
          for (const property of initializer.properties) {
            if (!ts.isPropertyAssignment(property)) continue;
            const key = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) ? property.name.text : undefined;
            if (key) {
              const value = classify(property.initializer);
              if (value) props.set(key, value);
            }
          }
          if (props.size) objectProperties.set(node.name.text, props);
        } else if (ts.isIdentifier(node.name) && ts.isIdentifier(initializer)) {
          const props = objectProperties.get(initializer.text);
          if (props) objectProperties.set(node.name.text, new Map(props));
        }
      } else if (ts.isParameter(node) && node.initializer) {
        const initializer = strip(node.initializer);
        const kind = classify(initializer);
        if (kind) assignBinding(node.name, initializer, kind);
        if (ts.isIdentifier(node.name) && ts.isIdentifier(initializer)) {
          const props = objectProperties.get(initializer.text);
          if (props) objectProperties.set(node.name.text, new Map(props));
        }
      } else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        const kind = classify(node.right);
        if (kind && ts.isIdentifier(strip(node.left))) variables.set((strip(node.left) as ts.Identifier).text, kind);
        if (ts.isIdentifier(strip(node.left)) && ts.isIdentifier(strip(node.right))) {
          const props = objectProperties.get((strip(node.right) as ts.Identifier).text);
          if (props) objectProperties.set((strip(node.left) as ts.Identifier).text, new Map(props));
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    changed = variables.size + objectProperties.size !== before;
  }

  const findings: ScanResult[] = [];
  const visitCalls = (node: ts.Node) => {
    if (ts.isCallExpression(node) && (ts.isPropertyAccessExpression(node.expression) || ts.isElementAccessExpression(node.expression))) {
      const call = node.expression;
      const method = propName(call);
      if (method === "from" && !(ts.isPropertyAccessExpression(call.expression) && call.expression.name.text === "storage") && classify(call.expression) === "user") {
        const tableArg = node.arguments[0];
        const tableExpression = tableArg ? strip(tableArg) : undefined;
        const table = tableExpression && (ts.isStringLiteral(tableExpression) || ts.isNoSubstitutionTemplateLiteral(tableExpression))
          ? tableExpression.text
          : "<dynamic>";
        findings.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, table });
      }
    }
    ts.forEachChild(node, visitCalls);
  };
  visitCalls(sf);
  return findings;
}

function analyzeRepository(): ScanResult[] {
  return sourceFiles(join(process.cwd(), "src"))
    .map((file) => ({ file, text: readFileSync(file, "utf8") }))
    .flatMap(({ file, text }) => analyzeText(text, relative(process.cwd(), file)));
}

test("authenticated direct table access stays on the reviewed list", () => {
  const findings = analyzeRepository();
  const unreviewed = findings.filter((finding) => !ALLOWED_USER_ACCESS[finding.file]);
  const stale = Object.keys(ALLOWED_USER_ACCESS).filter((file) => !findings.some((finding) => finding.file === file));
  assert.deepEqual(
    { unreviewed, stale },
    { unreviewed: [], stale: [] },
    `Review authenticated direct table access. Reasons: ${JSON.stringify(ALLOWED_USER_ACCESS, null, 2)}`,
  );
});

test("scanner follows ordinary, aliased, and returned-context session clients", () => {
  const fixtures = [
    `import { createClient } from "@/lib/supabase/server"; async function f(){ const db = await createClient(); await db.from("accounts").select(); }`,
    `import { createClient as makeSession } from "@/lib/supabase/server"; async function f(){ const session = await makeSession(); const db = session; await db.from("profiles").select(); }`,
    `import { getCurrentUserContext as current } from "@/lib/current-user-context"; async function f(){ const { supabase: db } = await current(); await db.from("profiles").select(); }`,
  ];
  for (const [index, fixture] of fixtures.entries()) {
    assert.equal(analyzeText(fixture, `fixture-${index}.ts`).length, 1, `fixture ${index} should be detected`);
  }
});

test("comments, strings, and storage.from are not table access", () => {
  const source = `import { createClient } from "@/lib/supabase/server"; async function f(){ const db = await createClient(); const note = "db.from('fake')"; // db.from("comment")\n await db.storage.from("bucket").upload("x", new Blob()); }`;
  assert.deepEqual(analyzeText(source, "fixture-negative.ts"), []);
});
