"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import type {
  ActiveTopicsResponse,
  TopicPoolItem,
  TopicOption,
  TopicPoolView,
  TopicTimeRange,
  TopicMoreFiltersState,
  SubTopicItem,
  BatchImportParsedRow,
  BatchImportSummary,
} from "./types";
import { DEFAULT_MORE_FILTERS } from "./types";
import {
  fetchTopicJson,
  parseActiveTopicsResponse,
  parseTopicLibraryBootstrapResponse,
  parseTopicPoolResponse,
  isTeamMembershipRequiredError,
  TopicRequestError,
  type V2TopicLibraryBootstrap,
} from "@/lib/topics/v2-client-contract";
import {
  RefreshCw,
} from "lucide-react";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { CompassConstellationIllustration } from "@/components/editorial/editorial-illustrations";
import { TeamActivitySection } from "./TeamActivitySection";
import { TopicPoolExplorer, type SortByOption } from "./TopicPoolExplorer";
import { runFeishuCreationFlow } from "./feishu-creation-flow";
import { buildTopicPoolQuery } from "./topic-navigation";
import { isTopicWritingByCurrentUser } from "./topic-writing-state";

// Item 8: 按需动态加载重型弹窗与抽屉，避免选题库首屏为尚未使用的弹窗承担体积
const TopicWorkBreakdownDrawer = dynamic(
  () =>
    import("./TopicWorkBreakdownDrawer").then((mod) => mod.TopicWorkBreakdownDrawer),
  { ssr: false },
);

const TopicMoreFiltersDrawer = dynamic(
  () =>
    import("./TopicMoreFiltersDrawer").then((mod) => mod.TopicMoreFiltersDrawer),
  { ssr: false },
);

const TopicCreateModal = dynamic(
  () => import("./TopicCreateModal").then((mod) => mod.TopicCreateModal),
  { ssr: false },
);

export function TopicHubV2({
  canManageTopicLibrary = false,
  feishuWorkspaceUrl = null,
  initialBootstrapData = null,
  initialTopicId = null,
}: {
  canManageTopicLibrary?: boolean;
  feishuWorkspaceUrl?: string | null;
  initialBootstrapData?: V2TopicLibraryBootstrap | null;
  /** /topics?topic_id= 深链：服务端归一化后传入，挂载即打开对应选题抽屉 */
  initialTopicId?: string | null;
}) {
  // Toast 轻反馈（接入全站 feedbackToast 规范）
  const showToast = (text: string, type: "success" | "error" = "success") => {
    if (type === "success") {
      feedbackToast.success(text);
    } else {
      feedbackToast.error(text);
    }
  };

  // 全局数据状态
  const [activeTopics, setActiveTopics] = useState<ActiveTopicsResponse | null>(
    () => (initialBootstrapData?.active as unknown as ActiveTopicsResponse | undefined) ?? null,
  );
  const [activeLoading, setActiveLoading] = useState(!initialBootstrapData);
  const [activeError, setActiveError] = useState<string | null>(null);

  const [poolItems, setPoolItems] = useState<TopicPoolItem[]>(
    () => (initialBootstrapData?.pool.items as unknown as TopicPoolItem[] | undefined) ?? [],
  );
  const [poolLoading, setPoolLoading] = useState(!initialBootstrapData);
  const [poolError, setPoolError] = useState<string | null>(null);
  const [poolTotalCount, setPoolTotalCount] = useState(
    () => initialBootstrapData?.pool.pagination.totalItems ?? 0,
  );

  const [topicsOptions, setTopicsOptions] = useState<TopicOption[]>(
    () => (initialBootstrapData?.options as unknown as TopicOption[] | undefined) ?? [],
  );
  const [topicsOptionsError, setTopicsOptionsError] = useState<string | null>(null);

  // 选题池 Query & 排序筛选选项
  const [poolView, setPoolView] = useState<TopicPoolView>("all");
  const [poolTimeRange, setPoolTimeRange] = useState<TopicTimeRange>("all");
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [moreFilters, setMoreFilters] =
    useState<TopicMoreFiltersState>(DEFAULT_MORE_FILTERS);
  const [isMoreFiltersOpen, setIsMoreFiltersOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortByOption>("latest");
  const [poolSearchQuery, setPoolSearchQuery] = useState("");
  const [debouncedPoolSearchQuery, setDebouncedPoolSearchQuery] = useState("");
  const [poolPage, setPoolPage] = useState(1);

  // 抽屉与 Modal 控制；深链 topic_id 直接打开对应抽屉
  const [inspectTopicId, setInspectTopicId] = useState<string | null>(initialTopicId);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // 服务端 bootstrap 下发的当前登录用户 ID（抽屉用于仅作者可见的编辑/移出）
  const [currentUserId, setCurrentUserId] = useState<string | null>(
    () => initialBootstrapData?.currentUserId ?? null,
  );

  const [, setAuthError] = useState(false);
  const [membershipRequired, setMembershipRequired] = useState(false);
  const poolRequestId = useRef(0);
  const poolAbortController = useRef<AbortController | null>(null);
  const skipPoolEffectPage = useRef<number | null>(null);
  const [writingTopicIds, setWritingTopicIds] = useState<Set<string>>(
    () => new Set(initialBootstrapData?.myWritingTopicIds ?? []),
  );
  const bootstrapRequestRef = useRef<Promise<void> | null>(null);
  const previousPoolQueryKey = useRef<string | null>(null);

  const resolvedPoolItems = useMemo(
    () =>
      poolItems.map((item) => ({
        ...item,
        isWritingByMe: isTopicWritingByCurrentUser(item, writingTopicIds),
      })),
    [poolItems, writingTopicIds],
  );

  const beginPoolQueryChange = useCallback(() => {
    poolAbortController.current?.abort();
    poolRequestId.current += 1;
    setPoolLoading(true);
    setPoolError(null);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPoolPage(1);
      setDebouncedPoolSearchQuery(poolSearchQuery.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [poolSearchQuery]);

  const getErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof TopicRequestError) return error.message;
    if (error instanceof Error) return error.message;
    return fallback;
  };

  // 首屏聚合读取：服务端一次确认身份并并行返回首屏所需数据。
  const fetchBootstrapData = useCallback(() => {
    if (bootstrapRequestRef.current) return bootstrapRequestRef.current;

    const request = (async () => {
      setActiveLoading(true);
      setPoolLoading(true);
      setActiveError(null);
      setPoolError(null);
      setTopicsOptionsError(null);

      try {
        const parsed = parseTopicLibraryBootstrapResponse(
          await fetchTopicJson("/api/topics/bootstrap"),
        );
        setActiveTopics(parsed.active);
        setTopicsOptions(parsed.options);
        setPoolItems(parsed.pool.items);
        setPoolTotalCount(parsed.pool.pagination.totalItems);
        setWritingTopicIds(new Set(parsed.myWritingTopicIds));
        setCurrentUserId(parsed.currentUserId);
        setAuthError(false);
      } catch (err) {
        if (isTeamMembershipRequiredError(err)) {
          setMembershipRequired(true);
        }
        if (err instanceof TopicRequestError && err.status === 401) {
          setAuthError(true);
        }
        const message = getErrorMessage(err, "加载选题库失败");
        setActiveError(message);
        setPoolError(message);
        setTopicsOptionsError(message);
      } finally {
        setActiveLoading(false);
        setPoolLoading(false);
      }
    })();

    bootstrapRequestRef.current = request;
    void request.then(
      () => {
        if (bootstrapRequestRef.current === request) bootstrapRequestRef.current = null;
      },
      () => {
        if (bootstrapRequestRef.current === request) bootstrapRequestRef.current = null;
      },
    );
    return request;
  }, []);

  // 筛选/刷新后的大盘活跃数据
  const fetchActiveData = useCallback(async () => {
    setActiveLoading(true);
    setActiveError(null);
    try {
      const data = await fetchTopicJson("/api/topics/active");
      const parsed = parseActiveTopicsResponse(data);
      setActiveTopics(parsed);
      setAuthError(false);
    } catch (err) {
      if (isTeamMembershipRequiredError(err)) {
        setMembershipRequired(true);
        return;
      }
      if (err instanceof TopicRequestError && err.status === 401) {
        setAuthError(true);
      }
      setActiveError(getErrorMessage(err, "加载活跃母题失败"));
    } finally {
      setActiveLoading(false);
    }
  }, []);

  // 获取筛选后的选题池列表；首次进入由 bootstrap 提供，避免重复请求。
  const fetchPoolPage = useCallback(async (targetPage: number) => {
    const requestId = ++poolRequestId.current;
    poolAbortController.current?.abort();
    const controller = new AbortController();
    poolAbortController.current = controller;
    setPoolLoading(true);
    setPoolError(null);

    const params = buildTopicPoolQuery({
      view: poolView,
      sort: sortBy,
      search: debouncedPoolSearchQuery,
      timeRange: poolTimeRange,
      topicIds: selectedTopicIds,
      sourceType: moreFilters.sourceType,
      recentHeat: moreFilters.recentHeat,
      durationRange: moreFilters.durationRange,
      performance: moreFilters.performanceTier,
      pageSize: 50,
    }, targetPage);

    try {
      const data = await fetchTopicJson(`/api/topics/pool?${params.toString()}`, {
        signal: controller.signal,
      });
      if (controller.signal.aborted || requestId !== poolRequestId.current) return null;
      const parsed = parseTopicPoolResponse(data);
      setPoolItems(parsed.items);
      setPoolTotalCount(parsed.pagination.totalItems);
      return parsed;
    } catch (err) {
      if (controller.signal.aborted || requestId !== poolRequestId.current) return null;
      if (isTeamMembershipRequiredError(err)) {
        setMembershipRequired(true);
        return null;
      }
      setPoolError(getErrorMessage(err, "加载选题池失败"));
      return null;
    } finally {
      if (requestId === poolRequestId.current) {
        setPoolLoading(false);
      }
    }
  }, [
    poolView,
    sortBy,
    debouncedPoolSearchQuery,
    poolTimeRange,
    selectedTopicIds,
    moreFilters,
  ]);

  const fetchPoolData = useCallback(
    () => fetchPoolPage(poolPage),
    [fetchPoolPage, poolPage],
  );

  const poolQueryKey = [
    poolPage,
    poolView,
    sortBy,
    debouncedPoolSearchQuery,
    poolTimeRange,
    selectedTopicIds.join(","),
    moreFilters.sourceType,
    moreFilters.recentHeat,
    moreFilters.durationRange,
    moreFilters.performanceTier,
  ].join("|");

  // 初始化只走 bootstrap；筛选条件真正变化后才请求普通 pool 接口。
  useEffect(() => {
    if (initialBootstrapData) return;
    void fetchBootstrapData();
  }, [fetchBootstrapData, initialBootstrapData]);

  useEffect(() => {
    if (skipPoolEffectPage.current === poolPage) {
      skipPoolEffectPage.current = null;
      previousPoolQueryKey.current = poolQueryKey;
      return;
    }
    if (previousPoolQueryKey.current === null) {
      previousPoolQueryKey.current = poolQueryKey;
      return;
    }
    if (previousPoolQueryKey.current === poolQueryKey) return;
    previousPoolQueryKey.current = poolQueryKey;
    void fetchPoolData();
  }, [fetchPoolData, poolPage, poolQueryKey]);

  // 刷新会变化的动态与选题列表；母题选项只在首屏读取，写入动作不会改变它。
  const refreshAll = useCallback(async () => {
    await Promise.all([
      fetchActiveData(),
      fetchPoolData(),
    ]);
  }, [fetchActiveData, fetchPoolData]);

  // 兼容性保留与旧契约映射已废除：V3 不再有 replace-claim / 候选位 / 撞车阻断
  // 开始写作（幂等；等待结果，失败返回 false，不显示成功）
  const handleMarkWriting = async (subTopicId: string): Promise<boolean> => {
    try {
      await fetchTopicJson(
        `/api/topics/sub-topics/${subTopicId}/start-scripting`,
        { method: "POST" },
      );
      setWritingTopicIds((current) => {
        const next = new Set(current);
        next.add(subTopicId);
        return next;
      });
      void refreshAll();
      return true;
    } catch (err) {
      if (isTeamMembershipRequiredError(err)) setMembershipRequired(true);
      showToast(getErrorMessage(err, "更新写作状态失败"), "error");
      return false;
    }
  };

  // 飞书创作统一动线：安全地址 → 复制提纲 → 必要时静默标记在写 → 打开。
  const handleGoToFeishu = async (topic: SubTopicItem) => {
    const isWriting = isTopicWritingByCurrentUser(topic, writingTopicIds);
    const result = await runFeishuCreationFlow({
      topic: {
        id: topic.id,
        title: topic.title,
        hook: topic.hook,
        topicName: topic.topics?.name,
        audience: topic.audience,
        outline: topic.outline,
        sourceType: topic.source_type ?? null,
        summary: topic.summary ?? null,
      },
      workspaceUrl: feishuWorkspaceUrl,
      isWriting,
      copy: (content) => navigator.clipboard.writeText(content),
      markWriting: handleMarkWriting,
      reserveWindow: () => {
        const opened = window.open("about:blank", "_blank");
        if (!opened) return null;
        opened.opener = null;
        return {
          navigate: (url) => opened.location.assign(url),
          close: () => opened.close(),
        };
      },
    });

    if (result.status === "success") {
      showToast(
        isWriting ? "提纲已复制，正在前往飞书" : "提纲已复制，已标记在写，正在前往飞书",
        "success",
      );
    } else if (result.status === "copy_failed") {
      showToast("提纲复制失败，请检查浏览器剪贴板权限后重试", "error");
    } else if (result.status === "mark_failed") {
      showToast("提纲已复制，但未登记为在写；请重试后再打开飞书", "error");
    } else if (result.status === "popup_blocked") {
      feedbackToast.error("浏览器拦截了飞书页面", {
        description: isWriting ? "提纲已复制，写作状态已保留" : "提纲已复制并登记为在写",
        action: {
          label: "手动打开",
          onClick: () => window.location.assign(result.url),
        },
      });
    } else if (result.status === "workspace_invalid") {
      showToast("飞书空间地址不安全或格式有误；提纲已复制，请联系管理员修正", "error");
    } else {
      showToast("团队尚未配置飞书空间地址；提纲已复制，可先粘贴使用", "error");
    }
  };

  // 管理员通道：外部干货批量导入（真实解析与导入接口）
  const handleParseImportFile = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/admin/topics-library/import/parse", {
      method: "POST",
      body: formData,
    });
    const payload = (await res.json().catch(() => null)) as
      | { error?: string; rows?: unknown; summary?: unknown }
      | null;
    if (!res.ok || !payload) {
      throw new Error(payload?.error || "文件解析失败，请稍后重试");
    }
    const rows = (payload.rows ?? []) as Array<Record<string, unknown>>;
    const parsedRows: BatchImportParsedRow[] = rows.map((row) => ({
      rowNumber: Number(row.rowNumber ?? 0),
      topicName: String(row.topicName ?? ""),
      title: String(row.title ?? ""),
      durationText: typeof row.durationText === "string" ? row.durationText : undefined,
      historyPlay: (row.historyPlay as number | null) ?? null,
      historyLikes: (row.historyLikes as number | null) ?? null,
      hook: (row.hook as string | null) ?? null,
      outline: (row.outline as string | null) ?? null,
      status: (row.status as BatchImportParsedRow["status"]) ?? "error",
      validationMessage: String(row.message ?? row.validationMessage ?? ""),
    }));

    // summary 窄化校验：后端返回合法数值计数则采用，缺失/非法时从已解析行按状态兜底派生，
    // 避免把脏结构或缺失字段盲转成 BatchImportSummary。
    const rawSummary = payload.summary as Partial<BatchImportSummary> | null | undefined;
    const safeCount = (value: unknown, fallback: number) =>
      typeof value === "number" && Number.isFinite(value) ? value : fallback;
    const summary: BatchImportSummary = {
      totalCount: safeCount(rawSummary?.totalCount, parsedRows.length),
      validCount: safeCount(
        rawSummary?.validCount,
        parsedRows.filter((r) => r.status === "valid").length,
      ),
      warningCount: safeCount(
        rawSummary?.warningCount,
        parsedRows.filter((r) => r.status === "warning").length,
      ),
      errorCount: safeCount(
        rawSummary?.errorCount,
        parsedRows.filter((r) => r.status === "error").length,
      ),
      errors:
        rawSummary && Array.isArray(rawSummary.errors) ? rawSummary.errors : [],
    };

    return { rows: parsedRows, summary };
  }, []);

  const handleConfirmImport = useCallback(async (
    rows: BatchImportParsedRow[],
    fileName?: string | null,
  ) => {
    const res = await fetch("/api/admin/topics-library/import/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows, fileName: fileName ?? null }),
    });
    const payload = (await res.json().catch(() => null)) as
      | { error?: string; successCount?: number; skippedCount?: number; failedCount?: number; errors?: Array<{ rowNumber: number; title: string; reason: string }> }
      | null;
    if (!res.ok || !payload) {
      throw new Error(payload?.error || "导入执行失败，请稍后重试");
    }
    if ((payload.successCount ?? 0) > 0) {
      await refreshAll();
    }
    return {
      successCount: payload.successCount ?? 0,
      skippedCount: payload.skippedCount ?? 0,
      failedCount: payload.failedCount ?? 0,
      errors: payload.errors ?? [],
    };
  }, [refreshAll]);

  const currentInspectIndex = inspectTopicId
    ? poolItems.findIndex((item) => item.id === inspectTopicId)
    : -1;
  const totalPages = Math.max(1, Math.ceil(poolTotalCount / 50));
  const hasPrevTopic = currentInspectIndex > 0 || poolPage > 1;
  const hasNextTopic =
    (currentInspectIndex >= 0 && currentInspectIndex < poolItems.length - 1) ||
    poolPage < totalPages;

  const handleNavigateTopic = useCallback(
    async (direction: "prev" | "next") => {
      if (!inspectTopicId) return;
      const currentIndex = poolItems.findIndex((item) => item.id === inspectTopicId);
      if (currentIndex < 0) return;

      if (direction === "next") {
        if (currentIndex < poolItems.length - 1) {
          setInspectTopicId(poolItems[currentIndex + 1].id);
        } else if (poolPage < totalPages) {
          // 当前页扫到底部，跨页拉取下一页首条
          const nextPage = poolPage + 1;
          try {
            const parsed = await fetchPoolPage(nextPage);
            if (!parsed) return;
            skipPoolEffectPage.current = nextPage;
            setPoolPage(nextPage);
            if (parsed.items.length > 0) {
              setInspectTopicId(parsed.items[0].id);
            }
          } catch {
            showToast("加载下一页选题失败", "error");
          }
        }
      } else {
        if (currentIndex > 0) {
          setInspectTopicId(poolItems[currentIndex - 1].id);
        } else if (poolPage > 1) {
          // 当前页扫到顶部，跨页拉取上一页末条
          const prevPage = poolPage - 1;
          try {
            const parsed = await fetchPoolPage(prevPage);
            if (!parsed) return;
            skipPoolEffectPage.current = prevPage;
            setPoolPage(prevPage);
            if (parsed.items.length > 0) {
              setInspectTopicId(parsed.items[parsed.items.length - 1].id);
            }
          } catch {
            showToast("加载上一页选题失败", "error");
          }
        }
      }
    },
    [
      inspectTopicId,
      poolItems,
      poolPage,
      totalPages,
      fetchPoolPage,
    ],
  );

  if (membershipRequired) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-card-ring">
          <h3 className="mb-2 text-lg font-medium text-[#1C1917]">
            请先申请加入团队
          </h3>
          <p className="mb-6 text-sm leading-relaxed text-[#78716C]">
            当前账号还没有有效团队归属，选题库和创作协作暂不可用。
          </p>
          <a
            href="/dashboard"
            className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-[#D97757] hover:bg-[#C46A4D] px-5 text-sm font-medium text-white shadow-xs transition-all active:scale-[0.99] active:duration-120 cursor-pointer"
          >
            去工作台申请加入团队
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-dvh text-[#292524] py-1 sm:py-2 font-sans">
      <div className="max-w-[1560px] mx-auto space-y-6">
        {/* 全局顶栏：黄金大标题 Header (原版人文手稿装帧) */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 pb-2.5 pt-1">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="size-9 sm:size-9.5 rounded-xl bg-[#F1F1F0] border border-[#E2E2DF]/60 flex items-center justify-center text-[#D97757] shadow-2xs shrink-0">
              <CompassConstellationIllustration size={22} />
            </div>
            <div className="space-y-0.5 sm:space-y-1">
              <h1 className="font-serif text-xl sm:text-2xl font-[580] text-[#1C1917] tracking-tighter">
                灵感手稿 · 选题库
              </h1>
              <p className="text-[12px] sm:text-[13px] text-[#78716C] font-normal leading-relaxed">
                选定后在飞书创作，数据为内容立卷
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#F1F1F0] text-[11px] sm:text-[12px] font-medium text-[#57534E]">
              <span className="size-1.5 rounded-full bg-[#6FAA7D]" />
              <span>八大母题体系</span>
            </span>
            <button
              type="button"
              onClick={() => void refreshAll()}
              title="刷新大盘数据"
              className="p-2 sm:p-1.5 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center rounded-lg text-[#78716C] hover:text-[#1C1917] hover:bg-[#EBEBE9] transition-colors cursor-pointer"
              aria-label="刷新大盘数据"
            >
              <RefreshCw
                className={`size-3.5 ${
                  activeLoading || poolLoading ? "animate-spin text-[#D97757]" : ""
                }`}
              />
            </button>
          </div>
        </header>

        {/* 顶部大盘动态看板 */}
        <TeamActivitySection
          data={activeTopics}
          loading={activeLoading}
          error={activeError}
          onRetry={fetchActiveData}
          onSelectTopic={(topicId) => {
            setInspectTopicId(topicId);
          }}
        />

        {/* 选题库大盘主体 */}
        <TopicPoolExplorer
          items={resolvedPoolItems}
          topics={topicsOptions}
          loading={poolLoading}
          error={poolError}
          totalCount={poolTotalCount}
          searchQuery={poolSearchQuery}
          currentPage={poolPage}
          currentView={poolView}
          currentTimeRange={poolTimeRange}
          selectedTopicIds={selectedTopicIds}
          moreFilters={moreFilters}
          sortBy={sortBy}
          onCreateClick={() => setIsCreateModalOpen(true)}
          onPageChange={(p) => {
            beginPoolQueryChange();
            setPoolPage(p);
          }}
          onViewChange={(v) => {
            beginPoolQueryChange();
            setPoolPage(1);
            setPoolView(v);
          }}
          onTimeRangeChange={(t) => {
            beginPoolQueryChange();
            setPoolPage(1);
            setPoolTimeRange(t);
          }}
          onTopicIdsChange={(ids) => {
            beginPoolQueryChange();
            setPoolPage(1);
            setSelectedTopicIds(ids);
          }}
          onMoreFiltersChange={(f) => {
            beginPoolQueryChange();
            setPoolPage(1);
            setMoreFilters(f);
          }}
          onOpenMoreFilters={() => setIsMoreFiltersOpen(true)}
          onSortByChange={(s) => {
            beginPoolQueryChange();
            setPoolPage(1);
            setSortBy(s);
          }}
          onSearchQueryChange={(q) => {
            if (q.trim() !== debouncedPoolSearchQuery) beginPoolQueryChange();
            else setPoolLoading(false);
            setPoolSearchQuery(q);
          }}
          onRetry={() => void refreshAll()}
          onGoToFeishu={(topic) => void handleGoToFeishu(topic)}
          onSelectTopic={(subTopicId) => setInspectTopicId(subTopicId)}
        />
      </div>

      {/* 动态懒加载：选题详情抽屉 */}
      {inspectTopicId && (
        <TopicWorkBreakdownDrawer
          key={inspectTopicId}
          subTopicId={inspectTopicId}
          initialSubTopic={
            (resolvedPoolItems.find((item) => item.id === inspectTopicId) as unknown as SubTopicItem) ?? null
          }
          isWritingByCurrentUser={Boolean(
            resolvedPoolItems.find((item) => item.id === inspectTopicId)?.isWritingByMe ||
              writingTopicIds.has(inspectTopicId),
          )}
          hasPrevTopic={hasPrevTopic}
          hasNextTopic={hasNextTopic}
          onNavigateTopic={handleNavigateTopic}
          currentTopicIndex={
            currentInspectIndex >= 0
              ? (poolPage - 1) * 50 + currentInspectIndex
              : undefined
          }
          totalTopicsCount={poolTotalCount > 0 ? poolTotalCount : poolItems.length}
          onClose={() => {
            setInspectTopicId(null);
            // 深链打开的抽屉关闭后清理 URL，避免刷新重复弹出
            if (typeof window !== "undefined" && window.location.search.includes("topic_id=")) {
              window.history.replaceState({}, "", "/topics");
            }
          }}
          onGoToFeishu={(subTopic) => void handleGoToFeishu(subTopic)}
          currentUserId={currentUserId}
          canManageTopicLibrary={canManageTopicLibrary}
          onSubTopicUpdated={(updated) => {
            setPoolItems((prev) =>
              prev.map((item) =>
                item.id === updated.id
                  ? {
                      ...item,
                      title: updated.title,
                      hook: updated.hook,
                      emotion_tag: updated.emotion_tag,
                      audience: updated.audience,
                    }
                  : item,
              ),
            );
          }}
          onSubTopicRemoved={(removedId) => {
            setPoolItems((prev) => prev.filter((item) => item.id !== removedId));
            setPoolTotalCount((count) => Math.max(0, count - 1));
            setInspectTopicId(null);
          }}
        />
      )}

      {/* 动态懒加载：“更多”高级筛选抽屉 */}
      {isMoreFiltersOpen && (
        <TopicMoreFiltersDrawer
          isOpen={isMoreFiltersOpen}
          filters={moreFilters}
          onChange={(newFilters) => {
            beginPoolQueryChange();
            setPoolPage(1);
            setMoreFilters(newFilters);
          }}
          onClose={() => setIsMoreFiltersOpen(false)}
        />
      )}

      {/* 动态懒加载：录入选题与批量导入统一中枢 Modal */}
      {isCreateModalOpen && (
        <TopicCreateModal
          isOpen={isCreateModalOpen}
          topics={topicsOptions}
          topicsError={topicsOptionsError}
          canManageTopicLibrary={canManageTopicLibrary}
          onParseFile={handleParseImportFile}
          onConfirmImport={handleConfirmImport}
          onClose={() => setIsCreateModalOpen(false)}
          onSuccess={async () => {
            await refreshAll();
            showToast("选题已成功入卷", "success");
          }}
        />
      )}

    </div>
  );
}
