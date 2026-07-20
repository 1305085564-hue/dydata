import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { DELETE } from "./route";

test("历史 work_submissions 删除接口始终拒绝成员", async () => {
  const response = await DELETE(
    new NextRequest("https://dydata.cc/api/work-submissions/00000000-0000-0000-0000-000000000000", { method: "DELETE" }),
    { params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }) },
  );
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "历史产量凭证不可删除" });
});
