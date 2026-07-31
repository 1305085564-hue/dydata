import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./[feature_key]/route.ts", import.meta.url), "utf8");

test("旧 AI 功能接口只保留文案改写的兼容提示词写入", () => {
  assert.match(source, /getAiFeatureCatalogEntry/);
  assert.match(source, /featureKey !== "content_rewrite"/);
  assert.match(source, /请在 AI 总控中管理业务功能/);
});
