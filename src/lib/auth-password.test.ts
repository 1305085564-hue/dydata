import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAuthPathWithNext,
  buildLoginPath,
  getLoginErrorMessage,
  getLoginNotice,
  getCallbackNextPath,
  sanitizeNextPath,
} from "./auth-password";

test("认证路径保留安全站内回跳并编码查询参数", () => {
  assert.equal(sanitizeNextPath("/topics?tab=mine"), "/topics?tab=mine");
  assert.equal(buildAuthPathWithNext("/login", "/topics?tab=mine"), "/login?next=%2Ftopics%3Ftab%3Dmine");
  assert.equal(buildLoginPath("/dashboard", { registered: "1" }), "/login?registered=1&next=%2Fdashboard");
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
  assert.equal(getLoginNotice({ reset: "expired" }), "修改密码渠道暂时还没启用，请联系管理员为你重置密码。");
  assert.equal(getLoginNotice({ reset: "pkce" }), "修改密码渠道暂时还没启用，请联系管理员为你重置密码。");
  assert.equal(getLoginNotice({}), null);
});

test("认证回跳拒绝会被浏览器归一化到外站的路径，保留正常站内路径", () => {
  const origin = "https://dydata.local";
  const rejected = ["/\\review-example.invalid", "/\t/review-example.invalid", "/\n/review-example.invalid", "/\r/review-example.invalid"];
  for (const next of rejected) {
    assert.notEqual(new URL(next, origin).origin, origin, "负例必须确实会离开本站");
    assert.equal(sanitizeNextPath(next), "/login");
    assert.equal(getCallbackNextPath("signup", next), "/login");
    assert.equal(buildAuthPathWithNext("/login", next), "/login");
  }
  for (const next of ["/dashboard", "/admin/content?tab=mine", "/topics?filter=%E4%B8%AD%E6%96%87", "/dashboard#today"]) {
    assert.equal(sanitizeNextPath(next), next);
  }
});
