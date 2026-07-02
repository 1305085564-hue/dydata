"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import {
  PremiumAccount,
  PremiumTodo,
  PremiumNotification,
  MOCK_ACCOUNTS,
  MOCK_TODOS,
  MOCK_NOTIFICATIONS,
} from "./mock-data";

interface DemoContextType {
  perspective: "user" | "admin";
  setPerspective: (p: "user" | "admin") => void;
  accounts: PremiumAccount[];
  selectedAccountId: string;
  setSelectedAccountId: (id: string) => void;
  selectedAccount: PremiumAccount | null;
  todos: PremiumTodo[];
  toggleTodo: (id: string) => void;
  notifications: PremiumNotification[];
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  deleteNotification: (id: string) => void;
  profileName: string;
  setProfileName: (name: string) => void;
  profileRole: string;
  commandHubOpen: boolean;
  setCommandHubOpen: (open: boolean) => void;
  commandHubTab: "todos" | "notifications";
  setCommandHubTab: (tab: "todos" | "notifications") => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
}

const DemoContext = createContext<DemoContextType | null>(null);

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [perspective, setPerspective] = useState<"user" | "admin">("user");
  const [selectedAccountId, setSelectedAccountId] = useState<string>("acc-1");
  const [todos, setTodos] = useState<PremiumTodo[]>(MOCK_TODOS);
  const [notifications, setNotifications] = useState<PremiumNotification[]>(MOCK_NOTIFICATIONS);
  const [profileName, setProfileName] = useState<string>("林经理 (DY_Admin)");
  const [profileRole, setProfileRole] = useState<string>("owner");
  const [commandHubOpen, setCommandHubOpen] = useState<boolean>(false);
  const [commandHubTab, setCommandHubTab] = useState<"todos" | "notifications">("todos");
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);

  const selectedAccount = MOCK_ACCOUNTS.find((a) => a.id === selectedAccountId) || MOCK_ACCOUNTS[0] || null;

  const toggleTodo = useCallback((id: string) => {
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    );
  }, []);

  const markNotificationRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const deleteNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return (
    <DemoContext.Provider
      value={{
        perspective,
        setPerspective,
        accounts: MOCK_ACCOUNTS,
        selectedAccountId,
        setSelectedAccountId,
        selectedAccount,
        todos,
        toggleTodo,
        notifications,
        markNotificationRead,
        markAllNotificationsRead,
        deleteNotification,
        profileName,
        setProfileName,
        profileRole,
        commandHubOpen,
        setCommandHubOpen,
        commandHubTab,
        setCommandHubTab,
        settingsOpen,
        setSettingsOpen,
      }}
    >
      {children}
    </DemoContext.Provider>
  );
}

export function useDemoState() {
  const context = useContext(DemoContext);
  if (!context) {
    throw new Error("useDemoState must be used within a DemoProvider");
  }
  return context;
}
