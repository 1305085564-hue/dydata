// Dynamic v2 tables are not in the generated Supabase type map yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MinimalClient = any;

export type SkillScope = "platform" | "private" | "public_user";

export type SkillRow = {
  id: string;
  scope: SkillScope;
  owner_id: string | null;
  key: string;
  name: string;
  description: string | null;
  icon: string | null;
  default_model_view_id: string | null;
  sort_order: number;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type SkillVersionRow = {
  id: string;
  skill_id: string;
  version: number;
  system_prompt: string;
  meta: Record<string, unknown> | null;
  published_at: string | null;
  created_at: string;
};

export type ConversationSkillRow = {
  id: string;
  conversation_id: string;
  skill_id: string;
  skill_version_id: string;
  position: number;
  is_active: boolean;
  injected_at: string;
};

export type SkillOption = {
  id: string;
  scope: SkillScope;
  key: string;
  name: string;
  description: string | null;
  icon: string | null;
  defaultModelViewId: string | null;
  sortOrder: number;
};

export type SkillVersionOption = {
  id: string;
  skillId: string;
  version: number;
  systemPrompt: string;
  meta: Record<string, unknown> | null;
  publishedAt: string | null;
  createdAt: string;
};

export type ConversationSkill = {
  id: string;
  skillId: string;
  skillVersionId: string;
  skill: SkillOption;
  version: SkillVersionOption;
  position: number;
  isActive: boolean;
  injectedAt: string;
};

function toSkillOption(row: SkillRow): SkillOption {
  return {
    id: row.id,
    scope: row.scope,
    key: row.key,
    name: row.name,
    description: row.description,
    icon: row.icon,
    defaultModelViewId: row.default_model_view_id,
    sortOrder: row.sort_order,
  };
}

function toSkillVersionOption(row: SkillVersionRow): SkillVersionOption {
  return {
    id: row.id,
    skillId: row.skill_id,
    version: row.version,
    systemPrompt: row.system_prompt,
    meta: row.meta,
    publishedAt: row.published_at,
    createdAt: row.created_at,
  };
}

export async function listAvailableSkills(
  service: MinimalClient,
  input: { userId: string; scope?: SkillScope[] },
): Promise<SkillOption[]> {
  let query = service
    .from("rewrite_skills")
    .select("id, scope, owner_id, key, name, description, icon, default_model_view_id, sort_order, is_enabled, created_at, updated_at")
    .eq("is_enabled", true);

  if (input.scope && input.scope.length > 0) {
    query = query.in("scope", input.scope);
  } else {
    query = query.or(`scope.eq.platform,scope.eq.public_user,owner_id.eq.${input.userId}`);
  }

  query = query.order("sort_order", { ascending: true }).order("created_at", { ascending: true });

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as SkillRow[]).map(toSkillOption);
}

export async function getSkillById(service: MinimalClient, skillId: string): Promise<SkillRow | null> {
  const { data, error } = await service
    .from("rewrite_skills")
    .select("id, scope, owner_id, key, name, description, icon, default_model_view_id, sort_order, is_enabled, created_at, updated_at")
    .eq("id", skillId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? null) as SkillRow | null;
}

export async function createSkill(
  service: MinimalClient,
  input: {
    scope: SkillScope;
    ownerId?: string | null;
    key: string;
    name: string;
    description?: string | null;
    icon?: string | null;
    defaultModelViewId?: string | null;
    systemPrompt: string;
    sortOrder?: number;
  },
): Promise<{ skill: SkillRow; version: SkillVersionRow }> {
  const { data: skillData, error: skillError } = await service
    .from("rewrite_skills")
    .insert({
      scope: input.scope,
      owner_id: input.ownerId ?? null,
      key: input.key,
      name: input.name,
      description: input.description ?? null,
      icon: input.icon ?? null,
      default_model_view_id: input.defaultModelViewId ?? null,
      sort_order: input.sortOrder ?? 100,
      is_enabled: true,
    })
    .select("id, scope, owner_id, key, name, description, icon, default_model_view_id, sort_order, is_enabled, created_at, updated_at")
    .single();

  if (skillError || !skillData) {
    throw new Error(skillError?.message ?? "创建 skill 失败");
  }

  const skill = skillData as SkillRow;

  const { data: versionData, error: versionError } = await service
    .from("rewrite_skill_versions")
    .insert({
      skill_id: skill.id,
      version: 1,
      system_prompt: input.systemPrompt,
      published_at: new Date().toISOString(),
    })
    .select("id, skill_id, version, system_prompt, meta, published_at, created_at")
    .single();

  if (versionError || !versionData) {
    throw new Error(versionError?.message ?? "创建 skill version 失败");
  }

  return {
    skill,
    version: versionData as SkillVersionRow,
  };
}

export async function updateSkillPrompt(
  service: MinimalClient,
  input: {
    skillId: string;
    systemPrompt: string;
    meta?: Record<string, unknown> | null;
  },
): Promise<SkillVersionRow> {
  const { data: latestVersion } = await service
    .from("rewrite_skill_versions")
    .select("version")
    .eq("skill_id", input.skillId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = latestVersion ? (latestVersion.version as number) + 1 : 1;

  const { data: versionData, error: versionError } = await service
    .from("rewrite_skill_versions")
    .insert({
      skill_id: input.skillId,
      version: nextVersion,
      system_prompt: input.systemPrompt,
      meta: input.meta ?? null,
      published_at: new Date().toISOString(),
    })
    .select("id, skill_id, version, system_prompt, meta, published_at, created_at")
    .single();

  if (versionError || !versionData) {
    throw new Error(versionError?.message ?? "创建新版本失败");
  }

  return versionData as SkillVersionRow;
}

export async function updateSkillMetadata(
  service: MinimalClient,
  input: {
    skillId: string;
    name?: string;
    description?: string | null;
    icon?: string | null;
    defaultModelViewId?: string | null;
    sortOrder?: number;
  },
): Promise<void> {
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.icon !== undefined) patch.icon = input.icon;
  if (input.defaultModelViewId !== undefined) patch.default_model_view_id = input.defaultModelViewId;
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;

  const { error } = await service.from("rewrite_skills").update(patch).eq("id", input.skillId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteSkill(service: MinimalClient, skillId: string): Promise<void> {
  const { error } = await service.from("rewrite_skills").delete().eq("id", skillId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function getSkillVersionsBySkillId(
  service: MinimalClient,
  skillId: string,
): Promise<SkillVersionRow[]> {
  const { data, error } = await service
    .from("rewrite_skill_versions")
    .select("id, skill_id, version, system_prompt, meta, published_at, created_at")
    .eq("skill_id", skillId)
    .order("version", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as SkillVersionRow[];
}

export async function getLatestPublishedVersion(
  service: MinimalClient,
  skillId: string,
): Promise<SkillVersionRow | null> {
  const { data, error } = await service
    .from("rewrite_skill_versions")
    .select("id, skill_id, version, system_prompt, meta, published_at, created_at")
    .eq("skill_id", skillId)
    .not("published_at", "is", null)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? null) as SkillVersionRow | null;
}

export async function injectSkillToConversation(
  service: MinimalClient,
  input: {
    conversationId: string;
    skillId: string;
    skillVersionId?: string | null;
  },
): Promise<ConversationSkillRow> {
  let versionId = input.skillVersionId;
  if (!versionId) {
    const latestVersion = await getLatestPublishedVersion(service, input.skillId);
    if (!latestVersion) {
      throw new Error("该 skill 无已发布版本");
    }
    versionId = latestVersion.id;
  }

  const { data: existingSkills } = await service
    .from("rewrite_conversation_skills")
    .select("position")
    .eq("conversation_id", input.conversationId)
    .order("position", { ascending: false })
    .limit(1);

  const nextPosition = existingSkills && existingSkills.length > 0 ? (existingSkills[0].position as number) + 1 : 1;

  const { data, error } = await service
    .from("rewrite_conversation_skills")
    .insert({
      conversation_id: input.conversationId,
      skill_id: input.skillId,
      skill_version_id: versionId,
      position: nextPosition,
      is_active: true,
    })
    .select("id, conversation_id, skill_id, skill_version_id, position, is_active, injected_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "注入 skill 失败");
  }

  return data as ConversationSkillRow;
}

export async function updateConversationSkillStatus(
  service: MinimalClient,
  input: {
    conversationId: string;
    skillId: string;
    isActive: boolean;
  },
): Promise<void> {
  const { error } = await service
    .from("rewrite_conversation_skills")
    .update({
      is_active: input.isActive,
    })
    .eq("conversation_id", input.conversationId)
    .eq("skill_id", input.skillId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function removeSkillFromConversation(
  service: MinimalClient,
  input: {
    conversationId: string;
    skillId: string;
  },
): Promise<void> {
  const { error } = await service
    .from("rewrite_conversation_skills")
    .delete()
    .eq("conversation_id", input.conversationId)
    .eq("skill_id", input.skillId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function listConversationSkills(
  service: MinimalClient,
  conversationId: string,
): Promise<ConversationSkill[]> {
  const { data, error } = await service
    .from("rewrite_conversation_skills")
    .select(
      `
      id,
      skill_id,
      skill_version_id,
      position,
      is_active,
      injected_at,
      skill:rewrite_skills(id, scope, key, name, description, icon, default_model_view_id, sort_order),
      version:rewrite_skill_versions(id, skill_id, version, system_prompt, meta, published_at, created_at)
    `,
    )
    .eq("conversation_id", conversationId)
    .order("position", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as Array<
    ConversationSkillRow & {
      skill: SkillRow | SkillRow[] | null;
      version: SkillVersionRow | SkillVersionRow[] | null;
    }
  >;

  return rows.map((row) => {
    const skill = Array.isArray(row.skill) ? row.skill[0] : row.skill;
    const version = Array.isArray(row.version) ? row.version[0] : row.version;

    if (!skill || !version) {
      throw new Error("Conversation skill 关联数据不完整");
    }

    return {
      id: row.id,
      skillId: row.skill_id,
      skillVersionId: row.skill_version_id,
      skill: toSkillOption(skill),
      version: toSkillVersionOption(version),
      position: row.position,
      isActive: row.is_active,
      injectedAt: row.injected_at,
    };
  });
}

export async function buildSkillStackPrompt(
  service: MinimalClient,
  conversationId: string,
): Promise<string> {
  const skills = await listConversationSkills(service, conversationId);
  const activeSkills = skills.filter((s) => s.isActive);

  if (activeSkills.length === 0) {
    return "";
  }

  const prompts = activeSkills.map((s, index) => {
    const header = `Skill ${index + 1}/${activeSkills.length}: ${s.skill.name}`;
    return `${header}\n${s.version.systemPrompt}`;
  });

  return prompts.join("\n\n");
}
