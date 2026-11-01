import assert from "node:assert/strict";
import test from "node:test";

import { AUTH_IMPORT_ENV_ID, buildAuthImportPlan, buildAuthImportRollback } from "./auth-import.mjs";

const CAPTURED_AT = "2026-10-31T12:00:00.000Z";

function sourceUser(index, overrides = {}) {
  const number = String(index).padStart(12, "0");
  return {
    id: `00000000-0000-4000-8000-${number}`,
    email: `member-${index}@example.test`,
    encrypted_password: `$2a$10$${"A".repeat(53)}`,
    email_confirmed_at: "2024-01-02T03:04:05.123456Z",
    banned_until: null,
    created_at: "2024-01-02T03:04:05.123456Z",
    ...overrides,
  };
}

function sourceUsers(count = 84) {
  return Array.from({ length: count }, (_, index) => sourceUser(index + 1));
}

function buildPlan(overrides = {}) {
  const users = overrides.sourceUsers ?? sourceUsers();
  return buildAuthImportPlan({
    sourceUsers: users,
    targetIdentities: overrides.targetIdentities ?? [],
    capturedAt: overrides.capturedAt ?? CAPTURED_AT,
    ...(overrides.sampleIds ? { sampleIds: overrides.sampleIds } : {}),
  });
}

test("full import plan preserves UUID subjects and base64 bcrypt while returning only a redacted summary", () => {
  const source = sourceUsers();
  for (let index = 0; index < 24; index += 1) source[index].banned_until = "2026-10-31T12:00:01.000Z";
  source[1].banned_until = "infinity";
  source[2].banned_until = "-infinity";
  source[25].banned_until = "2026-10-31T12:00:01.000Z";
  source[24].email_confirmed_at = null;
  const plan = buildPlan({ sourceUsers: source });

  assert.equal(plan.summary.environment, AUTH_IMPORT_ENV_ID);
  assert.equal(plan.summary.importCount, 84);
  assert.equal(plan.summary.batchCount, 2);
  assert.deepEqual(plan.summary.statusCounts, { active: 59, pending: 1, disabled: 24 });
  assert.equal(plan.expectedPlan.userCount, 84);
  assert.match(plan.expectedPlan.sha256, /^[a-f0-9]{64}$/);
  assert.match(plan.summary.planSha256, /^[a-f0-9]{64}$/);
  assert.equal(plan.expectedPlan.bindingSha256, plan.summary.planSha256);
  assert.equal(JSON.stringify(plan.summary).includes(source[0].email), false);
  assert.equal(JSON.stringify(plan.summary).includes(source[0].encrypted_password), false);

  const firstSql = plan.batches[0].sql;
  assert.match(firstSql, /^BEGIN;\nLOCK TABLE auth\.users IN SHARE ROW EXCLUSIVE MODE;\nDO \$auth_import_guard\$/m);
  assert.match(firstSql, /LOCK TABLE auth\.users IN SHARE ROW EXCLUSIVE MODE;/);
  assert.match(firstSql, /DO \$auth_import_guard\$/);
  assert.match(firstSql, /RAISE EXCEPTION 'Auth import target identity conflict'/);
  assert.match(firstSql, /RETURNING id::text, sub;/);
  assert.match(firstSql, /"sub"/);
  assert.match(firstSql, /"password"/);
  assert.match(firstSql, /"email_verified"/);
  const expectedRows = plan.batches.flatMap((batch) => batch.expectedRows);
  assert.equal(expectedRows.filter((row) => row.email_verified === false).length, 1);
  assert.ok(expectedRows.filter((row) => row.sub !== source[24].id).every((row) => row.email_verified === true));
  assert.match(firstSql, /"project"/);
  assert.match(firstSql, /'dydata-d6g0gd1v37fcddf21'/);
  assert.match(firstSql, /'internal'/);
  assert.match(firstSql, /'\[\]'::jsonb/);
  assert.match(firstSql, /'2024-01-02T03:04:05\.123456Z'::timestamptz/);
  assert.match(firstSql, /, 3, E'internal',[^\n]+, true\)/);
  assert.match(firstSql, /, 2, E'internal',[^\n]+, false\)/);
  assert.doesNotMatch(firstSql, /"id"\s*,/);

  const encodedBcrypt = Buffer.from(source[0].encrypted_password, "utf8").toString("base64");
  assert.equal(encodedBcrypt.length, 80);
  assert.ok(firstSql.includes(`'${encodedBcrypt}'`));
  assert.ok(firstSql.includes(`'${source[0].id}'`));
});

test("a requested sample is planned exactly and still uses the fixed captured time", () => {
  const users = [sourceUser(10), sourceUser(11), sourceUser(12)];
  users[1].banned_until = "2026-10-31T11:59:59.000Z";
  const plan = buildAuthImportPlan({
    sourceUsers: users,
    targetIdentities: [],
    sampleIds: [users[1].id],
    capturedAt: CAPTURED_AT,
  });

  assert.equal(plan.summary.mode, "sample");
  assert.equal(plan.summary.importCount, 1);
  assert.deepEqual(plan.summary.statusCounts, { active: 1, pending: 0, disabled: 0 });
  assert.ok(plan.batches[0].sql.includes(`'${users[1].id}'`));
  assert.ok(!plan.batches[0].sql.includes(`'${users[0].id}'`));
});

test("the complete import requires exactly 84 unique source users", () => {
  assert.throws(() => buildPlan({ sourceUsers: sourceUsers(83) }), /84/);
  const duplicate = sourceUsers();
  duplicate[1].id = duplicate[0].id;
  assert.throws(() => buildPlan({ sourceUsers: duplicate }), /duplicate/i);
  const duplicateEmail = sourceUsers();
  duplicateEmail[1].email = duplicateEmail[0].email.toUpperCase();
  assert.throws(() => buildPlan({ sourceUsers: duplicateEmail }), /duplicate/i);
});

test("rejects malformed bcrypt, UUID, email, timestamp, and invalid sample selection", () => {
  const invalid = sourceUsers();
  invalid[0].encrypted_password = `$2b$10$${"A".repeat(53)}`;
  assert.throws(() => buildPlan({ sourceUsers: invalid }), /bcrypt/i);

  const invalidUuid = sourceUsers();
  invalidUuid[0].id = "not-a-uuid";
  assert.throws(() => buildPlan({ sourceUsers: invalidUuid }), /UUID/i);

  const invalidEmail = sourceUsers();
  invalidEmail[0].email = " member@example.test";
  assert.throws(() => buildPlan({ sourceUsers: invalidEmail }), /email/i);

  const invalidTimestamp = sourceUsers();
  invalidTimestamp[0].created_at = "yesterday";
  assert.throws(() => buildPlan({ sourceUsers: invalidTimestamp }), /created_at/i);
  const missingConfirmation = sourceUsers();
  delete missingConfirmation[0].email_confirmed_at;
  assert.throws(() => buildPlan({ sourceUsers: missingConfirmation }), /email_confirmed_at/i);
  const invalidConfirmation = sourceUsers();
  invalidConfirmation[0].email_confirmed_at = "later";
  assert.throws(() => buildPlan({ sourceUsers: invalidConfirmation }), /email_confirmed_at/i);
  const invalidBanTimestamp = sourceUsers();
  invalidBanTimestamp[0].banned_until = "sometime";
  assert.throws(() => buildPlan({ sourceUsers: invalidBanTimestamp }), /banned_until/i);
  for (const absent of ["missing", "undefined"]) {
    const unknownBan = sourceUsers();
    if (absent === "missing") delete unknownBan[0].banned_until;
    else unknownBan[0].banned_until = undefined;
    assert.throws(() => buildPlan({ sourceUsers: unknownBan }), /banned_until/i);
  }

  const sample = sourceUsers(1);
  assert.throws(() => buildAuthImportPlan({
    sourceUsers: sample,
    targetIdentities: [],
    sampleIds: ["00000000-0000-4000-8000-999999999999"],
    capturedAt: CAPTURED_AT,
  }), /sample/i);
});

test("refuses any existing target sub, username, or email collision without generating overwrite SQL", () => {
  const first = sourceUser(1);
  for (const targetIdentities of [
    [{ sub: first.id, username: "other@example.test", email: "other@example.test" }],
    [{ sub: "existing-sub", username: first.email.toUpperCase(), email: "other@example.test" }],
    [{ sub: "existing-sub", username: "other@example.test", email: first.email }],
  ]) {
    assert.throws(() => buildPlan({ targetIdentities }), /target.*conflict|identity.*conflict/i);
  }
  assert.throws(() => buildPlan({ targetIdentities: [{ sub: "s", username: "x@example.test", email: "x@example.test" }, { sub: "s", username: "y@example.test", email: "y@example.test" }] }), /target.*duplicate|duplicate.*target/i);
});

test("packs at most 50 rows per transaction and binds returned internal IDs to exact rollback rows", () => {
  const plan = buildPlan();
  assert.equal(plan.batches.length, 2);
  assert.match(plan.batches[0].sql, /COMMIT;$/);
  assert.equal((plan.batches[0].sql.match(/\),\n\(/g) ?? []).length, 49);
  assert.equal((plan.batches[1].sql.match(/\),\n\(/g) ?? []).length, 33);
  assert.equal("rollbackBatches" in plan, false);

  assert.throws(() => buildAuthImportRollback(plan, []), /complete|receipt/i);
  const receipts = plan.batches.map((batch) => ({
    batchIndex: batch.index,
    planSha256: plan.summary.planSha256,
    batchSha256: batch.sha256,
    rows: batch.expectedRows.map((row, index) => ({
      id: String(9007199254740993123n + BigInt((batch.index - 1) * 50 + index)),
      sub: row.sub,
    })),
  }));
  const rollback = buildAuthImportRollback(plan, receipts);
  assert.equal(rollback.rollbackBatches.length, 2);
  const rollbackSql = rollback.rollbackBatches[0].sql;
  assert.match(rollbackSql, /^BEGIN;\nLOCK TABLE auth\.users IN SHARE ROW EXCLUSIVE MODE;\nDELETE FROM auth\.users AS target/m);
  assert.match(rollbackSql, /target\."id"::text = E'9007199254740993123'/);
  assert.match(rollbackSql, /target\."project" = E'dydata-d6g0gd1v37fcddf21'/);
  assert.match(rollbackSql, /target\."sub" = E'00000000-0000-4000-8000-000000000001'/);
  assert.match(rollbackSql, /target\."password" = E'/);
  assert.match(rollbackSql, /target\."email_verified" = true/);
  assert.doesNotMatch(rollbackSql, /ON CONFLICT|DELETE FROM auth\.users\s*;/i);
  assert.match(rollback.rollbackNotice, /另行授权/);
  assert.match(rollback.rollbackNotice, /token.*联动表.*未验证/);

  const missing = receipts.slice(0, 1);
  assert.throws(() => buildAuthImportRollback(plan, missing), /complete|receipt/i);
  for (const key of ["planSha256", "batchSha256"]) {
    const wrongDigest = structuredClone(receipts);
    wrongDigest[0][key] = "0".repeat(64);
    assert.throws(() => buildAuthImportRollback(plan, wrongDigest), /digest|hash|sha|receipt/i);
  }
  const numericId = structuredClone(receipts);
  numericId[0].rows[0].id = 9007199254740993;
  assert.throws(() => buildAuthImportRollback(plan, numericId), /decimal.*string|id/i);
  const duplicateId = structuredClone(receipts);
  duplicateId[1].rows[0].id = duplicateId[0].rows[0].id;
  assert.throws(() => buildAuthImportRollback(plan, duplicateId), /duplicate.*id|id.*duplicate/i);
  const outOfRange = structuredClone(receipts);
  outOfRange[0].rows[0].id = "9223372036854775808";
  assert.throws(() => buildAuthImportRollback(plan, outOfRange), /bigint|range|id/i);
  const wrongSub = structuredClone(receipts);
  wrongSub[0].rows[0].sub = "00000000-0000-4000-8000-999999999999";
  assert.throws(() => buildAuthImportRollback(plan, wrongSub), /sub|receipt/i);
});

test("E-quotes apostrophes and backslashes and rejects SQL NUL bytes", () => {
  const user = sourceUser(1, { email: "o'neil\\ops@example.test" });
  const sql = buildAuthImportPlan({ sourceUsers: [user], targetIdentities: [], sampleIds: [user.id], capturedAt: CAPTURED_AT }).batches[0].sql;
  assert.ok(sql.includes("E'o''neil\\\\ops@example.test'"));

  const nulEmail = sourceUser(1, { email: "member\u0000@example.test" });
  assert.throws(() => buildAuthImportPlan({ sourceUsers: [nulEmail], targetIdentities: [], sampleIds: [nulEmail.id], capturedAt: CAPTURED_AT }), /NUL/i);
  assert.throws(() => buildAuthImportPlan({ sourceUsers: [sourceUser(1)], targetIdentities: [{ sub: "bad\u0000sub" }], sampleIds: [sourceUser(1).id], capturedAt: CAPTURED_AT }), /NUL/i);
});

test("requires the fixed environment and an explicit capturedAt; never logs SQL or identity data", () => {
  const source = sourceUsers();
  const logs = [];
  const oldLog = console.log;
  console.log = (...args) => logs.push(args.join(" "));
  try {
    const plan = buildPlan({ sourceUsers: source });
    assert.ok(plan.batches.length);
  } finally {
    console.log = oldLog;
  }
  assert.deepEqual(logs, []);

  assert.throws(() => buildAuthImportPlan({ sourceUsers: source, targetIdentities: [] }), /capturedAt/i);
  assert.throws(() => buildAuthImportPlan({
    sourceUsers: source,
    targetIdentities: [],
    capturedAt: CAPTURED_AT,
    project: "another-env",
  }), /environment/i);
});

test("maps an explicit unconfirmed email to pending and gives a future ban precedence", () => {
  const user = sourceUser(1, { email_confirmed_at: null });
  const pendingPlan = buildAuthImportPlan({ sourceUsers: [user], targetIdentities: [], sampleIds: [user.id], capturedAt: CAPTURED_AT });
  assert.deepEqual(pendingPlan.summary.statusCounts, { active: 0, pending: 1, disabled: 0 });
  assert.match(pendingPlan.batches[0].sql, /, 2, E'internal',[^\n]+, false\)/);
  const confirmed = sourceUser(1, { email_confirmed_at: "2024-05-01T00:00:00.000Z" });
  const confirmedPlan = buildAuthImportPlan({ sourceUsers: [confirmed], targetIdentities: [], sampleIds: [confirmed.id], capturedAt: CAPTURED_AT });
  assert.notEqual(pendingPlan.summary.expectedPlanSha256, confirmedPlan.summary.expectedPlanSha256);
  assert.notEqual(pendingPlan.summary.planSha256, confirmedPlan.summary.planSha256);

  const pendingBatch = pendingPlan.batches[0];
  const rollback = buildAuthImportRollback(pendingPlan, [{
    batchIndex: pendingBatch.index,
    planSha256: pendingPlan.summary.planSha256,
    batchSha256: pendingBatch.sha256,
    rows: [{ id: "42", sub: user.id }],
  }]);
  assert.match(rollback.rollbackBatches[0].sql, /target\."email_verified" = false/);
  assert.match(rollback.rollbackBatches[0].sql, /target\."status" = 2/);

  const blockedPending = sourceUser(2, { email_confirmed_at: null, banned_until: "infinity" });
  const blockedPlan = buildAuthImportPlan({ sourceUsers: [blockedPending], targetIdentities: [], sampleIds: [blockedPending.id], capturedAt: CAPTURED_AT });
  assert.deepEqual(blockedPlan.summary.statusCounts, { active: 0, pending: 0, disabled: 1 });
  assert.match(blockedPlan.batches[0].sql, /, 3, E'internal',[^\n]+, false\)/);

  const missing = sourceUser(1);
  delete missing.email_confirmed_at;
  assert.throws(() => buildAuthImportPlan({ sourceUsers: [missing], targetIdentities: [], sampleIds: [missing.id], capturedAt: CAPTURED_AT }), /email.*confirm|unknown/i);
});
