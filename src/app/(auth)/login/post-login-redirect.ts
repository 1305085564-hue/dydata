import { sanitizeNextPath } from "@/lib/auth-password";

export function getPostLoginRedirectPath(_: string | null | undefined, next?: string | null) {
  void _;

  return sanitizeNextPath(next, "/dashboard");
}
