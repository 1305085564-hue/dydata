import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { buildRewriteSkillsPostResponse } from "./skills/route";
import { buildRewriteSkillPatchResponse } from "./skills/[id]/route";
import { buildRewriteDocumentRevisionsPostResponse } from "./documents/[id]/revisions/route";
import { errorResponse } from "@/lib/rewrite/api-helpers";

function createJsonRequest(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("skills POST rejects non-owner creating non-private skill", async () => {
  const response = await buildRewriteSkillsPostResponse(
    createJsonRequest("https://dydata.cc/api/rewrite/skills", {
      scope: "public_user",
      key: "public-skill",
      name: "公开技能",
      systemPrompt: "prompt",
    }),
    {
      requireAuth: async () => ({ user: { id: "user-1" } }),
      parseJsonBody: async () => ({
        scope: "public_user",
        key: "public-skill",
        name: "公开技能",
        systemPrompt: "prompt",
      }),
      getUserPermissions: async () => ({
        role: "member",
        businessRole: "member",
      }),
    } as never,
  );

  assert.equal(response.status, 403);
  assert.match(JSON.stringify(await response.json()), /只有 owner 可以创建平台或公开 skill/);
});

test("skills [id] PATCH updates prompt by creating a new version", async () => {
  let updatedPrompt: { skillId: string; systemPrompt: string } | null = null;

  const response = await buildRewriteSkillPatchResponse(
    createJsonRequest("https://dydata.cc/api/rewrite/skills/skill-1", {
      systemPrompt: "第二版 prompt",
    }),
    { params: Promise.resolve({ id: "skill-1" }) },
    {
      requireAuth: async () => ({ user: { id: "user-1" } }),
      parseJsonBody: async () => ({ systemPrompt: "第二版 prompt" }),
      getUserPermissions: async () => ({
        role: "member",
        businessRole: "member",
      }),
      createServiceClient: () => ({}) as never,
      getSkillById: async () => ({
        id: "skill-1",
        scope: "private",
        owner_id: "user-1",
      }),
      updateSkillMetadata: async () => undefined,
      updateSkillPrompt: async (service: unknown, input: { skillId: string; systemPrompt: string }) => {
        void service;
        updatedPrompt = {
          skillId: input.skillId,
          systemPrompt: input.systemPrompt,
        };
        return {
          id: "skill-version-2",
          skill_id: "skill-1",
          version: 2,
          system_prompt: input.systemPrompt,
          meta: null,
          published_at: "2026-06-28T00:00:00.000Z",
          created_at: "2026-06-28T00:00:00.000Z",
        };
      },
    } as never,
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.version.version, 2);
  assert.deepEqual(updatedPrompt, {
    skillId: "skill-1",
    systemPrompt: "第二版 prompt",
  });
});

test("document revisions POST rejects parent revision outside current document", async () => {
  const response = await buildRewriteDocumentRevisionsPostResponse(
    createJsonRequest("https://dydata.cc/api/rewrite/documents/conv-1/revisions", {
      status: "completed",
      fullContent: "正文",
      parentRevisionId: "rev-other",
    }),
    { params: Promise.resolve({ id: "conv-1" }) },
    {
      requireAuth: async () => ({ user: { id: "user-1" } }),
      requireConversationOwner: async () => null,
      parseJsonBody: async () => ({
        status: "completed",
        fullContent: "正文",
        parentRevisionId: "rev-other",
      }),
      createServiceClient: () => ({}) as never,
      getDocumentByConversationId: async () => ({
        id: "doc-1",
        conversationId: "conv-1",
        title: "画布",
        currentRevisionId: "rev-current",
        createdAt: "2026-06-28T00:00:00.000Z",
        updatedAt: "2026-06-28T00:00:00.000Z",
      }),
      getRevisionById: async () => ({
        id: "rev-other",
        documentId: "doc-2",
        parentRevisionId: null,
        sourceType: "user_edit",
        status: "completed",
        generationRunId: null,
        fullContent: "旧正文",
        messageId: null,
        meta: null,
        createdAt: "2026-06-28T00:00:00.000Z",
      }),
    } as never,
  );

  assert.equal(response.status, 400);
  assert.match(JSON.stringify(await response.json()), /parentRevisionId 不属于当前 document/);
});

test("document revisions POST only advances current revision when status is completed", async () => {
  const setCurrentCalls: string[] = [];

  const response = await buildRewriteDocumentRevisionsPostResponse(
    createJsonRequest("https://dydata.cc/api/rewrite/documents/conv-1/revisions", {
      status: "pending",
      fullContent: "草稿正文",
    }),
    { params: Promise.resolve({ id: "conv-1" }) },
    {
      requireAuth: async () => ({ user: { id: "user-1" } }),
      requireConversationOwner: async () => null,
      parseJsonBody: async () => ({
        status: "pending",
        fullContent: "草稿正文",
      }),
      createServiceClient: () => ({}) as never,
      getDocumentByConversationId: async () => ({
        id: "doc-1",
        conversationId: "conv-1",
        title: "画布",
        currentRevisionId: "rev-current",
        createdAt: "2026-06-28T00:00:00.000Z",
        updatedAt: "2026-06-28T00:00:00.000Z",
      }),
      getRevisionById: async () => ({
        id: "rev-current",
        documentId: "doc-1",
        parentRevisionId: null,
        sourceType: "user_edit",
        status: "completed",
        generationRunId: null,
        fullContent: "当前正文",
        messageId: null,
        meta: null,
        createdAt: "2026-06-28T00:00:00.000Z",
      }),
      createRevision: async () => ({
        id: "rev-pending",
        documentId: "doc-1",
        parentRevisionId: "rev-current",
        sourceType: "user_edit",
        status: "pending",
        generationRunId: null,
        fullContent: "草稿正文",
        messageId: null,
        meta: null,
        createdAt: "2026-06-28T00:00:00.000Z",
      }),
      createParagraphs: async () => [],
      setCurrentRevision: async (_service: unknown, _documentId: string, revisionId: string) => {
        setCurrentCalls.push(revisionId);
      },
    } as never,
  );

  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload.currentRevisionId, "rev-current");
  assert.deepEqual(setCurrentCalls, []);
});

test("v2 errorResponse normalizes missing schema_version column error", async () => {
  const error = new Error("Could not find the 'schema_version' column of 'rewrite_conversations' in the schema cache");
  const response = errorResponse(error);

  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.error, "文案助手 v2 数据表未就绪，请先执行对应 migration");
});

test("v2 errorResponse normalizes missing rewrite_documents table error", async () => {
  const error = new Error('relation "public.rewrite_documents" does not exist');
  const response = errorResponse(error);

  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.error, "文案助手 v2 数据表未就绪，请先执行对应 migration");
});

test("v2 errorResponse normalizes missing rewrite_skills table error", async () => {
  const error = new Error("Could not find the table 'public.rewrite_skills' in the schema cache");
  const response = errorResponse(error);

  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.error, "文案助手 v2 数据表未就绪，请先执行对应 migration");
});

test("v2 errorResponse normalizes missing ai_providers table error", async () => {
  const error = new Error('relation "public.ai_providers" does not exist');
  const response = errorResponse(error);

  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.error, "文案助手 v2 数据表未就绪，请先执行对应 migration");
});

test("v2 errorResponse passes through generic errors with 500 status", async () => {
  const error = new Error("Network timeout");
  const response = errorResponse(error);

  assert.equal(response.status, 500);
  const payload = await response.json();
  assert.equal(payload.error, "Network timeout");
});
