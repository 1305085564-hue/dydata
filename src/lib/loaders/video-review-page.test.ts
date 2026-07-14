import test from "node:test";
import assert from "node:assert/strict";

import { attachSignedSubmissionScreenshots } from "./video-review-page";

test("video review 提交截图签名会批量合并为一次 storage 请求", async () => {
  const calls: Array<{ paths: string[]; expiresIn: number }> = [];
  const adminSupabase = {
    storage: {
      from(bucket: string) {
        assert.equal(bucket, "work-screenshots");
        return {
          async createSignedUrls(paths: string[], expiresIn: number) {
            calls.push({ paths, expiresIn });
            return {
              data: paths.map((path) => ({
                path,
                signedUrl: `https://signed.example/${encodeURIComponent(path)}`,
              })),
              error: null,
            };
          },
        };
      },
    },
  };

  const rows = [
    {
      id: "submission-1",
      user_id: "user-1",
      team_id: "team-1",
      group_id: "group-1",
      submit_date: "2026-07-14",
      content_text: "A",
      screenshot_urls: ["a.png", "b.png"],
      note: null,
      created_at: "2026-07-14T09:00:00.000Z",
    },
    {
      id: "submission-2",
      user_id: "user-1",
      team_id: "team-1",
      group_id: "group-1",
      submit_date: "2026-07-14",
      content_text: "B",
      screenshot_urls: ["b.png", "c.png"],
      note: null,
      created_at: "2026-07-14T08:00:00.000Z",
    },
  ];

  const result = await attachSignedSubmissionScreenshots(adminSupabase as never, rows);

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    paths: ["a.png", "b.png", "c.png"],
    expiresIn: 600,
  });
  assert.deepEqual(
    result.map((row) => row.screenshot_items),
    [
      [
        { path: "a.png", signed_url: "https://signed.example/a.png" },
        { path: "b.png", signed_url: "https://signed.example/b.png" },
      ],
      [
        { path: "b.png", signed_url: "https://signed.example/b.png" },
        { path: "c.png", signed_url: "https://signed.example/c.png" },
      ],
    ],
  );
});
