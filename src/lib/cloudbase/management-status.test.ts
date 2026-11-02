import test from "node:test";
import assert from "node:assert/strict";
import { createCloudBaseUserManagement } from "./management";

test("archive uses the service-only PG status writer and verifies its exact subject", async () => {
  const calls: unknown[] = [];
  const management = createCloudBaseUserManagement({
    async writeUserStatus(subject: string, status: number) {
      calls.push({ subject, status });
      return { data: { subject, status }, error: null };
    },
    async getUserById(subject: string) {
      return { user: { id: subject, banned_until: "infinity" } };
    },
  });
  const result = await management.updateUserById("subject", { ban_duration: "876000h" });
  assert.equal(result.error, null);
  assert.deepEqual(calls, [{ subject: "subject", status: 3 }]);
});
