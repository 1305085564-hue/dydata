import { createHash, randomBytes } from "node:crypto";

export const GROUP_MODE_COOKIE = "dydata-group-mode";
export const GROUP_MODE_TTL_SECONDS = 30 * 60;

export type GroupModeSession = {
  tokenHash: string;
  expiresAt: Date | string;
  revokedAt?: Date | string | null;
};

export function hashGroupModeToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createGroupModeToken(now = new Date()) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(now.getTime() + GROUP_MODE_TTL_SECONDS * 1000);
  return { token, tokenHash: hashGroupModeToken(token), expiresAt };
}

export function isGroupModeActive(session: GroupModeSession | null | undefined, now = new Date()) {
  if (!session || session.revokedAt) return false;
  const expiresAt = new Date(session.expiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt > now.getTime();
}
