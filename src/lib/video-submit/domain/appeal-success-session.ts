type AppealSuccessStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

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
  return storage.getItem(getAppealSuccessKey(accountId, recordDate)) === "1";
}

export function markAppealSuccessSession(
  storage: AppealSuccessStorage | null,
  accountId: string,
  recordDate: string,
) {
  if (!storage || !accountId || !recordDate) return;
  storage.setItem(getAppealSuccessKey(accountId, recordDate), "1");
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

export function markBrowserAppealSuccessSession(accountId: string, recordDate: string) {
  markAppealSuccessSession(getBrowserStorage(), accountId, recordDate);
}

export function clearBrowserAppealSuccessSession(accountId: string, recordDate: string) {
  clearAppealSuccessSession(getBrowserStorage(), accountId, recordDate);
}
