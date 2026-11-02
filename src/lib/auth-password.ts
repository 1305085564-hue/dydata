export const PASSWORD_RESET_UNAVAILABLE_MESSAGE = "修改密码渠道暂时还没启用，请联系管理员为你重置密码。";

type LoginPathOptions = {
  registered?: "1";
  reset?: "success" | "expired" | "pkce";
  archived?: "1";
};

export function getLoginNotice(params: { registered?: string; reset?: string; from?: string; archived?: string }) {
  if (params.archived === "1") return "账号已归档，请联系 owner 恢复";
  if (params.registered === "1") return "注册成功，请登录";
  if (params.reset === "success") return "密码已重置，请重新登录";
  if (params.reset === "expired") return PASSWORD_RESET_UNAVAILABLE_MESSAGE;
  if (params.reset === "pkce") return PASSWORD_RESET_UNAVAILABLE_MESSAGE;
  return null;
}

export function getLoginErrorMessage(message: string | null | undefined) {
  if (!message) return "登录失败，请稍后重试";

  const userFacingMessages = new Set([
    "邮箱和密码还没填。",
    "未找到账号资料，请联系管理员。",
    "账号已归档，请联系 owner 恢复",
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

  if (normalized.includes("banned") || normalized.includes("user is banned")) {
    return "账号已归档，请联系 owner 恢复";
  }

  return "登录失败，请稍后重试";
}

export function sanitizeNextPath(next: string | null | undefined, fallback = "/login") {
  if (!next) return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//")) return fallback;
  // Browsers normalize backslashes and strip ASCII controls before resolving URLs.
  // Reject those inputs before they can turn a relative path into an external URL.
  if (next.includes("\\") || [...next].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  })) return fallback;
  return next;
}

export function getCallbackNextPath(type: string | null, requestedNext: string | null) {
  const safeNext = sanitizeNextPath(requestedNext, "");

  if (type === "recovery") {
    const isResetPasswordPath =
      safeNext === "/reset-password" || safeNext.startsWith("/reset-password?");
    return isResetPasswordPath ? safeNext : "/reset-password";
  }

  return safeNext || "/login";
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
  if (options.archived) params.set("archived", options.archived);

  const safeNext = sanitizeNextPath(next, "");
  if (safeNext) params.set("next", safeNext);

  const query = params.toString();
  return query ? `/login?${query}` : "/login";
}
