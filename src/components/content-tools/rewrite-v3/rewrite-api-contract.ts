import type { Skill } from "./SkillCabin";

type ConversationSkillResponse = {
  isActive?: boolean;
  skill?: {
    id: string;
    name: string;
    description: string | null;
    defaultModelViewId: string | null;
    scope: string;
  } | null;
  version?: {
    systemPrompt: string;
  } | null;
};

export function normalizeConversationSkills(payload: unknown): Skill[] {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { skills?: unknown }).skills)) {
    return [];
  }

  return (payload as { skills: unknown[] }).skills
    .map((item): Skill | null => {
      if (!item || typeof item !== "object") return null;
      const row = item as ConversationSkillResponse;
      if (!row.isActive || !row.skill || !row.version || typeof row.skill.id !== "string") return null;

      return {
        id: row.skill.id,
        name: row.skill.name,
        systemPrompt: row.version.systemPrompt,
        description: row.skill.description,
        defaultModelViewId: row.skill.defaultModelViewId,
        scope: row.skill.scope,
      };
    })
    .filter((skill): skill is Skill => Boolean(skill));
}

export function getCreatedConversationId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;

  const value = payload as {
    data?: { conversationId?: unknown };
    conversation?: { id?: unknown };
  };
  if (typeof value.data?.conversationId === "string" && value.data.conversationId.trim()) {
    return value.data.conversationId;
  }
  return typeof value.conversation?.id === "string" && value.conversation.id.trim()
    ? value.conversation.id
    : null;
}
