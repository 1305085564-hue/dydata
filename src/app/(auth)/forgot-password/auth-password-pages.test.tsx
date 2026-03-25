import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import { sanitizeNextPath } from "@/lib/auth-password";
import { ForgotPasswordForm } from "./forgot-password-form";
import { ResetPasswordForm } from "../reset-password/reset-password-form";

test("sanitizeNextPath 只允许站内路径", () => {
  assert.equal(sanitizeNextPath("/reset-password"), "/reset-password");
  assert.equal(sanitizeNextPath("https://evil.com"), "/login");
  assert.equal(sanitizeNextPath("//evil.com"), "/login");
  assert.equal(sanitizeNextPath(undefined, "/dashboard"), "/dashboard");
});

test("忘记密码表单包含邮箱输入与返回登录入口", () => {
  const html = renderToStaticMarkup(<ForgotPasswordForm />);

  assert.match(html, /发送重置邮件/);
  assert.match(html, /name="email"/);
  assert.match(html, /href="\/login"/);
});

test("重置密码表单包含两次密码输入与确认按钮", () => {
  const html = renderToStaticMarkup(<ResetPasswordForm />);

  assert.match(html, /name="password"/);
  assert.match(html, /name="confirmPassword"/);
  assert.match(html, /确认重置密码/);
});
