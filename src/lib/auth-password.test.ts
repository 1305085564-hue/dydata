import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAuthPathWithNext,
  buildLoginPath,
  buildPasswordRecoveryRedirectUrl,
  getForgotPasswordErrorMessage,
  getLoginErrorMessage,
  getLoginNotice,
  getResetPasswordErrorMessage,
  sanitizeNextPath,
} from "./auth-password";

test("认证路径保留安全站内回跳并编码查询参数", () => {
  assert.equal(sanitizeNextPath("/topics?tab=mine"), "/topics?tab=mine");
  assert.equal(buildAuthPathWithNext("/login", "/topics?tab=mine"), "/login?next=%2Ftopics%3Ftab%3Dmine");
  assert.equal(buildLoginPath("/dashboard", { registered: "1" }), "/login?registered=1&next=%2Fdashboard");
  assert.equal(
    buildPasswordRecoveryRedirectUrl("https://dydata.cc", "/topics"),
    "https://dydata.cc/auth/callback?next=%2Freset-password%3Fnext%3D%252Ftopics",
  );
});

test("空值和外部地址回退到安全默认路径", () => {
  assert.equal(sanitizeNextPath(null), "/login");
  assert.equal(sanitizeNextPath("https://evil.example"), "/login");
  assert.equal(sanitizeNextPath("//evil.example"), "/login");
  assert.equal(buildLoginPath(undefined), "/login");
});

test("认证错误不会直接暴露服务端原文", () => {
  assert.equal(getLoginErrorMessage("Invalid login credentials"), "邮箱或密码不正确");
  assert.equal(getLoginErrorMessage("User is banned"), "账号已归档，请联系 owner 恢复");
  assert.equal(getLoginErrorMessage("database exploded"), "登录失败，请稍后重试");
  assert.equal(getResetPasswordErrorMessage("Auth session missing"), "重置链接已失效，请重新发送");
  assert.equal(getForgotPasswordErrorMessage("network unavailable"), "邮件发送失败，请检查网络后重试");
  assert.equal(getLoginNotice({}), null);
});
