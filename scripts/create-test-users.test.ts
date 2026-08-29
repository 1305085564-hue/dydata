import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const scriptPath = path.join(repoRoot, "scripts/create-test-users.ts");
const tsxCliPath = path.join(repoRoot, "node_modules/tsx/dist/cli.mjs");

describe("create-test-users credential handling", () => {
  it("supports a dry run without Supabase credentials or sensitive output", () => {
    const fakeSecrets = [
      "member@example.invalid",
      "member-only-dry-run-secret",
      "admin@example.invalid",
      "admin-only-dry-run-secret",
    ];
    const output = execFileSync(
      process.execPath,
      [tsxCliPath, scriptPath, "--dry-run"],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          NEXT_PUBLIC_SUPABASE_URL: "",
          SUPABASE_SERVICE_ROLE_KEY: "",
          DYDATA_TEST_MEMBER_EMAIL: fakeSecrets[0],
          DYDATA_TEST_MEMBER_PASSWORD: fakeSecrets[1],
          DYDATA_TEST_LEADER_EMAIL: fakeSecrets[2],
          DYDATA_TEST_LEADER_PASSWORD: fakeSecrets[3],
        },
      },
    );

    assert.match(output, /dry-run/i);
    assert.match(output, /admin/);
    assert.match(output, /company_role/);
    for (const secret of fakeSecrets) {
      assert.doesNotMatch(output, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });

  it("contains no hardcoded password literals or leader role writes", () => {
    const source = readFileSync(scriptPath, "utf8");

    assert.equal(/password\s*:\s*["'`][^"'`]+["'`]/i.test(source), false);
    assert.equal(/role\s*:\s*["']leader["']/i.test(source), false);
    assert.equal(/buildCompanyRoleProfilePatch\(\s*spec\.role\s*\)/.test(source), true);
    assert.equal(/company_role\s*:\s*spec\.role/.test(source), true);
    assert.equal(/role\s*:\s*spec\.role/.test(source), true);
  });
});
