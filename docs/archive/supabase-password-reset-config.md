# 密码重置流程 Supabase 配置

## 1. 配置重定向 URL

登录 Supabase Dashboard → Authentication → URL Configuration。

### Site URL

```text
https://dydata.cc
```

### Redirect URLs（添加以下地址）

```text
https://dydata.cc/auth/callback
http://localhost:3000/auth/callback
```

`/forgot-password` 页面会把回调地址作为 `redirectTo` 传给 Supabase。只有加入允许列表后，Supabase 才会保留并使用这个自定义回调地址。

## 2. 检查邮件模板

进入 Authentication → Email Templates → Reset Password。

确保模板包含 `{{ .ConfirmationURL }}` 变量，例如：

```html
<h2>重置密码</h2>
<p>点击以下链接重置你的密码：</p>
<p><a href="{{ .ConfirmationURL }}">重置密码</a></p>
<p>如果你没有请求重置密码，请忽略此邮件。</p>
```

## 3. 验证配置

配置完成后，测试完整流程：

1. 访问 `/forgot-password`。
2. 输入邮箱，点击“发送重置邮件”。
3. 检查邮箱，点击重置链接。
4. 确认跳转到 `/reset-password`，而不是 `/login`。
5. 输入新密码并确认。
6. 提交后确认跳转到 `/login`，并显示“密码已重置，请重新登录”。

本地开发时，将生产地址替换为 `http://localhost:3000`，并使用本地回调地址测试。
