export type AccountPasswordFormInput = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export function validateAccountPasswordForm(input: AccountPasswordFormInput) {
  if (input.currentPassword.length < 6) return "当前密码至少需要 6 位";
  if (input.newPassword.length < 6) return "新密码至少需要 6 位";
  if (input.currentPassword === input.newPassword) return "新密码不能与当前密码相同";
  if (input.newPassword !== input.confirmPassword) return "两次输入的新密码不一致";
  return null;
}

export type AccountPasswordPost = (input: Pick<AccountPasswordFormInput, "currentPassword" | "newPassword">) => Promise<{
  ok: boolean;
  json: () => Promise<unknown>;
}>;

export async function submitAccountPasswordForm(input: AccountPasswordFormInput, post: AccountPasswordPost) {
  const validationError = validateAccountPasswordForm(input);
  if (validationError) return { ok: false as const, error: validationError, input };

  try {
    const response = await post({ currentPassword: input.currentPassword, newPassword: input.newPassword });
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (!response.ok) {
      const code = body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>).code
        : null;
      const error = code === "invalid_old_password"
        ? "当前密码不正确"
        : code === "account_disabled" || code === "user_not_found"
          ? "当前账号无法修改密码，请联系管理员"
          : "修改密码失败，请检查填写内容后重试";
      return { ok: false as const, error, input };
    }
    return {
      ok: true as const,
      error: "",
      input: { currentPassword: "", newPassword: "", confirmPassword: "" },
    };
  } catch {
    return { ok: false as const, error: "修改密码失败，请稍后重试", input };
  }
}
