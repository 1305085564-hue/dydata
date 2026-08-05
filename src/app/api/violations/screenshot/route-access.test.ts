import test from "node:test";
import assert from "node:assert/strict";
import type { User } from "@supabase/supabase-js";

import { NextRequest } from "next/server";

import { buildViolationScreenshotResponse } from "./[...path]/route";

function createRequest(path: string[]) {
  return new NextRequest(`https://dydata.cc/api/violations/screenshot/${path.join("/")}`);
}

function createSupabaseForScreenshotRoute({
  violationPaths = [],
  violationRows = [],
  knowledgeRows = [],
  publishDraftRows = [],
}: {
  violationPaths?: string[];
  violationRows?: Array<{
    id: string;
    submitted_by: string | null;
    status: string | null;
    screenshot_paths: string[];
  }>;
  knowledgeRows?: Array<{
    id: string;
    submitted_by: string | null;
    status: string | null;
    screenshot_paths: string[];
  }>;
  publishDraftRows?: Array<{ id: string; submitted_by: string | null; status: string | null; screenshot_paths: string[] }>;
}) {
  return {
    from(table: string) {
      return {
        select(query: string) {
          if (table === "violation_cases") {
            let targetPath = "";
            return {
              contains(_column: string, value: string[]) {
                targetPath = value[0] ?? "";
                return this;
              },
              eq() {
                return this;
              },
              limit() {
                return Promise.resolve({
                  data: violationRows.length > 0
                    ? violationRows
                      .filter((row) => row.screenshot_paths.includes(targetPath))
                      .map(({ id, submitted_by, status }) => ({ id, submitted_by, status }))
                    : violationPaths.includes(targetPath) ? [{ id: "case-1" }] : [],
                  error: null,
                });
              },
            };
          }

          if (table === "knowledge_cases") {
            let targetPath = "";
            return {
              contains(_column: string, value: string[]) {
                targetPath = value[0] ?? "";
                return this;
              },
              limit() {
                return Promise.resolve({
                  data: knowledgeRows
                    .filter((row) => row.screenshot_paths.includes(targetPath))
                    .map(({ id, submitted_by, status }) => ({ id, submitted_by, status })),
                  error: null,
                });
              },
            };
          }

          assert.equal(table, "publish_drafts");
          assert.equal(query, "id, submitted_by, status");
          let targetPath = "";
          return {
            contains(_column: string, value: string[]) {
              targetPath = value[0] ?? "";
              return this;
            },
            eq() {
              return this;
            },
            limit() {
              return Promise.resolve({
                data: publishDraftRows
                  .filter((row) => row.screenshot_paths.includes(targetPath))
                  .map(({ id, submitted_by, status }) => ({ id, submitted_by, status })),
                error: null,
              });
            },
          };
        },
      };
    },
    storage: {
      from(bucket: string) {
        assert.equal(bucket, "violation-screenshots");
        return {
          async createSignedUrl(path: string, expiresIn: number) {
            assert.equal(expiresIn, 3600);
            return {
              data: { signedUrl: `https://signed.example/${encodeURIComponent(path)}` },
              error: null,
            };
          },
        };
      },
    },
  };
}

test("screenshot route 允许已通过 publish_drafts 的历史截图", async () => {
  const response = await buildViolationScreenshotResponse(
    createRequest(["shared-user", "publish-drafts", "shot.png"]),
    { params: Promise.resolve({ path: ["shared-user", "publish-drafts", "shot.png"] }) },
    {
      getAuthenticatedContext: async () => ({
        supabase: {} as never,
        user: { id: "viewer-1" } as User,
      }),
      createAdminClient: () =>
        createSupabaseForScreenshotRoute({
          publishDraftRows: [
            {
              id: "draft-1",
              submitted_by: "owner-1",
              status: "approved",
              screenshot_paths: ["shared-user/publish-drafts/shot.png"],
            },
          ],
        }) as never,
    },
  );

  assert.equal(response.status, 307);
  assert.equal(
    response.headers.get("location"),
    "https://signed.example/shared-user%2Fpublish-drafts%2Fshot.png",
  );
});

test("screenshot route 拒绝普通成员读取待审核案例截图", async () => {
  const response = await buildViolationScreenshotResponse(
    createRequest(["author-1", "pending.png"]),
    { params: Promise.resolve({ path: ["author-1", "pending.png"] }) },
    {
      getAuthenticatedContext: async () => ({
        supabase: {} as never,
        user: { id: "member-1" } as User,
      }),
      getUserProfile: async () => ({
        role: "member",
        permissions: { manage_violations: false },
      }),
      createAdminClient: () => createSupabaseForScreenshotRoute({
        violationRows: [{
          id: "case-pending",
          submitted_by: "author-1",
          status: "submitted",
          screenshot_paths: ["author-1/pending.png"],
        }],
      }) as never,
    } as never,
  );

  assert.equal(response.status, 404);
});

test("screenshot route 允许普通成员读取已验证案例截图", async () => {
  const response = await buildViolationScreenshotResponse(
    createRequest(["author-1", "verified.png"]),
    { params: Promise.resolve({ path: ["author-1", "verified.png"] }) },
    {
      getAuthenticatedContext: async () => ({
        supabase: {} as never,
        user: { id: "member-1" } as User,
      }),
      getUserProfile: async () => ({
        role: "member",
        permissions: { manage_violations: false },
      }),
      createAdminClient: () => createSupabaseForScreenshotRoute({
        violationRows: [{
          id: "case-verified",
          submitted_by: "author-1",
          status: "verified",
          screenshot_paths: ["author-1/verified.png"],
        }],
      }) as never,
    } as never,
  );

  assert.equal(response.status, 307);
});

test("screenshot route 允许普通成员读取已验证 knowledge_cases 截图", async () => {
  const response = await buildViolationScreenshotResponse(
    createRequest(["author-1", "conversion-verified.png"]),
    { params: Promise.resolve({ path: ["author-1", "conversion-verified.png"] }) },
    {
      getAuthenticatedContext: async () => ({
        supabase: {} as never,
        user: { id: "member-1" } as User,
      }),
      getUserProfile: async () => ({
        role: "member",
        permissions: { manage_violations: false },
      }),
      createAdminClient: () => createSupabaseForScreenshotRoute({
        knowledgeRows: [{
          id: "knowledge-verified",
          submitted_by: "author-1",
          status: "verified",
          screenshot_paths: ["author-1/conversion-verified.png"],
        }],
      }) as never,
    } as never,
  );

  assert.equal(response.status, 307);
});

test("screenshot route 允许有复核权限的管理员读取待审核截图", async () => {
  const response = await buildViolationScreenshotResponse(
    createRequest(["author-1", "admin.png"]),
    { params: Promise.resolve({ path: ["author-1", "admin.png"] }) },
    {
      getAuthenticatedContext: async () => ({
        supabase: {} as never,
        user: { id: "admin-1" } as User,
      }),
      getUserProfile: async () => ({
        role: "member",
        permissions: { manage_violations: true },
      }),
      createAdminClient: () => createSupabaseForScreenshotRoute({
        violationRows: [{
          id: "case-pending",
          submitted_by: "author-1",
          status: "submitted",
          screenshot_paths: ["author-1/admin.png"],
        }],
      }) as never,
    } as never,
  );

  assert.equal(response.status, 307);
});

test("screenshot route 继续拒绝既不属于违规案例也不属于本人或已通过稿件的路径", async () => {
  const response = await buildViolationScreenshotResponse(
    createRequest(["other-user", "publish-drafts", "private.png"]),
    { params: Promise.resolve({ path: ["other-user", "publish-drafts", "private.png"] }) },
    {
      getAuthenticatedContext: async () => ({
        supabase: {} as never,
        user: { id: "viewer-1" } as User,
      }),
      createAdminClient: () =>
        createSupabaseForScreenshotRoute({
          publishDraftRows: [
            {
              id: "draft-2",
              submitted_by: "other-user",
              status: "pending",
              screenshot_paths: ["other-user/publish-drafts/private.png"],
            },
          ],
        }) as never,
    },
  );

  assert.equal(response.status, 404);
  const body = await response.json();
  assert.deepEqual(body.error, {
    code: "NOT_FOUND",
    message: "截图不存在",
  });
});
