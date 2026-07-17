import type { CookieOptions } from "@supabase/ssr";

export const KEEP_LOGGED_IN_COOKIE_NAME = "dydata-keep-logged-in";
export const KEEP_LOGGED_IN_COOKIE_VALUE = "1";
export const KEEP_LOGGED_IN_MAX_AGE = 30 * 24 * 60 * 60;

export function isKeepLoggedInCookieValue(value?: string | null) {
  return value === KEEP_LOGGED_IN_COOKIE_VALUE;
}

export function applyAuthCookieLifetime(options: CookieOptions, keepLoggedIn: boolean): CookieOptions {
  if (keepLoggedIn) {
    return { ...options, maxAge: KEEP_LOGGED_IN_MAX_AGE };
  }

  const sessionOptions = { ...options };
  delete sessionOptions.expires;
  delete sessionOptions.maxAge;
  return sessionOptions;
}
