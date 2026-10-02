import assert from "node:assert/strict";
import test from "node:test";

import {
  canManagePermanentExemption,
  resolvePermanentExemptionState,
  validatePermanentExemptionReason,
  requestSetPermanentExemption,
  requestClearPermanentExemption,
} from "./permanent-exemption-logic";

test("权限边界：仅 company_owner 可见和操作，admin 和普通成员不可见", () => {
  // 1. Owner 可见
  assert.equal(canManagePermanentExemption("company_owner"), true);

  // 2. Admin 不见
  assert.equal(canManagePermanentExemption("admin"), false);

  // 3. 普通成员与未定义均不见
  assert.equal(canManagePermanentExemption("member"), false);
  assert.equal(canManagePermanentExemption(null), false);
  assert.equal(canManagePermanentExemption(undefined), false);
});

test("状态展示：permanent 正确展示已设置状态与原因", () => {
  const state = resolvePermanentExemptionState({
    exempt_type: "permanent",
    exempt_reason: "合伙人不参与日常发文",
    exempt_end_date: null,
  });

  assert.equal(state.isPermanent, true);
  assert.equal(state.isTemporary, false);
  assert.equal(state.statusText, "已设置不参与考核");
  assert.equal(state.badgeLabel, "已设置不参与考核");
  assert.match(state.description, /合伙人不参与日常发文/);
});

test("防误判：temporary 临时豁免不误判为不参与考核", () => {
  const state = resolvePermanentExemptionState({
    exempt_type: "temporary",
    exempt_reason: "请假",
    exempt_end_date: "2026-10-15",
  });

  assert.equal(state.isPermanent, false);
  assert.equal(state.isTemporary, true);
  assert.equal(state.statusText, "临时豁免中");
  assert.equal(state.badgeLabel, null);
  assert.match(state.description, /临时豁免至 2026-10-15/);
});

test("常规状态：无豁免记录时展示正常参与考核", () => {
  const state = resolvePermanentExemptionState({
    exempt_type: null,
    exempt_reason: null,
    exempt_end_date: null,
  });

  assert.equal(state.isPermanent, false);
  assert.equal(state.isTemporary, false);
  assert.equal(state.statusText, "正常参与考核");
  assert.equal(state.badgeLabel, null);
  assert.match(state.description, /开启后不再进入应交与缺交考核统计/);
});

test("原因校验：空值、纯空格与超长原因必须被拦截", () => {
  assert.equal(validatePermanentExemptionReason("").ok, false);
  assert.equal(validatePermanentExemptionReason("   ").ok, false);
  assert.equal(validatePermanentExemptionReason(null).ok, false);
  assert.equal(validatePermanentExemptionReason(undefined).ok, false);
  assert.equal(validatePermanentExemptionReason("a".repeat(201)).ok, false);

  const valid = validatePermanentExemptionReason("  合伙人免考核  ");
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.data, "合伙人免考核");
  }
});

test("接口交互：成功设置后返回数据", async () => {
  let capturedUrl = "";
  let capturedBody = "";

  const mockFetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(url);
    capturedBody = String(init?.body);
    return new Response(JSON.stringify({ data: { user_id: "u-1", permanent: true } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  const result = await requestSetPermanentExemption({
    userId: "u-1",
    reason: "免考核原因",
    fetcher: mockFetcher,
  });

  assert.equal(result.ok, true);
  assert.equal(capturedUrl, "/api/exemptions/permanent");
  assert.deepEqual(JSON.parse(capturedBody), { user_id: "u-1", reason: "免考核原因" });
});

test("接口交互：成功撤销后返回数据", async () => {
  let capturedUrl = "";
  let capturedMethod = "";
  let capturedBody = "";

  const mockFetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(url);
    capturedMethod = init?.method ?? "";
    capturedBody = String(init?.body);
    return new Response(JSON.stringify({ data: { user_id: "u-1", cleared: true } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  const result = await requestClearPermanentExemption({
    userId: "u-1",
    fetcher: mockFetcher,
  });

  assert.equal(result.ok, true);
  assert.equal(capturedUrl, "/api/exemptions/permanent");
  assert.equal(capturedMethod, "DELETE");
  assert.deepEqual(JSON.parse(capturedBody), { user_id: "u-1" });
});

test("失败可恢复：服务端错误时返回错误提示，保留调用方状态", async () => {
  const mockFetcher = (async () => {
    return new Response(JSON.stringify({ error: "仅公司所有者可设置不参与考核" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  const setResult = await requestSetPermanentExemption({
    userId: "u-1",
    reason: "合法原因",
    fetcher: mockFetcher,
  });

  assert.equal(setResult.ok, false);
  if (!setResult.ok) {
    assert.match(setResult.error, /仅公司所有者可设置不参与考核/);
  }

  const clearResult = await requestClearPermanentExemption({
    userId: "u-1",
    fetcher: mockFetcher,
  });

  assert.equal(clearResult.ok, false);
  if (!clearResult.ok) {
    assert.match(clearResult.error, /仅公司所有者可设置不参与考核/);
  }
});
