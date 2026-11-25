"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BoundedTtlCache } from "@/lib/cache-policy";
import type { TabKey } from "@/lib/collaboration/domain/workbench-state";
import type { CollaborationWorkbenchData, CollaborationPersonContext } from "@/lib/collaboration/data/workbench-loader";

interface UseCollaborationTabDataInput {
  year: number;
  month: number;
  scopeKey: string;
  initialData: CollaborationWorkbenchData;
  loadFailed: boolean;
  selectedPersonId: string | null;
}

/**
 * 协作页的按需取数：当前页签数据（60 秒客户端缓存、快速切换取消旧请求）与个人档案关联账号。
 * 与页面状态解耦，页面只管选了什么，这里负责取、缓存、取消与报错。
 */
export function useCollaborationTabData({ year, month, scopeKey, initialData, loadFailed, selectedPersonId }: UseCollaborationTabDataInput) {
  const [activeData, setActiveData] = useState<CollaborationWorkbenchData | null>(initialData);
  const [pageMeta, setPageMeta] = useState(initialData);
  const [tabCounts, setTabCounts] = useState(initialData.counts);
  const [loadFailedState, setLoadFailedState] = useState(loadFailed);
  const [isLoadingTab, setIsLoadingTab] = useState(false);
  const [loadedTeamsData, setLoadedTeamsData] = useState<CollaborationWorkbenchData | null>(initialData.tab === "teams" ? initialData : null);
  const [personContext, setPersonContext] = useState<CollaborationPersonContext>(initialData.personContext ?? { ownAccountIds: [], operatorAccounts: [] });
  const tabDataCacheRef = useRef<BoundedTtlCache<CollaborationWorkbenchData> | null>(null);
  if (!tabDataCacheRef.current) {
    tabDataCacheRef.current = new BoundedTtlCache({ scope: "user", ttlMs: 60_000, maxEntries: 8, name: "collaboration-client-tabs" });
    tabDataCacheRef.current.set(`${scopeKey}|${year}-${month}|${initialData.tab}`, initialData);
  }
  const tabRequestRef = useRef<{ sequence: number; controller?: AbortController }>({ sequence: 0 });
  const personRequestRef = useRef<{ sequence: number; controller?: AbortController }>({ sequence: 0 });
  const personContextCacheRef = useRef(new BoundedTtlCache<CollaborationPersonContext>({ scope: "user", ttlMs: 60_000, maxEntries: 32, name: "collaboration-client-person-context" }));


  const loadTabData = useCallback(async (targetTab: TabKey, targetView: "roles" | "teams", fresh = false) => {
    const dataTab = targetView === "teams" ? "teams" : targetTab;
    tabRequestRef.current.controller?.abort();
    const controller = new AbortController();
    const sequence = ++tabRequestRef.current.sequence;
    tabRequestRef.current.controller = controller;
    const isCurrent = () => sequence === tabRequestRef.current.sequence && !controller.signal.aborted;
    const cacheKey = `${scopeKey}|${year}-${month}|${dataTab}`;
    if (fresh) {
      tabDataCacheRef.current?.clear();
      personContextCacheRef.current.clear();
      setLoadedTeamsData(null);
    } else {
      const cached = tabDataCacheRef.current?.get(cacheKey);
      if (cached) {
        setActiveData(cached);
        setPageMeta(cached);
        setTabCounts(cached.counts);
        setLoadFailedState(false);
        if (cached.tab === "teams") setLoadedTeamsData(cached);
        setIsLoadingTab(false);
        return;
      }
    }
    setActiveData(null);
    setLoadFailedState(false);
    setIsLoadingTab(true);
    try {
      const response = await fetch(
        `/api/admin/collaboration/tab-data?year=${year}&month=${month}&tab=${dataTab}${fresh ? "&fresh=1" : ""}`,
        { signal: controller.signal, cache: "no-store" },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "这个月的数据没加载出来");
      if (!isCurrent()) return;
      const data = body as CollaborationWorkbenchData;
      tabDataCacheRef.current?.set(cacheKey, data);
      setActiveData(data);
      setPageMeta(data);
      setTabCounts(data.counts);
      setLoadFailedState(false);
      if (data.tab === "teams") setLoadedTeamsData(data);
    } catch (error) {
      if (!isCurrent()) return;
      setLoadFailedState(true);
      toast.error(error instanceof Error ? error.message : "这个月的数据没加载出来");
    } finally {
      if (isCurrent()) setIsLoadingTab(false);
    }
  }, [month, scopeKey, year]);

  const loadPersonContext = useCallback(async (personId: string) => {
    const cacheKey = `${scopeKey}|${year}-${month}|${personId}`;
    const cached = personContextCacheRef.current.get(cacheKey);
    if (cached) {
      setPersonContext(cached);
      return;
    }
    personRequestRef.current.controller?.abort();
    const controller = new AbortController();
    const sequence = ++personRequestRef.current.sequence;
    personRequestRef.current.controller = controller;
    try {
      const response = await fetch(`/api/admin/collaboration/tab-data?year=${year}&month=${month}&tab=person-context&personId=${encodeURIComponent(personId)}`, {
        signal: controller.signal,
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "个人档案关联账号没加载出来");
      if (sequence !== personRequestRef.current.sequence || controller.signal.aborted) return;
      const context = (body as CollaborationWorkbenchData).personContext ?? { ownAccountIds: [], operatorAccounts: [] };
      personContextCacheRef.current.set(cacheKey, context);
      setPersonContext(context);
    } catch (error) {
      if (sequence !== personRequestRef.current.sequence || controller.signal.aborted) return;
      toast.error(error instanceof Error ? error.message : "个人档案关联账号没加载出来");
    }
  }, [month, scopeKey, year]);

  useEffect(() => {
    if (selectedPersonId) void loadPersonContext(selectedPersonId);
    else {
      personRequestRef.current.sequence += 1;
      personRequestRef.current.controller?.abort();
      setPersonContext({ ownAccountIds: [], operatorAccounts: [] });
    }
  }, [loadPersonContext, selectedPersonId]);

  useEffect(() => () => {
    tabRequestRef.current.sequence += 1;
    tabRequestRef.current.controller?.abort();
    personRequestRef.current.sequence += 1;
    personRequestRef.current.controller?.abort();
  }, []);

  return {
    activeData,
    pageMeta,
    tabCounts,
    loadFailedState,
    isLoadingTab,
    loadedTeamsData,
    personContext,
    loadTabData,
  };
}
