// 实际连接腾讯云 CloudBase，目录名是历史遗留。
export const KEEP_LOGGED_IN_COOKIE_NAME = "dydata-keep-logged-in";
export const KEEP_LOGGED_IN_COOKIE_VALUE = "1";
export const KEEP_LOGGED_IN_MAX_AGE = 30 * 24 * 60 * 60;

export function isKeepLoggedInCookieValue(value?: string | null) {
  return value === KEEP_LOGGED_IN_COOKIE_VALUE;
}
