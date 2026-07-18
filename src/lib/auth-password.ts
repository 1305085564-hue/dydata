export const FORGOT_PASSWORD_SUCCESS_MESSAGE = "如果该邮箱已注册，我们已发送重置邮件，请去邮箱查看";

type LoginPathOptions = {
  registered?: "1";
  reset?: "success" | "expired";
};

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

export function getLoginErrorMessage(message: string | null | undefined) {
  if (!message) return "登录失败，请稍后重试";

  const userFacingMessages = new Set([
    "请输入邮箱和密码。",
    "未找到账号资料，请联系管理员。",
    "邮箱或密码不正确",
    "尝试次数过多，请稍后再试",
    "邮箱尚未验证，请先完成邮箱验证",
    "登录失败，请稍后重试",
  ]);

  if (userFacingMessages.has(message)) {
    return message;
  }

  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials") || normalized.includes("invalid credentials")) {
    return "邮箱或密码不正确";
  }

  if (normalized.includes("rate limit") || normalized.includes("too many requests")) {
    return "尝试次数过多，请稍后再试";
  }

  if (normalized.includes("email not confirmed")) {
    return "邮箱尚未验证，请先完成邮箱验证";
  }

  return "登录失败，请稍后重试";
}

export function getForgotPasswordErrorMessage(message: string | null | undefined) {
  const normalized = message?.toLowerCase() ?? "";

  if (normalized.includes("rate limit") || normalized.includes("too many requests")) {
    return "发送过于频繁，请稍后再试";
  }

  if (normalized.includes("fetch") || normalized.includes("network")) {
    return "邮件发送失败，请检查网络后重试";
  }

  return "邮件发送失败，请稍后重试";
}

export function sanitizeNextPath(next: string | null | undefined, fallback = "/login") {
  if (!next) return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//")) return fallback;
  return next;
}

export function buildAuthPathWithNext(path: string, next: string | null | undefined) {
  const safeNext = sanitizeNextPath(next, "");
  if (!safeNext) return path;

  const url = new URL(path, "https://dydata.local");
  url.searchParams.set("next", safeNext);
  return `${url.pathname}${url.search}`;
}

export function buildLoginPath(next: string | null | undefined, options: LoginPathOptions = {}) {
  const params = new URLSearchParams();
  if (options.registered) params.set("registered", options.registered);
  if (options.reset) params.set("reset", options.reset);

  const safeNext = sanitizeNextPath(next, "");
  if (safeNext) params.set("next", safeNext);

  const query = params.toString();
  return query ? `/login?${query}` : "/login";
}

export function buildPasswordRecoveryRedirectUrl(origin: string, next: string | null | undefined) {
  const callbackUrl = new URL("/auth/callback", origin);
  callbackUrl.searchParams.set("next", buildAuthPathWithNext("/reset-password", next));
  return callbackUrl.toString();
}
