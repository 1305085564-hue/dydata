import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("正式选题库入口使用 V2 组件并保留页面 metadata", () => {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

  assert.match(source, /import \{ TopicHubV2 \} from "@\/components\/topics-v2\/TopicHubV2";/);
  assert.match(source, /title: "选题库 - DYData"/);
  assert.match(source, /return <TopicHubV2 canManageTopicLibrary=\{canManageTopicLibrary\} \/>;/);
});
