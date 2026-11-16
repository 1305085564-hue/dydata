type AppealSuccessStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type AppealSuccessSession = { title?: string; publishedAt?: string };

function getBrowserStorage(): AppealSuccessStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function getAppealSuccessKey(accountId: string, recordDate: string) {
  return `dydata:appeal-success:${accountId}:${recordDate}`;
}

export function hasAppealSuccessSession(
  storage: AppealSuccessStorage | null,
  accountId: string,
  recordDate: string,
) {
  if (!storage || !accountId || !recordDate) return false;
  const value = storage.getItem(getAppealSuccessKey(accountId, recordDate));
  if (!value) return false;
  if (value === "1") return true;
  try {
    JSON.parse(value) as AppealSuccessSession;
    return true;
  } catch {
    return false;
  }
}

export function markAppealSuccessSession(
  storage: AppealSuccessStorage | null,
  accountId: string,
  recordDate: string,
  title?: string,
  publishedAt?: string,
) {
  if (!storage || !accountId || !recordDate) return;
  storage.setItem(
    getAppealSuccessKey(accountId, recordDate),
    JSON.stringify({ title: title?.trim() || undefined, publishedAt: publishedAt?.trim() || undefined }),
  );
}

export function getAppealSuccessTitle(
  storage: AppealSuccessStorage | null,
  accountId: string,
  recordDate: string,
) {
  if (!storage || !accountId || !recordDate) return null;
  const value = storage.getItem(getAppealSuccessKey(accountId, recordDate));
  if (!value || value === "1") return null;
  try {
    const session = JSON.parse(value) as AppealSuccessSession;
    return session.title?.trim() || null;
  } catch {
    return null;
  }
}

export function clearAppealSuccessSession(
  storage: AppealSuccessStorage | null,
  accountId: string,
  recordDate: string,
) {
  if (!storage || !accountId || !recordDate) return;
  storage.removeItem(getAppealSuccessKey(accountId, recordDate));
}

export function hasBrowserAppealSuccessSession(accountId: string, recordDate: string) {
  return hasAppealSuccessSession(getBrowserStorage(), accountId, recordDate);
}

export function markBrowserAppealSuccessSession(accountId: string, recordDate: string, title?: string, publishedAt?: string) {
  markAppealSuccessSession(getBrowserStorage(), accountId, recordDate, title, publishedAt);
}

export function getBrowserAppealSuccessTitle(accountId: string, recordDate: string) {
  return getAppealSuccessTitle(getBrowserStorage(), accountId, recordDate);
}

export function getAppealSuccessPublishedAt(
  storage: AppealSuccessStorage | null,
  accountId: string,
  recordDate: string,
) {
  if (!storage || !accountId || !recordDate) return null;
  const value = storage.getItem(getAppealSuccessKey(accountId, recordDate));
  if (!value || value === "1") return null;
  try {
    const session = JSON.parse(value) as AppealSuccessSession;
    return session.publishedAt?.trim() || null;
  } catch {
    return null;
  }
}

export function getBrowserAppealSuccessPublishedAt(accountId: string, recordDate: string) {
  return getAppealSuccessPublishedAt(getBrowserStorage(), accountId, recordDate);
}

export function clearBrowserAppealSuccessSession(accountId: string, recordDate: string) {
  clearAppealSuccessSession(getBrowserStorage(), accountId, recordDate);
}
