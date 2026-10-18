export const GRANT_RENEW_BEFORE_SECONDS = 5 * 60;

export function shouldRenewGrant(exp: number | null | undefined, now = Math.floor(Date.now() / 1000)) {
  return !exp || exp - now < GRANT_RENEW_BEFORE_SECONDS;
}
