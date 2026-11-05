import assert from "node:assert/strict";
import test from "node:test";
import { requestAiConfigCommand } from "./client-command";

test("前端数据层保留409影响名单，只有用户确认后的重发才携带确认标记", async () => {
  const bodies: Array<{ data: Record<string, unknown> }> = [];
  const fetcher = async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)); bodies.push(body);
    return body.data.confirm_impact === true ? Response.json({ availability: {} }) : Response.json({ error: "需要确认", requiresConfirmation: true, affectedBusinesses: [{ key: "content_tools", label: "内容工具" }] }, { status: 409 });
  };
  const result = await requestAiConfigCommand("update", { id: "key", is_enabled: false, provider_key_model_id: "hidden" }, "key", undefined, fetcher);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.requiresConfirmation, true);
    assert.equal(result.affectedBusinesses[0].label, "内容工具");
  }
  assert.equal("confirm_impact" in bodies[0].data, false);
  assert.equal("provider_key_model_id" in bodies[0].data, false);
  assert.equal((await requestAiConfigCommand("update", { id: "key", is_enabled: false, confirm_impact: true }, "key", undefined, fetcher)).ok, true);
});
