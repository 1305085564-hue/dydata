import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const listPage = readFileSync(new URL("../../../(app)/topics/page.tsx", import.meta.url), "utf8");
const detailPage = readFileSync(new URL("../../../(app)/topics/[id]/page.tsx", import.meta.url), "utf8");

test("两处选题替换都调用单一后端 replace-claim 入口", () => {
  for (const source of [listPage, detailPage]) {
    assert.match(source, /\/api\/topics\/sub-topics\/replace-claim/);
    assert.doesNotMatch(source, /selectedReturnId}\/return[\s\S]{0,300}targetClaimId}\/claim/);
  }
});
