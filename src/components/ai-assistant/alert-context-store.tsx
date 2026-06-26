"use client";

import type { ReactNode } from "react";

export type AlertPendingContext = {
  alertId: string;
  preview: string;
};

export const ASSISTANT_OPEN_EVENT = "dydata:assistant-open";

export function AlertContextProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useAlertContextStore() {
  return {
    pendingContext: null,
    setPendingContext: (ctx?: AlertPendingContext) => undefined,
    clearPendingContext: () => undefined,
    requestAssistantOpen: () => undefined,
    consultAlert: (ctx?: AlertPendingContext) => undefined,
  };
}

