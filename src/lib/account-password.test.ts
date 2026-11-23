import assert from "node:assert/strict";
import test from "node:test";

import { submitAccountPasswordForm, validateAccountPasswordForm } from "./account-password";

test("修改密码表单拦截短密码、相同密码和不一致确认密码", () => {
  assert.equal(validateAccountPasswordForm({ currentPassword: "short", newPassword: "new-pass", confirmPassword: "new-pass" }), "当前密码至少需要 6 位");
  assert.equal(validateAccountPasswordForm({ currentPassword: "same-pass", newPassword: "same-pass", confirmPassword: "same-pass" }), "新密码不能与当前密码相同");
  assert.equal(validateAccountPasswordForm({ currentPassword: "old-pass", newPassword: "new-pass", confirmPassword: "different" }), "两次输入的新密码不一致");
  assert.equal(validateAccountPasswordForm({ currentPassword: "old-pass", newPassword: "new-pass", confirmPassword: "new-pass" }), null);
});

test("密码确认不一致时不发请求，旧密码错误显示固定文案", async () => {
  let requests = 0;
  const mismatch = await submitAccountPasswordForm(
    { currentPassword: "old-pass", newPassword: "new-pass", confirmPassword: "different" },
    async () => { requests += 1; return { ok: true, json: async () => ({}) }; },
  );
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.error, "两次输入的新密码不一致");
  assert.equal(requests, 0);

  const oldPasswordError = await submitAccountPasswordForm(
    { currentPassword: "wrong-pass", newPassword: "new-pass", confirmPassword: "new-pass" },
    async () => ({ ok: false, json: async () => ({ code: "invalid_old_password" }) }),
  );
  assert.equal(oldPasswordError.ok, false);
  assert.equal(oldPasswordError.error, "当前密码不正确");
});

test("修改密码成功返回清空后的表单值", async () => {
  const result = await submitAccountPasswordForm(
    { currentPassword: "old-pass", newPassword: "new-pass", confirmPassword: "new-pass" },
    async () => ({ ok: true, json: async () => ({ ok: true }) }),
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.input, { currentPassword: "", newPassword: "", confirmPassword: "" });
});
