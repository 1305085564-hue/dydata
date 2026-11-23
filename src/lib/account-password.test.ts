import assert from "node:assert/strict";
import test from "node:test";

import { submitAccountPasswordForm, validateAccountPasswordForm } from "./account-password";

test("修改密码表单拦截短密码、相同密码和不一致确认密码", () => {
  assert.equal(validateAccountPasswordForm({ currentPassword: "short", newPassword: "new-pass", confirmPassword: "new-pass" }), "当前密码至少需要 6 位");
  assert.equal(validateAccountPasswordForm({ currentPassword: "same-pass", newPassword: "same-pass", confirmPassword: "same-pass" }), "新密码不能与当前密码相同");
  assert.equal(validateAccountPasswordForm({ currentPassword: "old-pass", newPassword: "new-pass", confirmPassword: "different" }), "两次输入的新密码不一致");
  assert.equal(validateAccountPasswordForm({ currentPassword: "old-pass", newPassword: "new-pass", confirmPassword: "new-pass" }), null);
});

test("密码确认不一致时不发请求，服务端旧密码错误文案保持不变", async () => {
  let requests = 0;
  const mismatch = await submitAccountPasswordForm(
    { currentPassword: "old-pass", newPassword: "new-pass", confirmPassword: "different" },
    async () => { requests += 1; return Response.json({ ok: true }); },
  );
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.error, "两次输入的新密码不一致");
  assert.equal(requests, 0);

  const oldPasswordError = await submitAccountPasswordForm(
    { currentPassword: "wrong-pass", newPassword: "new-pass", confirmPassword: "new-pass" },
    async () => Response.json({ error: "当前密码不正确", code: "invalid_old_password" }, { status: 400 }),
  );
  assert.equal(oldPasswordError.ok, false);
  assert.equal(oldPasswordError.error, "当前密码不正确");
});

test("改密请求的 401、服务端错误和网络异常使用统一失败提示", async () => {
  const input = { currentPassword: "old-pass", newPassword: "new-pass", confirmPassword: "new-pass" };
  const expired = await submitAccountPasswordForm(input, async () => Response.json({ error: "未登录" }, { status: 401 }));
  assert.equal(expired.error, "登录状态已失效，请刷新页面或重新登录。");

  const serverFailure = await submitAccountPasswordForm(input, async () => Response.json({
    error: "修改密码失败，请稍后重试（编号：request-123）",
  }, { status: 500 }));
  assert.equal(serverFailure.error, "修改密码失败，请稍后重试（编号：request-123）");

  const networkFailure = await submitAccountPasswordForm(input, async () => { throw new TypeError("fetch failed"); });
  assert.equal(networkFailure.error, "网络连接异常，请检查网络后重试。");
});

test("修改密码成功返回清空后的表单值", async () => {
  const result = await submitAccountPasswordForm(
    { currentPassword: "old-pass", newPassword: "new-pass", confirmPassword: "new-pass" },
    async () => Response.json({ ok: true }),
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.input, { currentPassword: "", newPassword: "", confirmPassword: "" });
});
