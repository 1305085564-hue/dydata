import assert from "node:assert/strict";
import test from "node:test";
import { archiveMemberWithClient, restoreMemberWithClient, transferMemberToTeamWithClient, type MemberLifecycleClient } from "./member-lifecycle-service";
import { loadName, operationFailure } from "./member-lifecycle-service/shared";

test("成员归档/恢复/调配：数据库读取异常均脱敏，不能透传表列名与栈", async () => {
  const raw = { message: "permission denied for relation private_profiles.secret /internal/path", code: "42501" };
  const client = { from() {
    const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: null, error: raw }) };
    return query;
  } } as unknown as MemberLifecycleClient;
  const actor = { id: "actor", role: "admin" as const, companyRole: "company_owner" as const };
  for (const run of [
    () => archiveMemberWithClient({ client, actor, targetId: "target", reason: "离职", archivedAt: new Date().toISOString() }),
    () => restoreMemberWithClient({ client, actor, targetId: "target" }),
    () => transferMemberToTeamWithClient({ client, actor, targetId: "target", newTeamId: "own", newTeamName: "本团队" }),
  ]) {
    const result = await run();
    assert.equal(result.ok, false);
    if (!result.ok) assert.doesNotMatch(result.error, /private_profiles|secret|internal|42501|permission denied/);
  }
  const team = await loadName(client, "teams", "team");
  assert.deepEqual(team, { error: "加载团队名称失败，请稍后重试" });
  const failed = operationFailure("archive", "成员资料写入", raw, ["private_compensation.table"]);
  assert.doesNotMatch(failed.error, /private_|42501|permission denied/);
  assert.match(failed.error, /补偿未完成/);
  assert.equal(failed.firstError, raw.message); // 内部排障原因保留；Action 只返回 result.error。
});
