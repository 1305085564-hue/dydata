"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  NotificationCounts,
  NotificationRow,
} from "@/lib/notifications/types";

export interface LocalNotificationInput {
  /** 本地条目 key，重复 key 会覆盖（去重）。会和后端 id 共存于一个集合 */
  key: string;
  type: string;
  category: "todo" | "feed";
  severity?: "info" | "success" | "warning" | "critical";
  title: string;
  body?: string | null;
  primaryActionLabel?: string;
  primaryAction?: () => void;
  secondaryActionLabel?: string;
  secondaryAction?: () => void;
  createdAt?: string;
}

export interface LocalNotificationRow extends NotificationRow {
  __local: true;
  primaryActionLabel?: string;
  primaryAction?: () => void;
  secondaryActionLabel?: string;
  secondaryAction?: () => void;
}

export type AnyNotificationRow = NotificationRow | LocalNotificationRow;

export function isLocalNotification(row: AnyNotificationRow): row is LocalNotificationRow {
  return (row as LocalNotificationRow).__local === true;
}

interface NotificationContextValue {
  notifications: AnyNotificationRow[];
  counts: NotificationCounts;
  loading: boolean;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  markDone: (id: string, reason?: "done" | "ignored") => Promise<void>;
  /** 注册/更新一个本地通知（只在前端，不入库）。传 null 移除。 */
  setLocalNotification: (key: string, input: LocalNotificationInput | null) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

const POLL_INTERVAL_MS = 60_000;

function buildLocal(input: LocalNotificationInput): LocalNotificationRow {
  const now = input.createdAt ?? new Date().toISOString();
  return {
    __local: true,
    id: `local:${input.key}`,
    user_id: "local",
    type: input.type,
    category: input.category,
    severity: input.severity ?? "info",
    title: input.title,
    body: input.body ?? null,
    action_label: null,
    action_url: null,
    payload: {},
    status: "unread",
    expires_at: null,
    source_type: "local",
    source_id: input.key,
    created_at: now,
    read_at: null,
    done_at: null,
    primaryActionLabel: input.primaryActionLabel,
    primaryAction: input.primaryAction,
    secondaryActionLabel: input.secondaryActionLabel,
    secondaryAction: input.secondaryAction,
  };
}

interface NotificationProviderProps {
  enabled: boolean;
  children: React.ReactNode;
}

export function NotificationProvider({ enabled, children }: NotificationProviderProps) {
  const [remote, setRemote] = useState<NotificationRow[]>([]);
  const [remoteCounts, setRemoteCounts] = useState<NotificationCounts>({ unread: 0, todoOpen: 0 });
  const [locals, setLocals] = useState<Record<string, LocalNotificationRow>>({});
  const [loading, setLoading] = useState(false);
  const inFlightRef = useRef(false);

  const fetchAll = useCallback(async () => {
    if (!enabled) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        notifications: NotificationRow[];
        counts: NotificationCounts;
      };
      setRemote(data.notifications ?? []);
      setRemoteCounts(data.counts ?? { unread: 0, todoOpen: 0 });
    } catch (err) {
      console.warn("[notifications] fetch failed", err);
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void fetchAll();
    const timer = window.setInterval(() => void fetchAll(), POLL_INTERVAL_MS);
    const onFocus = () => void fetchAll();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled, fetchAll]);

  const setLocalNotification = useCallback(
    (key: string, input: LocalNotificationInput | null) => {
      setLocals((prev) => {
        const next = { ...prev };
        if (input === null) {
          delete next[key];
        } else {
          next[key] = buildLocal({ ...input, key });
        }
        return next;
      });
    },
    [],
  );

  const markRead = useCallback(async (id: string) => {
    if (id.startsWith("local:")) {
      const key = id.slice("local:".length);
      setLocals((prev) => {
        if (!prev[key] || prev[key].status === "read") return prev;
        return {
          ...prev,
          [key]: { ...prev[key], status: "read", read_at: new Date().toISOString() },
        };
      });
      return;
    }
    setRemote((rows) =>
      rows.map((row) =>
        row.id === id && row.status === "unread"
          ? { ...row, status: "read", read_at: new Date().toISOString() }
          : row,
      ),
    );
    setRemoteCounts((prev) => ({ ...prev, unread: Math.max(0, prev.unread - 1) }));
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
    } catch (err) {
      console.warn("[notifications] markRead failed", err);
    }
  }, []);

  const markAllRead = useCallback(async () => {
    setLocals((prev) => {
      const next: Record<string, LocalNotificationRow> = {};
      for (const [k, v] of Object.entries(prev)) {
        next[k] = v.status === "unread" ? { ...v, status: "read", read_at: new Date().toISOString() } : v;
      }
      return next;
    });
    setRemote((rows) =>
      rows.map((row) =>
        row.status === "unread"
          ? { ...row, status: "read", read_at: new Date().toISOString() }
          : row,
      ),
    );
    setRemoteCounts((prev) => ({ ...prev, unread: 0 }));
    try {
      await fetch(`/api/notifications/mark-all-read`, { method: "PATCH" });
    } catch (err) {
      console.warn("[notifications] markAllRead failed", err);
    }
  }, []);

  const markDone = useCallback(
    async (id: string, reason: "done" | "ignored" = "done") => {
      if (id.startsWith("local:")) {
        const key = id.slice("local:".length);
        setLocals((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        return;
      }
      const target = remote.find((row) => row.id === id);
      setRemote((rows) => rows.filter((row) => row.id !== id));
      setRemoteCounts((prev) => {
        const next: NotificationCounts = { ...prev };
        if (target?.status === "unread") next.unread = Math.max(0, prev.unread - 1);
        if (target?.category === "todo") next.todoOpen = Math.max(0, prev.todoOpen - 1);
        return next;
      });
      try {
        await fetch(`/api/notifications/${id}/done`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        });
      } catch (err) {
        console.warn("[notifications] markDone failed", err);
      }
    },
    [remote],
  );

  const value = useMemo<NotificationContextValue>(() => {
    const localRows = Object.values(locals).sort(
      (a, b) => +new Date(b.created_at) - +new Date(a.created_at),
    );
    const localUnread = localRows.filter((row) => row.status === "unread").length;
    const localTodoOpen = localRows.filter(
      (row) => row.category === "todo" && (row.status === "unread" || row.status === "read"),
    ).length;
    return {
      notifications: [...localRows, ...remote],
      counts: {
        unread: remoteCounts.unread + localUnread,
        todoOpen: remoteCounts.todoOpen + localTodoOpen,
      },
      loading,
      refresh: fetchAll,
      markRead,
      markAllRead,
      markDone,
      setLocalNotification,
    };
  }, [locals, remote, remoteCounts, loading, fetchAll, markRead, markAllRead, markDone, setLocalNotification]);

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

const noopValue: NotificationContextValue = {
  notifications: [],
  counts: { unread: 0, todoOpen: 0 },
  loading: false,
  refresh: async () => {},
  markRead: async () => {},
  markAllRead: async () => {},
  markDone: async () => {},
  setLocalNotification: () => {},
};

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  return ctx ?? noopValue;
}
