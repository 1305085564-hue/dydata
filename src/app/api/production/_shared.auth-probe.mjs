import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test, { before, mock } from "node:test";

let currentUser = null;
const supabase = { tag: "signed-in-supabase" };

function mockFile(relativePath, namedExports) {
  mock.module(pathToFileURL(resolve(process.cwd(), relativePath)).href, { namedExports });
}

let requireSignedInUser;

before(async () => {
  mockFile("src/lib/supabase/server.ts", {
    createClient: async () => ({
      ...supabase,
      auth: { getUser: async () => ({ data: { user: currentUser } }) },
    }),
  });
  ({ requireSignedInUser } = await import("./_shared.ts"));
});

test("没有登录会话时返回 401，不继续读取业务数据", async () => {
  currentUser = null;
  const result = await requireSignedInUser();
  assert.equal(result.response.status, 401);
  assert.equal((await result.response.json()).error, "未登录");
  assert.equal("user" in result, false);
});

test("已登录时返回同一个 supabase 客户端与用户，不重复解析身份", async () => {
  currentUser = { id: "user-1", email: "member@example.com" };
  const result = await requireSignedInUser();
  assert.equal("response" in result, false);
  assert.equal(result.user.id, "user-1");
  assert.equal(result.supabase.tag, "signed-in-supabase");
});
