export const YIKE_ALLOWED_EMAIL = "1305085564@qq.com";

export function canUseYike(email: string | null | undefined) {
  return email?.trim().toLowerCase() === YIKE_ALLOWED_EMAIL;
}
