import test from "node:test";
import assert from "node:assert/strict";

import { parseMarkPayload, parseRemovePayload, requireOwnerOrAdminRole } from "./_shared";

const USER_ID = "123e4567-e89b-42d3-a456-426614174000";

test("fulfillment mark payload 校验 uuid、日期和状态", async () => {
  const invalidUuid = parseMarkPayload({ userId: "bad", recordDate: "2026-06-03", status: "leave" });
  assert.equal("response" in invalidUuid && invalidUuid.response.status, 400);

  const invalidDate = parseMarkPayload({ userId: USER_ID, recordDate: "2026-02-31", status: "leave" });
  assert.equal("response" in invalidDate && invalidDate.response.status, 400);

  const invalidStatus = parseMarkPayload({ userId: USER_ID, recordDate: "2026-06-03", status: "published" });
  assert.equal("response" in invalidStatus && invalidStatus.response.status, 400);

  const valid = parseMarkPayload({
    userId: ` ${USER_ID} `,
    recordDate: "2026-06-03",
    status: "confirmed_published",
    reason: " 已发 ",
  });
  assert.deepEqual("data" in valid && valid.data, {
    userId: USER_ID,
    recordDate: "2026-06-03",
    status: "confirmed_published",
    reason: "已发",
  });
});

test("fulfillment remove payload 校验 uuid 和日期", async () => {
  const invalid = parseRemovePayload({ userId: USER_ID, recordDate: "2026-13-01" });
  assert.equal("response" in invalid && invalid.response.status, 400);

  const valid = parseRemovePayload({ userId: USER_ID, recordDate: "2026-06-03" });
  assert.deepEqual("data" in valid && valid.data, {
    userId: USER_ID,
    recordDate: "2026-06-03",
  });
});

test("fulfillment 写接口只允许 admin 或 owner 角色", async () => {
  const memberResponse = requireOwnerOrAdminRole({
    actor: { role: "member" },
  } as never);
  assert.equal(memberResponse?.status, 403);

  const adminResponse = requireOwnerOrAdminRole({
    actor: { role: "admin" },
  } as never);
  assert.equal(adminResponse, null);

  const ownerResponse = requireOwnerOrAdminRole({
    actor: { role: "owner" },
  } as never);
  assert.equal(ownerResponse, null);
});
