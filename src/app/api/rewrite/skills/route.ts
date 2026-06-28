import { createServiceClient } from "@/lib/supabase/service";
import { getUserPermissions } from "@/lib/permissions";
import { createSkill, listAvailableSkills, type SkillScope } from "@/lib/rewrite/skills";
import { requireAuth, jsonResponse, errorResponse, parseJsonBody } from "@/lib/rewrite/api-helpers";
import { NextRequest } from "next/server";

const SKILL_SCOPES: SkillScope[] = ["platform", "private", "public_user"];

function isSkillScope(value: unknown): value is SkillScope {
  return typeof value === "string" && SKILL_SCOPES.includes(value as SkillScope);
}

function optionalString(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  return value.trim() || null;
}

function requiredString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

const routeDeps = {
  requireAuth,
  parseJsonBody,
  getUserPermissions,
  createServiceClient,
  createSkill,
  jsonResponse,
  errorResponse,
};

export async function GET(req: NextRequest) {
  const authResult = await requireAuth();
  if ("user" in authResult) {
    const { user } = authResult;
    const service = createServiceClient();

    try {
      const { searchParams } = new URL(req.url);
      const scopeParam = searchParams.get("scope");
      const rawScopeParts = scopeParam ? scopeParam.split(",").filter(Boolean) : [];
      if (rawScopeParts.some((item) => !isSkillScope(item))) {
        return errorResponse("scope 参数不正确", 400);
      }
      const scope = rawScopeParts.length > 0 ? (rawScopeParts as SkillScope[]) : undefined;

      const skills = await listAvailableSkills(service, {
        userId: user.id,
        scope,
      });

      return jsonResponse({ skills });
    } catch (error) {
      return errorResponse(error instanceof Error ? error.message : "获取 skills 失败", 500);
    }
  }
  return authResult;
}

export async function buildRewriteSkillsPostResponse(
  req: NextRequest,
  deps: Partial<typeof routeDeps> = {},
) {
  const actualDeps = { ...routeDeps, ...deps };
  const authResult = await actualDeps.requireAuth();
  if (!("user" in authResult)) return authResult;

  const bodyResult = await actualDeps.parseJsonBody<{
    scope?: SkillScope;
    key?: string;
    name?: string;
    description?: string | null;
    icon?: string | null;
    defaultModelViewId?: string | null;
    systemPrompt?: string;
    sortOrder?: number;
  }>(req);
  if (bodyResult instanceof Response) return bodyResult;

  const scope = bodyResult.scope ?? "private";
  const key = requiredString(bodyResult.key);
  const name = requiredString(bodyResult.name);
  const systemPrompt = requiredString(bodyResult.systemPrompt);

  if (!isSkillScope(scope)) {
    return actualDeps.errorResponse("scope 参数不正确", 400);
  }
  if (!key || !name || !systemPrompt) {
    return actualDeps.errorResponse("缺少 key、name 或 systemPrompt", 400);
  }

  const permissionInfo = await actualDeps.getUserPermissions();
  const isOwner = permissionInfo?.businessRole === "owner" || permissionInfo?.role === "owner";
  if (scope !== "private" && !isOwner) {
    return actualDeps.errorResponse("只有 owner 可以创建平台或公开 skill", 403);
  }

  const service = actualDeps.createServiceClient();

  try {
    const result = await actualDeps.createSkill(service, {
      scope,
      ownerId: scope === "platform" ? null : authResult.user.id,
      key,
      name,
      description: optionalString(bodyResult.description),
      icon: optionalString(bodyResult.icon),
      defaultModelViewId: optionalString(bodyResult.defaultModelViewId),
      systemPrompt,
      sortOrder: typeof bodyResult.sortOrder === "number" ? bodyResult.sortOrder : undefined,
    });

    return actualDeps.jsonResponse({ skill: result.skill, version: result.version }, 201);
  } catch (error) {
    return actualDeps.errorResponse(error instanceof Error ? error.message : "创建 skill 失败", 500);
  }
}

export async function POST(req: NextRequest) {
  return buildRewriteSkillsPostResponse(req);
}
