import { createHash, randomBytes } from "node:crypto";

export const GROUP_MODE_COOKIE = "dydata-group-mode";

export type GroupModeSession = {
  tokenHash: string;
  expiresAt: Date | string | null;
  revokedAt?: Date | string | null;
};

export function hashGroupModeToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createGroupModeToken() {
  const token = randomBytes(32).toString("hex");
  return { token, tokenHash: hashGroupModeToken(token), expiresAt: null };
}

export function isGroupModeActive(session: GroupModeSession | null | undefined, now = new Date()) {
  if (!session || session.revokedAt) return false;
  if (session.expiresAt === null || session.expiresAt === undefined) return true;
  const expiresAt = new Date(session.expiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt > now.getTime();
}
