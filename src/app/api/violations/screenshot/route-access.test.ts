import test from "node:test";
import assert from "node:assert/strict";

import { NextRequest } from "next/server";

import { buildViolationScreenshotResponse } from "./[...path]/route";

function createRequest(path: string[]) {
  return new NextRequest(`https://dydata.cc/api/violations/screenshot/${path.join("/")}`);
}

function createSupabaseForScreenshotRoute({
  violationPaths = [],
  publishDraftRows = [],
}: {
  violationPaths?: string[];
  publishDraftRows?: Array<{ id: string; submitted_by: string | null; status: string | null; screenshot_paths: string[] }>;
}) {
  return {
    from(table: string) {
      return {
        select(query: string) {
          if (table === "violation_cases") {
            assert.equal(query, "id");
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
                  data: violationPaths.includes(targetPath) ? [{ id: "case-1" }] : [],
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
      getAuthenticatedContext: async () => ({ user: { id: "viewer-1" } }),
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

test("screenshot route 继续拒绝既不属于违规案例也不属于本人或已通过稿件的路径", async () => {
  const response = await buildViolationScreenshotResponse(
    createRequest(["other-user", "publish-drafts", "private.png"]),
    { params: Promise.resolve({ path: ["other-user", "publish-drafts", "private.png"] }) },
    {
      getAuthenticatedContext: async () => ({ user: { id: "viewer-1" } }),
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
