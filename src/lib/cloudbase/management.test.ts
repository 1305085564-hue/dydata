import test from "node:test";
import assert from "node:assert/strict";
import { createCloudBaseUserManagement, mapSupabaseBanDuration } from "./management";

const user = (id: string, banned = true) => ({ id, banned_until: banned ? "infinity" : null });
const ok = async (subject: string, status: 1 | 3) => ({ data: { subject, status }, error: null });

test("ban duration accepts only permanent archive and explicit restore", () => {
  assert.equal(mapSupabaseBanDuration("none"), 1);
  assert.equal(mapSupabaseBanDuration("876000h"), 3);
  for (const value of ["1h30m", "1h", "0s", "NaNh", "forever", null]) assert.equal(mapSupabaseBanDuration(value), null);
});

test("restore writes ACTIVE and independently reads back the same target", async () => {
  const calls: unknown[] = [];
  const management = createCloudBaseUserManagement({
    async writeUserStatus(subject, status) { calls.push({ subject, status }); return ok(subject, status); },
    async getUserById(id) { calls.push({ lookup: id }); return { user: user(id, false) }; },
  });
  const result = await management.updateUserById("subject", { ban_duration: "none" });
  assert.equal(result.error, null);
  assert.deepEqual(calls, [{ subject: "subject", status: 1 }, { lookup: "subject" }]);
  assert.deepEqual(result.data.user, user("subject", false));
});

test("stale independent projection is retried without repeating the status write", async () => {
  let writes = 0, reads = 0;
  const sleeps: number[] = [];
  const management = createCloudBaseUserManagement({
    async writeUserStatus(subject, status) { writes++; return ok(subject, status); },
    async getUserById(id) { reads++; return { user: user(id, reads > 1) }; },
    readBackAttempts: 3, readBackIntervalMs: 7, sleep: async ms => { sleeps.push(ms); },
  });
  assert.equal((await management.updateUserById("subject", { ban_duration: "876000h" })).error, null);
  assert.equal(writes, 1); assert.equal(reads, 2); assert.deepEqual(sleeps, [7]);
});

test("stale, missing, failed and incomplete projections never report success", async () => {
  for (const readback of [{ user: user("subject", false) }, { user: null }, { user: {}, error: new Error("private") }, { user: { id: "subject" } }]) {
    let writes = 0, reads = 0;
    const management = createCloudBaseUserManagement({
      async writeUserStatus(subject, status) { writes++; return ok(subject, status); },
      async getUserById() { reads++; return readback; }, readBackAttempts: 3, sleep: async () => {},
    });
    const result = await management.updateUserById("subject", { ban_duration: "876000h" });
    assert.equal(result.data.user, null); assert.equal(result.error?.code, "status_pending");
    assert.equal(writes, 1); assert.equal(reads, 3);
  }
});

test("readback of another subject is a hard failure", async () => {
  const management = createCloudBaseUserManagement({ writeUserStatus: ok, async getUserById() { return { user: user("other") }; } });
  assert.equal((await management.updateUserById("subject", { ban_duration: "876000h" })).error?.code, "readback_subject_mismatch");
});

test("invalid fields and durations never invoke the writer or readback", async () => {
  let calls = 0;
  const management = createCloudBaseUserManagement({
    async writeUserStatus() { calls++; throw Error("must not run"); },
    async getUserById() { calls++; throw Error("must not run"); },
  });
  for (const attributes of [{ password: "unused" }, { user_metadata: {} }, { ban_duration: "none", email: "other" }, null, []]) {
    assert.equal((await management.updateUserById("subject", attributes)).error?.code, "unsupported_operation");
  }
  assert.equal((await management.updateUserById("subject", { ban_duration: "forever" })).error?.code, "invalid_ban_duration");
  for (const id of ["", " subject", "x".repeat(65)]) assert.equal((await management.updateUserById(id, { ban_duration: "none" })).error?.code, "invalid_user_id");
  assert.equal(calls, 0);
});

test("wrong-subject, wrong-status and error write acknowledgments stop before readback", async () => {
  for (const ack of [null, [], { subject: "other", status: 3 }, { subject: "subject", status: 1 }]) {
    let reads = 0;
    const management = createCloudBaseUserManagement({
      async writeUserStatus() { return { data: ack, error: null }; },
      async getUserById() { reads++; return { user: user("subject") }; },
    });
    assert.equal((await management.updateUserById("subject", { ban_duration: "876000h" })).error?.code, "management_rejected");
    assert.equal(reads, 0);
  }
});

test("writer failures and readback timeouts return safe errors without credentials", async () => {
  for (const throwing of [false, true]) {
    const management = createCloudBaseUserManagement({
      async writeUserStatus() { if (throwing) throw Error("private-credential"); return { data: { subject: "subject", status: 3 }, error: new Error("private-credential") }; },
      async getUserById() { throw Error("must not run"); },
    });
    const result = await management.updateUserById("subject", { ban_duration: "876000h" });
    assert.ok(result.error); assert.doesNotMatch(result.error.message, /private-credential/); assert.equal(result.data.user, null);
  }
  const management = createCloudBaseUserManagement({ writeUserStatus: ok, getUserById: async () => new Promise(() => {}), readBackTimeoutMs: 5 });
  const result = await management.updateUserById("subject", { ban_duration: "876000h" });
  assert.equal(result.error?.code, "status_pending"); assert.equal(result.data.user, null);
});
