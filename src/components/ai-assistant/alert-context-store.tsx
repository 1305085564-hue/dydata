"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";

export type AlertPendingContext = {
  alertId: string;
  preview: string;
};

type State = {
  pendingContext: AlertPendingContext | null;
};

type Action =
  | { type: "SET_PENDING"; payload: AlertPendingContext }
  | { type: "CLEAR_PENDING" };

const initialState: State = { pendingContext: null };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_PENDING":
      return { pendingContext: action.payload };
    case "CLEAR_PENDING":
      return { pendingContext: null };
    default:
      return state;
  }
}

type AlertContextValue = {
  pendingContext: AlertPendingContext | null;
  setPendingContext: (ctx: AlertPendingContext) => void;
  clearPendingContext: () => void;
  requestAssistantOpen: () => void;
  consultAlert: (ctx: AlertPendingContext) => void;
};

export const ASSISTANT_OPEN_EVENT = "dydata:assistant-open";

const AlertContext = createContext<AlertContextValue | null>(null);

function dispatchOpenEvent() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ASSISTANT_OPEN_EVENT));
}

export function AlertContextProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const setPendingContext = useCallback((ctx: AlertPendingContext) => {
    dispatch({ type: "SET_PENDING", payload: ctx });
  }, []);

  const clearPendingContext = useCallback(() => {
    dispatch({ type: "CLEAR_PENDING" });
  }, []);

  const requestAssistantOpen = useCallback(() => {
    dispatchOpenEvent();
  }, []);

  const consultAlert = useCallback((ctx: AlertPendingContext) => {
    dispatch({ type: "SET_PENDING", payload: ctx });
    dispatchOpenEvent();
  }, []);

  const value = useMemo<AlertContextValue>(
    () => ({
      pendingContext: state.pendingContext,
      setPendingContext,
      clearPendingContext,
      requestAssistantOpen,
      consultAlert,
    }),
    [
      state.pendingContext,
      setPendingContext,
      clearPendingContext,
      requestAssistantOpen,
      consultAlert,
    ],
  );

  return <AlertContext.Provider value={value}>{children}</AlertContext.Provider>;
}

export function useAlertContextStore(): AlertContextValue {
  const ctx = useContext(AlertContext);
  if (!ctx) {
    return {
      pendingContext: null,
      setPendingContext: () => undefined,
      clearPendingContext: () => undefined,
      requestAssistantOpen: () => undefined,
      consultAlert: () => undefined,
    };
  }
  return ctx;
}

