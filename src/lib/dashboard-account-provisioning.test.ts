import test from "node:test";
import assert from "node:assert/strict";

import { ensureDefaultDashboardAccount } from "./dashboard-account-provisioning";

function createFakeAccountsClient(existingRows: Array<{ id: string; name: string }> = []) {
  const inserts: Array<{ profile_id: string; name: string }> = [];

  const client = {
    from(table: string) {
      assert.equal(table, "accounts");
      return {
        select() {
          return {
            eq(column: string, value: string) {
              assert.equal(column, "profile_id");
              assert.equal(value, "user-1");
              return {
                limit() {
                  return Promise.resolve({ data: existingRows, error: null });
                },
              };
            },
          };
        },
        insert(payload: { profile_id: string; name: string }) {
          inserts.push(payload);
          return Promise.resolve({ data: [{ id: "account-1", ...payload }], error: null });
        },
      };
    },
  };

  return { client, inserts };
}

test("已有账号时不重复创建默认账号", async () => {
  const { client, inserts } = createFakeAccountsClient([{ id: "account-old", name: "雷洋" }]);

  const result = await ensureDefaultDashboardAccount({
    adminSupabase: client as never,
    profileId: "user-1",
    preferredName: "雷洋",
  });

  assert.deepEqual(result, { created: false });
  assert.deepEqual(inserts, []);
});

test("没有账号时创建同名默认账号", async () => {
  const { client, inserts } = createFakeAccountsClient();

  const result = await ensureDefaultDashboardAccount({
    adminSupabase: client as never,
    profileId: "user-1",
    preferredName: "  雷洋  ",
  });

  assert.deepEqual(result, { created: true });
  assert.deepEqual(inserts, [{ profile_id: "user-1", name: "雷洋" }]);
});
