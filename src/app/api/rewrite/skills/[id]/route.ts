import { NextRequest } from "next/server";

import { getUserPermissions } from "@/lib/permissions";
import { hasPermission } from "@/lib/permission-utils";
import { createServiceClient } from "@/lib/supabase/service";
import {
  deleteSkill,
  getSkillById,
  updateSkillMetadata,
  updateSkillPrompt,
  type SkillRow,
} from "@/lib/rewrite/skills";
import { errorResponse, jsonResponse, parseJsonBody, requireAuth } from "@/lib/rewrite/api-helpers";

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

async function getManagedSkill(skillId: string, userId: string): Promise<
  | { allowed: true; skill: SkillRow }
  | { allowed: false; status: number; message: string }
> {
  const service = createServiceClient();
  const skill = await getSkillById(service, skillId);
  if (!skill) return { allowed: false, status: 404, message: "Skill 不存在" };

  const permissionInfo = await getUserPermissions();
  const canManageSystem = permissionInfo
    ? hasPermission(permissionInfo.role, permissionInfo.permissions, "manage_system")
    : false;
  const isPrivateOwner = skill.scope === "private" && skill.owner_id === userId;
  const isSystemSkill = skill.scope !== "private" && canManageSystem;
  if (isPrivateOwner || isSystemSkill) return { allowed: true, skill };

  return { allowed: false, status: 403, message: "无权管理该 skill" };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth();
  if (!("user" in authResult)) return authResult;

  const { id: skillId } = await params;
  const permission = await getManagedSkill(skillId, authResult.user.id);
  if (!permission.allowed) return errorResponse(permission.message, permission.status);

  const bodyResult = await parseJsonBody<{
    name?: unknown;
    description?: unknown;
    icon?: unknown;
    defaultModelViewId?: unknown;
    sortOrder?: unknown;
    systemPrompt?: unknown;
    meta?: Record<string, unknown> | null;
  }>(request);
  if (bodyResult instanceof Response) return bodyResult;

  const metadataPatch = {
    name: optionalRequiredString(bodyResult.name),
    description: optionalString(bodyResult.description),
    icon: optionalString(bodyResult.icon),
    defaultModelViewId: optionalString(bodyResult.defaultModelViewId),
    sortOrder: typeof bodyResult.sortOrder === "number" ? bodyResult.sortOrder : undefined,
  };
  const hasMetadataPatch = Object.values(metadataPatch).some((value) => value !== undefined);
  const nextPrompt = optionalRequiredString(bodyResult.systemPrompt);

  if (!hasMetadataPatch && !nextPrompt) return errorResponse("没有可更新字段", 400);
  if (bodyResult.name !== undefined && !metadataPatch.name) return errorResponse("name 不能为空", 400);
  if (bodyResult.systemPrompt !== undefined && !nextPrompt) {
    return errorResponse("systemPrompt 不能为空", 400);
  }

  try {
    const service = createServiceClient();
    if (hasMetadataPatch) {
      await updateSkillMetadata(service, { skillId, ...metadataPatch });
    }
    const version = nextPrompt
      ? await updateSkillPrompt(service, { skillId, systemPrompt: nextPrompt, meta: bodyResult.meta ?? null })
      : null;
    return jsonResponse({ success: true, version });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "更新 skill 失败");
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth();
  if (!("user" in authResult)) return authResult;

  const { id: skillId } = await params;
  const permission = await getManagedSkill(skillId, authResult.user.id);
  if (!permission.allowed) return errorResponse(permission.message, permission.status);

  try {
    await deleteSkill(createServiceClient(), skillId);
    return jsonResponse({ success: true });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "删除 skill 失败");
  }
}
