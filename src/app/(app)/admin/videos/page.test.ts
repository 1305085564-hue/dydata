import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("旧素材库入口永久重定向到视频复盘并保留历史深链参数", () => {
  assert.match(source, /permanentRedirect/);
  assert.match(source, /\["view", "scope", "teamId", "videoId"\]/);
  assert.match(source, /`\/admin\/content/);
});
