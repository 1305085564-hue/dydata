import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_EVALUATION_STANDARDS } from "@/lib/evaluation-standards";
import { buildEvaluationStandardsResponse } from "./route";

function deps(role = "company_owner", company: string | null = "company-a") {
  const writes: unknown[] = [];
  return {
    writes,
    requireAdminServiceClient: async () => ({ supabase: {}, actor: { companyRole: role, userId: "owner", permissions: { manage_system: role === "company_owner", manage_members: role !== "member" } }, scope: { teamId: company } }),
    loadEvaluationSettings: async (_: unknown, teamId: unknown) => { assert.equal(teamId, company); return { standards: DEFAULT_EVALUATION_STANDARDS, updatedAt: null }; },
    saveEvaluationSettings: async (...args: unknown[]) => { writes.push(args); return { standards: args[3], updatedAt: "v2" }; },
  };
}
const put = (payload: unknown) => new Request("http://localhost/api/admin/evaluation-standards", { method: "PUT", headers: { "Content-Type": "application/json", Origin: "http://localhost" }, body: JSON.stringify(payload) });

test("普通管理员可看但不可写，成员不可进入设置，无公司归属拒绝", async () => {
  const admin = deps("admin");
  const read = await buildEvaluationStandardsResponse(new Request("http://localhost/api/admin/evaluation-standards"), admin as never);
  assert.equal(read.status, 200);
  assert.equal((await read.json()).canEdit, false);
  assert.equal((await buildEvaluationStandardsResponse(put({ standards: DEFAULT_EVALUATION_STANDARDS, expectedUpdatedAt: null }), admin as never)).status, 403);
  assert.equal(admin.writes.length, 0);
  assert.equal((await buildEvaluationStandardsResponse(new Request("http://localhost/api/admin/evaluation-standards"), deps("member") as never)).status, 403);
  assert.equal((await buildEvaluationStandardsResponse(put({}), deps("company_owner", null) as never)).status, 403);
});

test("仅负责人保存，范围只取服务端公司，不接收客户端公司", async () => {
  const owner = deps();
  const response = await buildEvaluationStandardsResponse(put({ standards: DEFAULT_EVALUATION_STANDARDS, expectedUpdatedAt: null }), owner as never);
  assert.equal(response.status, 200);
  assert.equal(owner.writes[0] && (owner.writes[0] as unknown[])[1], "company-a");
  assert.equal((await buildEvaluationStandardsResponse(put({ standards: DEFAULT_EVALUATION_STANDARDS, expectedUpdatedAt: null, teamId: "b" }), owner as never)).status, 400);
  assert.equal(owner.writes.length, 1);
});

test("非法区间和跨站保存被拒绝；读取/保存异常不返回SQL细节", async () => {
  const owner = deps();
  const invalid = structuredClone(DEFAULT_EVALUATION_STANDARDS);
  invalid.completionRate5s.good = 40;
  assert.equal((await buildEvaluationStandardsResponse(put({ standards: invalid, expectedUpdatedAt: null }), owner as never)).status, 400);
  const crossSite = new Request("http://localhost/api/admin/evaluation-standards", { method: "PUT", headers: { Origin: "http://evil.test", "Content-Type": "application/json" }, body: "{}" });
  assert.equal((await buildEvaluationStandardsResponse(crossSite, owner as never)).status, 403);
  owner.loadEvaluationSettings = async () => { throw new Error("secret SQL token"); };
  const failed = await buildEvaluationStandardsResponse(new Request("http://localhost/api/admin/evaluation-standards"), owner as never);
  assert.equal(failed.status, 500);
  assert.doesNotMatch(await failed.text(), /secret|SQL|token/);
});
