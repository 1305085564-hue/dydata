import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import {
  buildLoginPath,
  getLoginErrorMessage,
  sanitizeNextPath,
} from "@/lib/auth-password";
import ForgotPasswordPage from "./page";
import ResetPasswordPage from "../reset-password/page";

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
});

test("认证服务英文错误会收敛为中文提示", () => {
  assert.equal(getLoginErrorMessage("Invalid login credentials"), "邮箱或密码不正确");
  assert.equal(getLoginErrorMessage("rate limit exceeded"), "尝试次数过多，请稍后再试");
});

for (const [path, Page] of [["forgot-password", ForgotPasswordPage], ["reset-password", ResetPasswordPage]] as const) {
  test(`${path} 仅显示管理员提示，没有邮箱或密码表单`, async () => {
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ next: "/dashboard?tab=weekly" }) }));
    assert.match(html, /修改密码渠道暂时还没启用，请联系管理员为你重置密码。/);
    assert.match(html, /role="alert"/);
    assert.match(html, /href="\/login\?next=%2Fdashboard%3Ftab%3Dweekly"/);
    assert.doesNotMatch(html, /<form|<input|type="submit"|发送重置邮件|正在验证/);
  });
  test(`${path} 不保留外部回跳地址`, async () => {
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ next: "https://evil.example" }) }));
    assert.match(html, /href="\/login"/);
    assert.doesNotMatch(html, /evil.example/);
  });
}

for (const Page of [ForgotPasswordPage, ResetPasswordPage]) {
  test(`${Page.name} 重复 next 参数安全回到登录`, async () => {
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ next: ["/dashboard", "https://evil.example"] }) }));
    assert.match(html, /href="\/login"/);
    assert.doesNotMatch(html, /evil.example/);
  });
}
