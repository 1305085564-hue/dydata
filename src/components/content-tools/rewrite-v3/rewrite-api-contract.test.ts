import assert from "node:assert/strict";
import test from "node:test";

import { getCreatedConversationId, normalizeConversationSkills } from "./rewrite-api-contract";

test("历史会话技能响应会还原成画布使用的扁平 Skill", () => {
  const skills = normalizeConversationSkills({
    skills: [
      {
        id: "link-1",
        skillId: "skill-1",
        skillVersionId: "version-1",
        isActive: true,
        skill: {
          id: "skill-1",
          scope: "platform",
          key: "framework",
          name: "强框架模式",
          description: "先搭结构",
          icon: null,
          defaultModelViewId: null,
          sortOrder: 1,
        },
        version: {
          id: "version-1",
          skillId: "skill-1",
          version: 1,
          systemPrompt: "请先搭建结构",
          meta: null,
          publishedAt: "2026-09-03T00:00:00.000Z",
          createdAt: "2026-09-03T00:00:00.000Z",
        },
      },
    ],
  });

  assert.deepEqual(skills, [
    {
      id: "skill-1",
      name: "强框架模式",
      systemPrompt: "请先搭建结构",
      description: "先搭结构",
      defaultModelViewId: null,
      scope: "platform",
    },
  ]);
});

test("新建会话响应从 data.conversationId 读取 ID", () => {
  assert.equal(
    getCreatedConversationId({ data: { conversationId: "conversation-1", documentId: "document-1" } }),
    "conversation-1",
  );
  assert.equal(getCreatedConversationId({ conversation: { id: "legacy-1" } }), "legacy-1");
  assert.equal(getCreatedConversationId({ data: {} }), null);
});

test("rewrite v3 仍依赖的历史读写路由必须导出对应 HTTP handler", async () => {
  const [conversationSkills, skillStatus, paragraphs, history, revisions, userEdit, skillManagement] = await Promise.all([
    import("@/app/api/rewrite/conversations/[id]/skills/route"),
    import("@/app/api/rewrite/conversations/[id]/skills/[skillId]/route"),
    import("@/app/api/rewrite/documents/[id]/paragraphs/route"),
    import("@/app/api/rewrite/documents/[id]/history/route"),
    import("@/app/api/rewrite/documents/[id]/revisions/route"),
    import("@/app/api/rewrite/paragraphs/user-edit/route"),
    import("@/app/api/rewrite/skills/[id]/route"),
  ]);

  assert.equal(typeof conversationSkills.GET, "function");
  assert.equal(typeof conversationSkills.POST, "function");
  assert.equal(typeof skillStatus.PATCH, "function");
  assert.equal(typeof paragraphs.GET, "function");
  assert.equal(typeof history.GET, "function");
  assert.equal(typeof history.POST, "function");
  assert.equal(typeof revisions.GET, "function");
  assert.equal(typeof revisions.POST, "function");
  assert.equal(typeof userEdit.POST, "function");
  assert.equal(typeof skillManagement.PATCH, "function");
  assert.equal(typeof skillManagement.DELETE, "function");
});
