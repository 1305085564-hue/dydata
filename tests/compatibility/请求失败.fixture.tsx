// 隔离浏览器行为验收：挂载真实组件，所有 fetch 均在本页模拟，不连接业务接口。
// 构建：node_modules/tsx/node_modules/esbuild/bin/esbuild tests/compatibility/请求失败.fixture.tsx --bundle --platform=browser --define:process.env='{}' --alias:next/server=./tests/compatibility/next-server.fixture.ts --outfile=/tmp/dydata-request-errors/app.js
import React, { act, useEffect, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { toast } from "sonner";
import { useFulfillmentWorkbenchState } from "../../src/app/(app)/admin/fulfillment/fulfillment-workbench-state";
import { useContentPageQuery } from "../../src/app/(app)/admin/content/content-page-query";
import { useContentTopicLibrary, type AdminContentVideo } from "../../src/app/(app)/admin/content/content-topic-library";
import { AuthorWorksView } from "../../src/app/(app)/admin/content/author-works-drawer";
import { PermissionGuard } from "../../src/components/permission-guard";
import type { FulfillmentCalendarData } from "../../src/types/fulfillment";
import type { AdminContentPageData } from "../../src/lib/loaders/admin-content-page";

const host = document.getElementById("root")!;
const results = document.getElementById("results")!;
const messages: Array<{ kind: string; text: string }> = [];
let root: Root | undefined;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function lastError() { return messages.filter((item) => item.kind === "error").at(-1)?.text ?? ""; }
function includes(text: string, expected: string) { check(text.includes(expected), `预期包含「${expected}」，实际「${text}」`); }
async function until(predicate: () => boolean, message: string) {
  const deadline = performance.now() + 2000;
  while (!predicate()) {
    check(performance.now() < deadline, message);
    await act(async () => { await new Promise(requestAnimationFrame); });
  }
}
function Context({ children }: { children: ReactNode }) {
  return <PathnameContext.Provider value="/admin/content">
    <SearchParamsContext.Provider value={new URLSearchParams(window.location.search)}>{children}</SearchParamsContext.Provider>
  </PathnameContext.Provider>;
}
async function mount(element: ReactNode) {
  if (!root) root = createRoot(host);
  await act(async () => { root!.render(<Context>{element}</Context>); });
}
async function mountHook<T,>(useHook: () => T) {
  let current!: T;
  function Probe() {
    const value = useHook();
    useEffect(() => { current = value; });
    return null;
  }
  await mount(<Probe />);
  return Object.assign(() => current, { rerender: () => mount(<Probe />) });
}
async function reset() {
  if (root) await act(async () => { root!.unmount(); });
  root = undefined;
  messages.length = 0;
  history.replaceState(null, "", "/admin/content?page=2&cursor=old");
}
const calendar: FulfillmentCalendarData = {
  year: 2026, month: 11, members: [], todayExceptions: [], rangeExceptions: [],
  range: { preset: "month", startDate: "2026-11-01", endDate: "2026-11-30", label: "11月" },
  scope: { teamId: null, label: "全公司" }, filterOptions: { teams: [] },
  stats: { totalMembers: 0, publishedToday: 0, pendingToday: 0, leaveToday: 0, waivedToday: 0, absentToday: 0, periodFulfillmentRate: 0, consecutiveMissingMembers: 0, publishedCount: 0, requiredCount: 0, pendingExemptionRequests: 0 },
};
const oldList = { videos: [{ id: "old-video" }], snapshots: [] } as unknown as AdminContentPageData;
const videos = (count: number, prefix = "v") => Array.from({ length: count }, (_, i) => ({ id: `${prefix}-${i}` })) as AdminContentVideo[];
const topic = { status: "in_library", subTopicId: "topic-1", topicKind: "dry_goods" };
const json = (status: number, error?: string) => Response.json(error ? { error } : {}, { status });
const network = async (): Promise<Response> => { throw new TypeError("private network debug"); };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const scenarios: Array<[string, () => Promise<void>]> = [];
const add = (name: string, run: () => Promise<void>) => scenarios.push([name, run]);

for (const [name, fetcher, expected] of [
  ["401", async () => json(401, "expired token"), "登录状态已失效"],
  ["403", async () => json(403, "没有日历权限"), "没有日历权限"],
  ["500编号", async () => json(500, "后台暂不可用（编号：calendar-500）"), "calendar-500"],
  ["网络", network, "网络连接异常"],
  ["非JSON", async () => new Response("broken json"), "返回数据无法读取"],
] as const) {
  for (const action of ["loadCalendar", "refreshVisibleCalendar"] as const) {
    add(`日历 ${action} ${name}：保留旧数据、准确提示并解除加载`, async () => {
      window.fetch = fetcher;
      const read = await mountHook(() => useFulfillmentWorkbenchState({ initialData: calendar, canManage: false, canManageSystem: false }));
      await act(async () => { await read()[action](2026, 10); });
      check(read().calendarData === calendar, "失败后日历旧数据丢失");
      check(!read().isLoadingCalendar, "日历仍在加载");
      includes(lastError(), expected);
      check(!lastError().includes("private"), "暴露底层异常");
    });
  }
}
add("日历成功切月更新数据与地址", async () => {
  window.fetch = async () => Response.json({ data: { ...calendar, month: 10 } });
  const read = await mountHook(() => useFulfillmentWorkbenchState({ initialData: calendar, canManage: false, canManageSystem: false }));
  await act(async () => { await read().loadCalendar(2026, 10); });
  check(read().calendarData.month === 10, "成功未更新日历");
  check(new URL(location.href).searchParams.get("month") === "10", "成功未同步月份地址");
  check(!read().isLoadingCalendar && messages.length === 0, "成功留下加载或错误提示");
});

async function listHook() {
  return mountHook(() => useContentPageQuery({ initialData: oldList, initialView: "all", initialPerspective: "company", initialTeamId: null, canSwitchPerspective: true, teams: [], fallbackTeamId: null }));
}
for (const [name, fetcher, expected] of [
  ["401", async () => json(401), "登录状态已失效"],
  ["非stale 409", async () => json(409, "筛选条件已变化（编号：list-409）"), "list-409"],
  ["网络", network, "网络连接异常"],
  ["非JSON", async () => new Response("broken json"), "返回数据无法读取"],
] as const) {
  add(`内容列表 ${name}：保留上次数据和明确原因`, async () => {
    window.fetch = fetcher;
    const read = await listHook();
    await act(async () => { check(await read().loadData("all", "company", null) === false, "失败却返回成功"); });
    check(read().data === oldList, "失败清空了旧列表");
    check(!read().isLoading, "列表仍在加载");
    includes(lastError(), expected);
    includes(lastError(), "当前显示的仍是上次的数据");
  });
}
for (const fail of [false, true]) {
  add(`内容列表 staleCursor 自动回第一页后${fail ? "断网保留旧数据" : "成功更新列表"}`, async () => {
    const urls: string[] = [];
    const next = { videos: [{ id: "fresh-video" }], snapshots: [] };
    window.fetch = async (input) => {
      urls.push(String(input));
      if (urls.length === 1) return Response.json({ staleCursor: true }, { status: 409 });
      return fail ? network() : Response.json(next);
    };
    const read = await listHook();
    await act(async () => { await read().loadData("all", "company", null); });
    check(urls.length === 2, "没有自动重试一次");
    check(!new URL(urls[1], location.origin).searchParams.has("cursor"), "重试仍带旧游标");
    check(!new URL(urls[1], location.origin).searchParams.has("page"), "重试未回第一页");
    check(!new URL(location.href).searchParams.has("page"), "地址未回第一页");
    check(messages.some((item) => item.kind === "info" && item.text === "列表数据已更新，已回到第一页"), "缺少回页提示");
    if (fail) {
      check(read().data === oldList, "断网丢失旧数据");
      includes(lastError(), "网络连接异常");
      check(!lastError().includes("409"), "断网误报旧409");
    } else check(read().data.videos[0].id === "fresh-video", "未更新列表");
  });
}

for (const partial of [false, true]) {
  add(`选题库${partial ? "部分批次" : "全部批次"}失败保留首个真实原因`, async () => {
    let calls = 0;
    window.fetch = async () => {
      calls += 1;
      return partial && calls > 1 ? Response.json({ statuses: { "v-400": topic } }) : json(403, "选题服务拒绝（编号：topic-403）");
    };
    const list = videos(401);
    const read = await mountHook(() => useContentTopicLibrary({ videos: list, canReviewContent: true, refreshList: async () => {} }));
    await until(() => lastError().length > 0, "批次完成后缺少失败提示");
    check(calls === 2, "未按400条分批");
    includes(lastError(), "topic-403");
    if (partial) {
      includes(lastError(), "1 批未加载成功");
      check(read().topicLibraryStatuses["v-400"].status === "in_library", "成功批次丢失");
    } else check(Object.keys(read().topicLibraryStatuses).length === 0, "全败错误合并状态");
  });
}
add("选题库取消旧请求静默，新批次结果正常合并", async () => {
  let aborted = false;
  let nextVideos = videos(1);
  window.fetch = async (_url, init) => new Promise<Response>((resolve, reject) => {
    if (aborted) return resolve(Response.json({ statuses: { "next-0": topic } }));
    init!.signal!.addEventListener("abort", () => { aborted = true; reject(new DOMException("cancelled", "AbortError")); }, { once: true });
  });
  const read = await mountHook(() => useContentTopicLibrary({ videos: nextVideos, canReviewContent: true, refreshList: async () => {} }));
  check(Object.keys(read().topicLibraryStatuses).length === 0, "旧请求应仍在途");
  nextVideos = videos(1, "next");
  await read.rerender();
  await until(() => Boolean(read().topicLibraryStatuses["next-0"]), "新批次未完成");
  check(aborted, "旧请求未取消");
  check(messages.length === 0, "取消产生错误提示");
  check(read().topicLibraryStatuses["next-0"]?.status === "in_library", "未合并新批次");
  check(Object.keys(read().topicLibraryStatuses).length === 1, "混入旧批次");
});

for (const [name, fetcher, expected] of [
  ["401", async () => json(401), "登录状态已失效"],
  ["403", async () => json(403, "当前账号不能申请此权限"), "当前账号不能申请此权限"],
  ["429", async () => json(429), "操作过于频繁"],
  ["500编号", async () => json(500, "申请服务暂不可用（编号：apply-500）"), "apply-500"],
  ["网络", network, "网络连接异常"],
  ["warning", async () => Response.json({ warning: "申请已保存，通知稍后送达" }), "申请已保存，通知稍后送达"],
  ["成功", async () => Response.json({ ok: true }), "已通知公司负责人，等待处理中。"],
] as const) {
  add(`权限申请 ${name}：准确提示并解除按钮忙碌`, async () => {
    window.fetch = fetcher;
    await mount(<PermissionGuard moduleTitle="AI 配置" />);
    const button = Array.from(host.querySelectorAll("button")).find((item) => item.textContent?.includes("申请"));
    check(button, "申请按钮不存在");
    await act(async () => { button.click(); });
    check(!button.disabled, "申请按钮仍禁用");
    includes(messages.at(-1)?.text ?? "", expected);
    check(messages.at(-1)?.kind === (name === "成功" ? "success" : "error"), "提示类型改变");
  });
}

add("作者详情显示服务端编号，切换作品后忽略旧失败", async () => {
  const oldResponse = deferred<Response>();
  window.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/old?")) return oldResponse.promise;
    if (url.includes("/new?")) return json(500, "详情暂不可用（编号：detail-new）");
    return Response.json({ works: [], snapshots: [], summary: {}, page: 1, hasNextPage: false });
  };
  const props = { author: { id: "author-1", name: "测试作者" }, onClose: () => {} };
  await mount(<AuthorWorksView {...props} selectedVideoId="old" />);
  await mount(<AuthorWorksView {...props} selectedVideoId="new" />);
  await until(() => Boolean(host.textContent?.includes("detail-new")), "新作品详情未显示失败原因");
  includes(host.textContent ?? "", "detail-new");
  await act(async () => { oldResponse.resolve(json(403, "旧作品不应显示")); });
  check(!host.textContent?.includes("旧作品不应显示"), "已取消的旧请求覆盖新错误");
  includes(host.textContent ?? "", "detail-new");
});
add("作者切篇保留上一条详情，新详情返回后再替换", async () => {
  const nextResponse = deferred<Response>();
  const detail = (id: string, title: string) => ({ video: {
    id, user_id: "author-1", accounts: { name: "测试账号" }, profiles: { name: "测试作者" },
    video_title: title, content: title, published_at: "2026-11-22T12:00:00Z", anomaly_status: "normal", lifecycle_state: "active",
  }, snapshot: null });
  window.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/first?")) return Response.json(detail("first", "上一条已加载文案"));
    if (url.includes("/second?")) return nextResponse.promise;
    return Response.json({ works: [], snapshots: [], summary: {}, page: 1, hasNextPage: false });
  };
  const props = { author: { id: "author-1", name: "测试作者" }, onClose: () => {} };
  await mount(<AuthorWorksView {...props} selectedVideoId="first" />);
  await until(() => Boolean(host.textContent?.includes("上一条已加载文案")), "首条详情未加载");
  await mount(<AuthorWorksView {...props} selectedVideoId="second" />);
  includes(host.textContent ?? "", "上一条已加载文案");
  await act(async () => { nextResponse.resolve(Response.json(detail("second", "新条目的文案"))); });
  await until(() => Boolean(host.textContent?.includes("新条目的文案")), "新条目未替换");
  check(!host.textContent?.includes("上一条已加载文案"), "新详情完成后仍留旧文案");
});

document.getElementById("run")!.addEventListener("click", async () => {
  const button = document.getElementById("run") as HTMLButtonElement;
  button.disabled = true;
  const originalFetch = window.fetch;
  const original = { error: toast.error, info: toast.info, success: toast.success };
  for (const kind of ["error", "info", "success"] as const) {
    toast[kind] = ((text: unknown) => { messages.push({ kind, text: String(text) }); return 1; }) as typeof toast[typeof kind];
  }
  const report: Array<{ name: string; status: string; error?: string }> = [];
  try {
    for (const [name, run] of scenarios) {
      await reset();
      try { await run(); report.push({ name, status: "PASS" }); }
      catch (error) { report.push({ name, status: "FAIL", error: error instanceof Error ? error.message : String(error) }); }
      results.textContent = JSON.stringify(report, null, 2);
    }
  } finally {
    await reset();
    window.fetch = originalFetch;
    Object.assign(toast, original);
    button.disabled = false;
    results.dataset.complete = "true";
  }
});
