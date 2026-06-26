import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import { LoginForm } from "./login-form";
import { getPostLoginRedirectPath } from "./post-login-redirect";
import {
  FORGOT_PASSWORD_SUCCESS_MESSAGE,
  getLoginNotice,
  getResetPasswordErrorMessage,
} from "@/lib/auth-password";

test("登录表单会保留传入邮箱并显示忘记密码入口", () => {
  const html = renderToStaticMarkup(
    <LoginForm
      action={async () => ({ error: null, email: "kept@example.com" })}
      initialEmail="kept@example.com"
      notice="密码已重置，请重新登录"
    />,
  );

  assert.match(html, /value="kept@example.com"/);
  assert.match(html, /忘记密码/);
  assert.match(html, /href="\/forgot-password"/);
});

test("登录表单包含记住邮箱选项", () => {
  const html = renderToStaticMarkup(
    <LoginForm action={async () => ({ error: null, email: "" })} />,
  );

  assert.match(html, /type="checkbox"/);
  assert.match(html, /记住邮箱/);
});

test("登录成功后所有角色都默认进入 dashboard", () => {
  assert.equal(getPostLoginRedirectPath("owner"), "/dashboard");
  assert.equal(getPostLoginRedirectPath("admin"), "/dashboard");
  assert.equal(getPostLoginRedirectPath("member"), "/dashboard");
});

test("登录成功后优先回到安全的 next 路径", () => {
  assert.equal(getPostLoginRedirectPath("member", "/violations"), "/violations");
  assert.equal(getPostLoginRedirectPath("member", "/violations?date=2026-06-14"), "/violations?date=2026-06-14");
  assert.equal(getPostLoginRedirectPath("member", "https://evil.com"), "/dashboard");
  assert.equal(getPostLoginRedirectPath("member", "//evil.com"), "/dashboard");
});

test("登录页提示文案会按 query 参数返回", () => {
  assert.equal(getLoginNotice({ registered: "1" }), "注册成功，请登录");
  assert.equal(getLoginNotice({ reset: "success" }), "密码已重置，请重新登录");
  assert.equal(getLoginNotice({ reset: "expired" }), "重置链接已失效，请重新发送");
  assert.equal(getLoginNotice({}), null);
});

test("忘记密码成功提示统一隐藏邮箱是否存在", () => {
  assert.equal(
    FORGOT_PASSWORD_SUCCESS_MESSAGE,
    "如果该邮箱已注册，我们已发送重置邮件，请去邮箱查看",
  );
});

test("重置密码页错误文案会收敛为用户可读提示", () => {
  assert.equal(getResetPasswordErrorMessage("Auth session missing!"), "重置链接已失效，请重新发送");
  assert.equal(getResetPasswordErrorMessage("Password should be at least 6 characters."), "密码至少需要 6 位。");
  assert.equal(getResetPasswordErrorMessage("other"), "密码重置失败，请稍后重试");
});
