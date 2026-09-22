import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  auditAppliedButNotLoggedMessage,
  auditRollbackIncompleteMessage,
  auditRollbackMessage,
  writeAuditLog,
  type AuditLogEntry,
} from "./audit-log";

/**
 * 审计唯一出口：写成功要留痕、写失败要如实返回；失败措辞只此一份，
 * 防止某个调用点把「已生效但没留痕」写成「已回滚」。
 */

function createFakeAuditClient(options: { fail?: boolean } = {}) {
  const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];

  return {
    inserts,
    client: {
      from(table: string) {
        return {
          insert(payload: Record<string, unknown>) {
            inserts.push({ table, payload });
            return Promise.resolve({
              error: options.fail ? { message: "permission denied for table audit_logs" } : null,
            });
          },
        };
      },
    },
  };
}

const entry: AuditLogEntry = {
  userId: "user-owner",
  action: "create_team",
  target: "深圳三部",
  detail: "深圳三部",
};

test("审计成功：落 audit_logs，字段按传入原样写入", async () => {
  const fake = createFakeAuditClient();
  const result = await writeAuditLog(fake.client as never, entry);

  assert.deepEqual(result, { ok: true });
  assert.equal(fake.inserts.length, 1);
  assert.equal(fake.inserts[0]!.table, "audit_logs");
  assert.deepEqual(fake.inserts[0]!.payload, {
    user_id: "user-owner",
    action: "create_team",
    target: "深圳三部",
    detail: "深圳三部",
  });
});

test("审计失败：返回 ok=false 与上游原因，不抛错也不假装成功", async () => {
  const fake = createFakeAuditClient({ fail: true });
  const result = await writeAuditLog(fake.client as never, entry);

  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.message, "permission denied for table audit_logs");
});

test("detail 缺省写 null，不会写出 undefined", async () => {
  const fake = createFakeAuditClient();
  await writeAuditLog(fake.client as never, { userId: "u1", action: "remove_from_team", target: "u2" });
  assert.equal(fake.inserts[0]!.payload.detail, null);
});

test("审计失败措辞三态互不相同：已回滚 / 回滚未完成 / 已生效", () => {
  const rolledBack = auditRollbackMessage("创建团队");
  const incomplete = auditRollbackIncompleteMessage("创建团队");
  const applied = auditAppliedButNotLoggedMessage("删除团队");

  assert.equal(rolledBack, "创建团队失败：审计写入失败，已回滚");
  assert.match(incomplete, /回滚未完成/);
  assert.match(applied, /已生效/);
  assert.match(applied, /请人工核对留痕/);

  assert.notEqual(rolledBack, incomplete);
  assert.notEqual(rolledBack, applied);
  assert.notEqual(incomplete, applied);
  assert.doesNotMatch(rolledBack, /已生效/);
  assert.doesNotMatch(applied, /已回滚/);
});

test("管理写操作不再静默吞审计错误：actions.ts 只用统一出口且每个结果都被检查", () => {
  const source = readFileSync(
    new URL("../app/(app)/admin/actions.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(
    source,
    /\.then\(\s*\(\)\s*=>\s*\{\}\s*,\s*\(\)\s*=>\s*\{\}\s*\)/,
    "旧实现用空成功/失败回调把审计错误吞掉了，禁止回退",
  );
  assert.doesNotMatch(source, /from\("audit_logs"\)/, "审计写入只允许走 src/lib/audit-log.ts");
  assert.match(source, /import\s*\{[\s\S]*?writeAuditLog[\s\S]*?\}\s*from\s*"@\/lib\/audit-log"/);

  // 每个审计调用点都必须处理失败分支（成功路径不写这段）
  const callSites = source.match(/recordAdminAudit\(\{/g) ?? [];
  const failureBranches = source.match(/if \(!audit\.ok\)/g) ?? [];
  assert.equal(
    callSites.length,
    failureBranches.length,
    `审计调用点 ${callSites.length} 个，失败分支 ${failureBranches.length} 个，必须一一对应`,
  );
  assert.ok(callSites.length >= 10, `管理写操作的审计覆盖数偏低：${callSites.length}`);
});
