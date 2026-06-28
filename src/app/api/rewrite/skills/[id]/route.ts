import { NextRequest } from "next/server";

import { getUserPermissions } from "@/lib/permissions";
import {
  deleteSkill,
  getSkillById,
  updateSkillMetadata,
  updateSkillPrompt,
} from "@/lib/rewrite/skills";
import {
  errorResponse,
  jsonResponse,
  parseJsonBody,
  requireAuth,
} from "@/lib/rewrite/api-helpers";
import { createServiceClient } from "@/lib/supabase/service";
import type { SkillRow } from "@/lib/rewrite/skills";

function optionalString(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  return value.trim() || null;
}

function optionalRequiredString(value: unknown) {
  if (value === undefined) return undefined;
  return typeof value === "string" ? value.trim() : "";
}

const routeDeps = {
  requireAuth,
  parseJsonBody,
  getUserPermissions,
  createServiceClient,
  getSkillById,
  updateSkillMetadata,
  updateSkillPrompt,
  deleteSkill,
  errorResponse,
  jsonResponse,
};

async function canManageSkill(input: {
  service: ReturnType<typeof createServiceClient>;
  skillId: string;
  userId: string;
}, deps = routeDeps): Promise<
  | { allowed: true; skill: SkillRow }
  | { allowed: false; status: number; message: string }
> {
  const skill = await deps.getSkillById(input.service, input.skillId);
  if (!skill) {
    return { allowed: false as const, status: 404, message: "Skill 不存在" };
  }

  const permissionInfo = await deps.getUserPermissions();
  const isOwner = permissionInfo?.businessRole === "owner" || permissionInfo?.role === "owner";
  if (isOwner || (skill.scope === "private" && skill.owner_id === input.userId)) {
    return { allowed: true as const, skill };
  }

  return { allowed: false as const, status: 403, message: "无权管理该 skill" };
}

export async function buildRewriteSkillPatchResponse(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
  deps: Partial<typeof routeDeps> = {},
) {
  const actualDeps = { ...routeDeps, ...deps };
  const authResult = await actualDeps.requireAuth();
  if (!("user" in authResult)) return authResult;

  const bodyResult = await actualDeps.parseJsonBody<{
    name?: string;
    description?: string | null;
    icon?: string | null;
    defaultModelViewId?: string | null;
    sortOrder?: number;
    systemPrompt?: string;
    meta?: Record<string, unknown> | null;
  }>(req);
  if (bodyResult instanceof Response) return bodyResult;

  const { id: skillId } = await params;
  const service = actualDeps.createServiceClient();
  const permission = await canManageSkill({ service, skillId, userId: authResult.user.id }, actualDeps);
  if (!permission.allowed) {
    return actualDeps.errorResponse(permission.message, permission.status);
  }

  const metadataPatch = {
    name: optionalRequiredString(bodyResult.name),
    description: optionalString(bodyResult.description),
    icon: optionalString(bodyResult.icon),
    defaultModelViewId: optionalString(bodyResult.defaultModelViewId),
    sortOrder: typeof bodyResult.sortOrder === "number" ? bodyResult.sortOrder : undefined,
  };
  const hasMetadataPatch = Object.values(metadataPatch).some((value) => value !== undefined);
  const nextPrompt = optionalRequiredString(bodyResult.systemPrompt);

  if (!hasMetadataPatch && !nextPrompt) {
    return actualDeps.errorResponse("没有可更新字段", 400);
  }
  if (bodyResult.name !== undefined && !metadataPatch.name) {
    return actualDeps.errorResponse("name 不能为空", 400);
  }
  if (bodyResult.systemPrompt !== undefined && !nextPrompt) {
    return actualDeps.errorResponse("systemPrompt 不能为空", 400);
  }

  try {
    if (hasMetadataPatch) {
      await actualDeps.updateSkillMetadata(service, {
        skillId,
        ...metadataPatch,
      });
    }

    const version = nextPrompt
      ? await actualDeps.updateSkillPrompt(service, {
          skillId,
          systemPrompt: nextPrompt,
          meta: bodyResult.meta ?? null,
        })
      : null;

    return actualDeps.jsonResponse({ success: true, version });
  } catch (error) {
    return actualDeps.errorResponse(error instanceof Error ? error.message : "更新 skill 失败", 500);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return buildRewriteSkillPatchResponse(req, { params });
}

export async function buildRewriteSkillDeleteResponse(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
  deps: Partial<typeof routeDeps> = {},
) {
  const actualDeps = { ...routeDeps, ...deps };
  const authResult = await actualDeps.requireAuth();
  if (!("user" in authResult)) return authResult;

  const { id: skillId } = await params;
  const service = actualDeps.createServiceClient();
  const permission = await canManageSkill({ service, skillId, userId: authResult.user.id }, actualDeps);
  if (!permission.allowed) {
    return actualDeps.errorResponse(permission.message, permission.status);
  }

  try {
    await actualDeps.deleteSkill(service, skillId);
    return actualDeps.jsonResponse({ success: true });
  } catch (error) {
    return actualDeps.errorResponse(error instanceof Error ? error.message : "删除 skill 失败", 500);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return buildRewriteSkillDeleteResponse(req, { params });
}
