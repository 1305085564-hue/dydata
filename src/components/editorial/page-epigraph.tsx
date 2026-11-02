"use client";

import { useEffect, useSyncExternalStore } from "react";

import {
  PAGE_EPIGRAPH_DEFAULTS,
  type PageEpigraphKey,
} from "./page-epigraph-copy";

/**
 * 页头案头导语（《组件与场景契约》§4.1）：单行 = 14px 有机人文微印记 + 「诗性底色 —— 实时脉络」。
 * 实时脉络靠按页面键分仓的 useSyncExternalStore 同步；样板 content 页仍用自己的仓，二者互不干扰。
 * 每页微印记各按业务意象手绘：圆头柔弧、暖橙 #D97757 点睛配暖石墨，不用通用图标。
 */

const INK = "#78716C";
const SOFT = "#A8A29E";
const WARM = "#D97757";

const stroke = { strokeLinecap: "round", strokeLinejoin: "round" } as const;

const MARKS: Record<PageEpigraphKey, React.ReactNode> = {
  // 工作台「落笔」：笔尖一点墨，拖出一道上扬的柔线
  workbench: (
    <>
      <circle cx="4.6" cy="11.4" r="2.1" fill={WARM} fillOpacity="0.88" />
      <path d="M7 9.4C9.4 8.2 10.6 6.2 12.8 3.4" stroke={INK} strokeWidth="1.25" {...stroke} />
      <path d="M9.6 12.6C11.6 12.2 13 11 14 9.4" stroke={SOFT} strokeWidth="1.15" {...stroke} />
    </>
  ),
  // 协作管理「接力」：两枚交叠的柔环，交汇处一点暖光
  collaboration: (
    <>
      <circle cx="5.8" cy="8" r="3.8" stroke={INK} strokeWidth="1.2" />
      <circle cx="10.2" cy="8" r="3.8" stroke={SOFT} strokeWidth="1.15" />
      <circle cx="8" cy="8" r="1.4" fill={WARM} fillOpacity="0.88" />
    </>
  ),
  // 每日大盘「晨光」：地平线上升起的半轮暖日与一道远光
  pulse: (
    <>
      <path d="M3.4 11.2a4.6 4.6 0 0 1 9.2 0Z" fill={WARM} fillOpacity="0.88" />
      <path d="M1.8 13.4h12.4" stroke={INK} strokeWidth="1.25" {...stroke} />
      <path d="M8 2.2v1.6M3.2 4.4l1 1.1M12.8 4.4l-1 1.1" stroke={SOFT} strokeWidth="1.15" {...stroke} />
    </>
  ),
  // 发布管理「节拍」：一道起伏的呼吸线，串起三枚落点，当下那枚点亮
  fulfillment: (
    <>
      <path d="M1.8 9.6C3.6 5.8 5.2 5.8 7 9.2S10.4 12.6 14.2 6.4" stroke={INK} strokeWidth="1.25" {...stroke} />
      <circle cx="3.2" cy="7.6" r="1" fill={SOFT} />
      <circle cx="7.4" cy="9.9" r="1" fill={SOFT} />
      <circle cx="12.4" cy="7.6" r="1.7" fill={WARM} fillOpacity="0.88" />
    </>
  ),
  // 选题库「萌芽」：一茎柔弯，托起一暖一素两瓣新叶
  topics: (
    <>
      <path d="M8 14C7.4 11.2 7.8 8.6 9.2 6.2" stroke={INK} strokeWidth="1.25" {...stroke} />
      <path d="M8.6 9C6.2 9.2 4.4 7.8 3.4 5.4 5.9 5 7.8 6.2 8.6 9Z" fill={SOFT} fillOpacity="0.7" />
      <path d="M9.4 6.4C9.6 3.8 11.2 2.4 13.4 2.2 13.4 4.6 12 6.2 9.4 6.4Z" fill={WARM} fillOpacity="0.88" />
    </>
  ),
  // 成员管理「同行」：三枚大小不一的圆并肩而立，错落如一队人
  modules: (
    <>
      <circle cx="4.4" cy="9.4" r="2.6" fill={SOFT} fillOpacity="0.7" />
      <circle cx="9.2" cy="6.6" r="3.2" fill={WARM} fillOpacity="0.88" />
      <circle cx="12.4" cy="11.4" r="2" stroke={INK} strokeWidth="1.2" />
    </>
  ),
  // AI 配置「流转」：由心而外舒展的一道旋线，如算力缓缓盘绕
  "ai-config": (
    <>
      <path
        d="M8 8.2C8 6.8 9.9 6.8 9.9 8.4 9.9 10.8 6 10.8 6 8 6 4.8 11.6 4.8 11.6 8.6 11.6 12.4 4.6 13 3.4 8"
        stroke={INK}
        strokeWidth="1.25"
        {...stroke}
      />
      <circle cx="8" cy="8.2" r="1.3" fill={WARM} fillOpacity="0.88" />
    </>
  ),
  // 数据口径「度衡」：一道张开的圆规弧线，落脚处一点定准的暖心
  caliber: (
    <>
      <path d="M2.8 12.6C3.4 6.4 8.2 3 13.2 4.4" stroke={INK} strokeWidth="1.25" {...stroke} />
      <path d="M5.4 13.4C6 9.6 8.6 7.4 11.6 7" stroke={SOFT} strokeWidth="1.15" {...stroke} />
      <circle cx="13" cy="4.6" r="1.8" fill={WARM} fillOpacity="0.88" />
    </>
  ),
  // 抖音账号「牵线」：一枚暖点，一缕柔线，牵向远处的素环
  douyin: (
    <>
      <circle cx="3.8" cy="11.4" r="2" fill={WARM} fillOpacity="0.88" />
      <path d="M5.6 9.8C7.2 6.2 9 4.6 10.6 4.6" stroke={INK} strokeWidth="1.25" {...stroke} />
      <circle cx="12" cy="4.6" r="2.1" stroke={SOFT} strokeWidth="1.2" />
    </>
  ),
};

const stores = new Map<PageEpigraphKey, { text: string | null; listeners: Set<() => void> }>();

function getStore(key: PageEpigraphKey) {
  let store = stores.get(key);
  if (!store) {
    store = { text: null, listeners: new Set() };
    stores.set(key, store);
  }
  return store;
}

function setPageEpigraph(key: PageEpigraphKey, text: string | null) {
  const store = getStore(key);
  if (store.text === text) return;
  store.text = text;
  for (const listener of store.listeners) listener();
}

/** 数据到位的页面调用：把实时脉络文案发布到页头；卸载或传 null 时回到默认主编导语。 */
export function usePublishPageEpigraph(key: PageEpigraphKey, text: string | null) {
  useEffect(() => {
    setPageEpigraph(key, text);
    return () => setPageEpigraph(key, null);
  }, [key, text]);
}

export function PageEpigraph({ pageKey }: { pageKey: PageEpigraphKey }) {
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

  return (
    <span className="inline-flex items-center gap-1 text-[#78716C] max-w-full">
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 select-none"
        aria-hidden="true"
      >
        {MARKS[pageKey]}
      </svg>
      <span className="truncate">{live ?? PAGE_EPIGRAPH_DEFAULTS[pageKey]}</span>
    </span>
  );
}
