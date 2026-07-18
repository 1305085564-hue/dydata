import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import {
  buildLoginPath,
  buildPasswordRecoveryRedirectUrl,
  getForgotPasswordErrorMessage,
  getLoginErrorMessage,
  sanitizeNextPath,
} from "@/lib/auth-password";
import { ForgotPasswordForm } from "./forgot-password-form";
import { ResetPasswordForm } from "../reset-password/reset-password-form";

test("sanitizeNextPath 只允许站内路径", () => {
  assert.equal(sanitizeNextPath("/reset-password"), "/reset-password");
  assert.equal(sanitizeNextPath("https://evil.com"), "/login");
  assert.equal(sanitizeNextPath("//evil.com"), "/login");
  assert.equal(sanitizeNextPath(undefined, "/dashboard"), "/dashboard");
});

test("认证关联页面会保留安全的 next 回跳地址", () => {
  assert.equal(
    buildLoginPath("/dashboard?tab=weekly", { reset: "success" }),
    "/login?reset=success&next=%2Fdashboard%3Ftab%3Dweekly",
  );
  assert.equal(buildLoginPath("https://evil.example"), "/login");
  assert.equal(
    buildPasswordRecoveryRedirectUrl("https://dydata.cc", "/dashboard?tab=weekly"),
    "https://dydata.cc/auth/callback?next=%2Freset-password%3Fnext%3D%252Fdashboard%253Ftab%253Dweekly",
  );
});

test("认证服务英文错误会收敛为中文提示", () => {
  assert.equal(getLoginErrorMessage("Invalid login credentials"), "邮箱或密码不正确");
  assert.equal(getLoginErrorMessage("rate limit exceeded"), "尝试次数过多，请稍后再试");
  assert.equal(getForgotPasswordErrorMessage("Failed to fetch"), "邮件发送失败，请检查网络后重试");
  assert.equal(getForgotPasswordErrorMessage("other error"), "邮件发送失败，请稍后重试");
});

test("忘记密码表单包含邮箱输入与返回登录入口", () => {
  const html = renderToStaticMarkup(<ForgotPasswordForm />);

  assert.match(html, /发送重置邮件/);
  assert.match(html, /name="email"/);
  assert.match(html, /href="\/login"/);
});

test("重置密码表单包含两次密码输入与确认按钮", () => {
  const html = renderToStaticMarkup(<ResetPasswordForm />);

  assert.match(html, /正在验证重置链接/);
});
