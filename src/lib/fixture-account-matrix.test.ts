import assert from "node:assert/strict";
import test from "node:test";

import {
  BATCH5_FIXTURE_ACCOUNT_SPECS,
  BATCH5_TEAM_NAMES,
  assertUniqueFixtureAliases,
  buildCredentialTableRow,
  buildFixtureEmail,
  isBannedUntil,
} from "./fixture-account-matrix";

test("批次5账号矩阵固定为 A 组员、B 组员和 A 归档样本", () => {
  assert.equal(BATCH5_FIXTURE_ACCOUNT_SPECS.length, 3);
  assert.deepEqual(
    BATCH5_FIXTURE_ACCOUNT_SPECS.map((spec) => [spec.accountNo, spec.teamKey, spec.finalMembershipStatus]),
    [
      [4, "A", "active"],
      [5, "B", "active"],
      [6, "A", "archived"],
    ],
  );
  assert.deepEqual(BATCH5_TEAM_NAMES, {
    A: "深圳二部",
    B: "页面1验证团队1124",
  });
});

test("账号代号重复时拒绝继续，避免覆盖既有凭据或 Profile", () => {
  assert.doesNotThrow(() => assertUniqueFixtureAliases(BATCH5_FIXTURE_ACCOUNT_SPECS));
  assert.throws(
    () => assertUniqueFixtureAliases([BATCH5_FIXTURE_ACCOUNT_SPECS[0], BATCH5_FIXTURE_ACCOUNT_SPECS[0]]),
    /代号重复/,
  );
});

test("邮箱构造只接受安全随机段，凭据表行按原格式生成", () => {
  const generatedEmail = buildFixtureEmail(4, "AbC-123");
  const generatedPassword = ["unit", "placeholder"].join("-");
  assert.equal(generatedEmail, "dydata-batch5-4-abc-123@example.com");
  assert.throws(() => buildFixtureEmail(4, "   "), /随机段/);
  assert.equal(
    buildCredentialTableRow({
      alias: "批次5账号#4",
      email: generatedEmail,
      password: generatedPassword,
      role: "member",
      verifiedDate: "2026-08-29",
    }),
    `| 批次5账号#4 | ${generatedEmail} | ${generatedPassword} | member | 2026-08-29 |`,
  );
});

test("Auth 封禁状态只把 none/空值视为未封禁", () => {
  assert.equal(isBannedUntil(null), false);
  assert.equal(isBannedUntil("none"), false);
  assert.equal(isBannedUntil("2099-01-01T00:00:00.000Z"), true);
  assert.equal(isBannedUntil("2020-01-01T00:00:00.000Z"), false);
  assert.equal(isBannedUntil("not-a-date"), true);
});
