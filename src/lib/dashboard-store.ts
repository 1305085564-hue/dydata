"use client";

type Account = { id: string; name: string; display_name: string; content_direction: string | null };

interface DashboardStore {
  accounts: Account[];
  selectedAccountId: string;
  activeBizDate: string;
  listeners: Set<() => void>;
}

let store: DashboardStore = {
  accounts: [],
  selectedAccountId: "",
  activeBizDate: "",
  listeners: new Set(),
};

function emitChange() {
  for (const listener of store.listeners) listener();
}

export function initDashboardStore(data: { accounts?: Account[]; selectedAccountId?: string; activeBizDate?: string }) {
  let changed = false;
  if (data.accounts && data.accounts.length > 0 && store.accounts.length === 0) {
    store.accounts = data.accounts;
    changed = true;
  }
  if (data.selectedAccountId && data.selectedAccountId !== store.selectedAccountId) {
    store.selectedAccountId = data.selectedAccountId;
    changed = true;
  }
  if (data.activeBizDate && data.activeBizDate !== store.activeBizDate) {
    store.activeBizDate = data.activeBizDate;
    changed = true;
  }
  if (changed) emitChange();
}

let cachedSnapshot = {
  accounts: store.accounts,
  selectedAccountId: store.selectedAccountId,
  activeBizDate: store.activeBizDate,
};

export function getDashboardSnapshot() {
  if (
    cachedSnapshot.accounts !== store.accounts ||
    cachedSnapshot.selectedAccountId !== store.selectedAccountId ||
    cachedSnapshot.activeBizDate !== store.activeBizDate
  ) {
    cachedSnapshot = {
      accounts: store.accounts,
      selectedAccountId: store.selectedAccountId,
      activeBizDate: store.activeBizDate,
    };
  }
  return cachedSnapshot;
}

export function subscribeDashboardStore(listener: () => void) {
  store.listeners.add(listener);
  return () => store.listeners.delete(listener);
}

export function setDashboardAccount(accountId: string) {
  if (accountId !== store.selectedAccountId) {
    store.selectedAccountId = accountId;
    emitChange();
  }
}

export function setDashboardDate(date: string) {
  if (date !== store.activeBizDate) {
    store.activeBizDate = date;
    emitChange();
  }
}
