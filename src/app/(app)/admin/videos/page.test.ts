import assert from "node:assert/strict";
import test from "node:test";

import VideosRedirectPage from "./page";

async function captureRedirectDigest(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    const digest = (error as { digest?: unknown }).digest;
    assert.equal(typeof digest, "string", `重定向必须抛出带 digest 的 NEXT_REDIRECT，实际：${String(digest)}`);
    return digest as string;
  }
  throw new Error("预期发生重定向，但没有抛出 NEXT_REDIRECT");
}

test("旧素材库入口永久重定向到视频复盘并保留历史深链参数", async () => {
  const digest = await captureRedirectDigest(() =>
    VideosRedirectPage({
      searchParams: Promise.resolve({
        view: "all",
        scope: "team",
        teamId: "team-1",
        videoId: "video-9",
        无关参数: "x",
      }),
    }),
  );

  assert.match(
    digest,
    /^NEXT_REDIRECT;replace;\/admin\/content\?view=all&scope=team&teamId=team-1&videoId=video-9;\d{3};$/,
    `实际 digest：${digest}`,
  );
  assert.doesNotMatch(digest, /无关参数/);
});

test("没有深链参数时不带查询串", async () => {
  const digest = await captureRedirectDigest(() => VideosRedirectPage({}));

  assert.match(digest, /^NEXT_REDIRECT;replace;\/admin\/content;\d{3};$/, `实际 digest：${digest}`);
});

test("非字符串或空值的深链参数被丢弃", async () => {
  const digest = await captureRedirectDigest(() =>
    VideosRedirectPage({ searchParams: Promise.resolve({ view: ["a", "b"], videoId: "" }) }),
  );

  assert.match(digest, /^NEXT_REDIRECT;replace;\/admin\/content;\d{3};$/, `实际 digest：${digest}`);
});
