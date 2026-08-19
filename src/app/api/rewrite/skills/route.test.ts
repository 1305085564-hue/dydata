import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { buildRewriteSkillsPostResponse } from "./route";

function request(scope: "private" | "platform" | "public_user") {
  return new NextRequest("https://dydata.cc/api/rewrite/skills", {
    method: "POST",
    body: JSON.stringify({ scope, key: "review", name: "复盘", systemPrompt: "prompt" }),
  });
}

function deps(permissionInfo: { role: "owner" | "admin"; permissions: Record<string, boolean> }) {
  let serviceCreated = false;
  return {
    values: {
      requireAuth: async () => ({ user: { id: "user-1" } }),
      parseJsonBody: async (req: NextRequest) => req.json(),
      getUserPermissions: async () => ({ ...permissionInfo, userId: "user-1" }),
      createServiceClient: () => {
        serviceCreated = true;
        return {} as never;
      },
      createSkill: async () => ({ skill: { id: "skill-1" }, version: { id: "version-1" } }) as never,
      jsonResponse: (body: unknown, status = 200) => Response.json(body, { status }),
      errorResponse: (error: string, status: number) => Response.json({ error }, { status }),
    },
    wasServiceCreated: () => serviceCreated,
  };
}

test("旧 owner 名称不能绕过集团级 skill 权限", async () => {
  const mocked = deps({ role: "owner", permissions: {} });
  const response = await buildRewriteSkillsPostResponse(request("platform"), mocked.values as never);

  assert.equal(response.status, 403);
  assert.equal(mocked.wasServiceCreated(), false);
});

test("有效集团权限可以创建集团级 skill", async () => {
  const mocked = deps({ role: "admin", permissions: { manage_system: true } });
  const response = await buildRewriteSkillsPostResponse(request("platform"), mocked.values as never);

  assert.equal(response.status, 201);
  assert.equal(mocked.wasServiceCreated(), true);
});
