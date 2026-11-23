import { getApiFailureMessage } from "@/lib/api-failure-message";

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

export type AccountPasswordPost = (input: Pick<AccountPasswordFormInput, "currentPassword" | "newPassword">) => Promise<Response>;

export async function submitAccountPasswordForm(input: AccountPasswordFormInput, post: AccountPasswordPost) {
  const validationError = validateAccountPasswordForm(input);
  if (validationError) return { ok: false as const, error: validationError, input };

  try {
    const response = await post({ currentPassword: input.currentPassword, newPassword: input.newPassword });
    if (!response.ok) {
      return {
        ok: false as const,
        error: await getApiFailureMessage(response, "修改密码失败"),
        input,
      };
    }
    return {
      ok: true as const,
      error: "",
      input: { currentPassword: "", newPassword: "", confirmPassword: "" },
    };
  } catch {
    return {
      ok: false as const,
      error: await getApiFailureMessage(undefined, "修改密码失败"),
      input,
    };
  }
}
