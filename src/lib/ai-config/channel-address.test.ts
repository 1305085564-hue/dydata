import assert from "node:assert/strict";
import test from "node:test";
import { normalizeChannelAddress, requireSharedAddressConfirmation } from "./channel-address";

test("地址归组仅规范网址与末尾斜线，保留路径和协议", () => {
  assert.equal(normalizeChannelAddress("HTTPS://EXAMPLE.COM/v1/"), "https://example.com/v1");
  assert.notEqual(normalizeChannelAddress("https://example.com/v1"), normalizeChannelAddress("https://example.com"));
  assert.throws(() => normalizeChannelAddress("https://user:secret@example.com"));
});

test("共享地址变更要求单独确认并返回全部受影响渠道", async () => {
  const service = { from(table: string) { const query = { select() { return query; }, eq() { return query; }, single: async () => ({ data: { base_url: "https://old.test/v1" } }), then(resolve: (value: unknown) => void) { resolve({ data: table === "ai_provider_keys" ? [{ id: "1",label: "一" },{ id: "2",label:"二" }] : [] }); } }; return query; } };
  await assert.rejects(() => requireSharedAddressConfirmation(service,"provider","https://new.test/v1",false), (error: unknown) => {
    const actual = error as { status: number; sharedAddressImpact: { affectedKeyCount: number } };
    assert.equal(actual.status,409); assert.equal(actual.sharedAddressImpact.affectedKeyCount,2); return true;
  });
  assert.equal((await requireSharedAddressConfirmation(service,"provider","https://new.test/v1",true)).affectedKeyCount,2);
});
