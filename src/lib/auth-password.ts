export const FORGOT_PASSWORD_SUCCESS_MESSAGE = "如果该邮箱已注册，我们已发送重置邮件，请去邮箱查看";

export function getLoginNotice(params: { registered?: string; reset?: string; from?: string }) {
  if (params.registered === "1") return "注册成功，请登录";
  if (params.reset === "success") return "密码已重置，请重新登录";
  if (params.reset === "expired") return "重置链接已失效，请重新发送";
  return null;
}

export function getResetPasswordErrorMessage(message: string | null | undefined) {
  if (!message) return "密码重置失败，请稍后重试";

  const normalized = message.toLowerCase();

  if (
    normalized.includes("session missing") ||
    normalized.includes("invalid") ||
    normalized.includes("expired") ||
    normalized.includes("code verifier") ||
    normalized.includes("auth session missing")
  ) {
    return "重置链接已失效，请重新发送";
  }

  if (normalized.includes("at least 6")) {
    return "密码至少需要 6 位。";
  }

  return "密码重置失败，请稍后重试";
}

export function sanitizeNextPath(next: string | null | undefined, fallback = "/login") {
  if (!next) return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//")) return fallback;
  return next;
}
