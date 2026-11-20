"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * 页头标题即答案（《美学宝典》§4.1）：页头在服务端渲染，答案要等页面数据到了才知道，
 * 所以由数据端发布答案、页头订阅。数据没到时标题位先放灰色页名，到了原地换成答案，位置不动。
 */
export type PageHeadlineKey = "pulse" | "ai-config";

type HeadlineStore = { text: string | null; listeners: Set<() => void> };

// 键是固定的几页，一页一个仓，不会增长
const stores: Record<PageHeadlineKey, HeadlineStore> = {
  pulse: { text: null, listeners: new Set() },
  "ai-config": { text: null, listeners: new Set() },
};

function getStore(key: PageHeadlineKey) {
  return stores[key];
}

function setPageHeadline(key: PageHeadlineKey, text: string | null) {
  const store = getStore(key);
  if (store.text === text) return;
  store.text = text;
  for (const listener of store.listeners) listener();
}

/** 数据端调用：把答案发布到页头；卸载或传 null 时回到灰色页名。 */
export function usePublishPageHeadline(key: PageHeadlineKey, text: string | null) {
  useEffect(() => {
    setPageHeadline(key, text);
    return () => setPageHeadline(key, null);
  }, [key, text]);
}

export function PageHeadline({ pageKey, placeholder }: { pageKey: PageHeadlineKey; placeholder: string }) {
  const store = getStore(pageKey);
  const live = useSyncExternalStore(
    (listener) => {
      store.listeners.add(listener);
      return () => {
        store.listeners.delete(listener);
      };
    },
    () => store.text,
    () => null,
  );

  return live ? <>{live}</> : <span className="text-[#A8A29E]">{placeholder}</span>;
}
