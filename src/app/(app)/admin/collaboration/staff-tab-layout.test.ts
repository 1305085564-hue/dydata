import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./staff-tab.tsx", import.meta.url), "utf8");

test("岗位表格把长作品标题限制在作品列内", () => {
  assert.match(source, /<Table className=\{`[^`]*table-fixed/);
  assert.match(
    source,
    /<TableCell className="[^"]*overflow-hidden[^"]*">[\s\S]*?<CollaborationWorkReviewLink[\s\S]*?className="[^"]*truncate[^"]*"/,
  );
  assert.match(
    source,
    /<table className="[^"]*table-fixed[^"]*">[\s\S]*?<CollaborationWorkReviewLink[\s\S]*?className="[^"]*truncate[^"]*"/,
  );
});
