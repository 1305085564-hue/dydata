import assert from "node:assert/strict";
import test from "node:test";

import {
  filterOwnedWorkScreenshotPaths,
  verifyOwnedWorkScreenshotPaths,
} from "./route";

test("作品提交只接受当前用户目录下的截图路径", () => {
  assert.deepEqual(
    filterOwnedWorkScreenshotPaths("user-1", [
      "user-1/2026-07-18/a.png",
      "user-2/2026-07-18/b.png",
      "user-1x/2026-07-18/c.png",
    ]),
    ["user-1/2026-07-18/a.png"],
  );
});

test("作品提交在写库前确认每个对象存在", async () => {
  const valid = await verifyOwnedWorkScreenshotPaths(
    {
      storage: {
        from: () => ({
          createSignedUrls: async (paths: string[]) => ({
            data: paths.map((path) => ({ path, signedUrl: `signed:${path}` })),
            error: null,
          }),
        }),
      },
    } as never,
    "user-1",
    ["user-1/2026-07-18/a.png"],
  );
  assert.equal(valid, true);

  const foreign = await verifyOwnedWorkScreenshotPaths(
    { storage: { from: () => { throw new Error("must reject before signing"); } } } as never,
    "user-1",
    ["user-2/2026-07-18/b.png"],
  );
  assert.equal(foreign, false);
});
