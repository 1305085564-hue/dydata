"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
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
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { CompassConstellationIllustration } from "@/components/editorial/editorial-illustrations";
import { TeamActivitySection } from "./TeamActivitySection";
import { TopicPoolExplorer, type SortByOption } from "./TopicPoolExplorer";

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

const FeishuCreationModal = dynamic(
  () =>
    import("./FeishuCreationModal").then((mod) => mod.FeishuCreationModal),
  { ssr: false },
);

const TopicBatchImportModal = dynamic(
  () =>
    import("./TopicBatchImportModal").then((mod) => mod.TopicBatchImportModal),
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
}: {
  canManageTopicLibrary?: boolean;
  feishuWorkspaceUrl?: string | null;
  initialBootstrapData?: V2TopicLibraryBootstrap | null;
}) {
  // Toast 轻反馈
  const [toastMsg, setToastMsg] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMsg({ text, type });
    toastTimerRef.current = setTimeout(() => {
      setToastMsg(null);
    }, 3000);
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

  // 抽屉与 Modal 控制
  const [inspectTopicId, setInspectTopicId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isBatchImportModalOpen, setIsBatchImportModalOpen] = useState(false);

  // 飞书创作弹窗控制
  const [feishuModalTopic, setFeishuModalTopic] =
    useState<SubTopicItem | null>(null);

  const [, setAuthError] = useState(false);
  const [membershipRequired, setMembershipRequired] = useState(false);
  const poolRequestId = useRef(0);
  const [writingTopicIds, setWritingTopicIds] = useState<Set<string>>(
    () => new Set(initialBootstrapData?.myWritingTopicIds ?? []),
  );
  const bootstrapRequestRef = useRef<Promise<void> | null>(null);
  const previousPoolQueryKey = useRef<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedPoolSearchQuery(poolSearchQuery.trim()),
      300,
    );
    return () => window.clearTimeout(timer);
  }, [poolSearchQuery]);

  useEffect(() => {
    setPoolPage(1);
  }, [
    debouncedPoolSearchQuery,
    selectedTopicIds,
    sortBy,
    poolView,
    poolTimeRange,
    moreFilters,
  ]);

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
  const fetchPoolData = useCallback(async () => {
    const requestId = ++poolRequestId.current;
    setPoolLoading(true);
    setPoolError(null);

    const params = new URLSearchParams();
    params.set("page", poolPage.toString());
    params.set("page_size", "50");
    if (poolView !== "all") params.set("view", poolView);
    if (sortBy !== "latest") params.set("sort", sortBy);
    if (debouncedPoolSearchQuery) params.set("q", debouncedPoolSearchQuery);
    if (poolTimeRange !== "all") params.set("time_range", poolTimeRange);

    // 多母题筛选：逐个 topic_id 参数发送，与服务端 getAll("topic_id") 契约一致
    for (const topicId of selectedTopicIds) {
      params.append("topic_id", topicId);
    }
    // 「更多」高级筛选：全部真实进入请求并由服务端执行
    if (moreFilters.sourceType !== "all") params.set("source_type", moreFilters.sourceType);
    if (moreFilters.recentHeat !== "all") params.set("recent_heat", moreFilters.recentHeat);
    if (moreFilters.durationRange !== "all") params.set("duration_range", moreFilters.durationRange);
    if (moreFilters.performanceTier !== "all") params.set("performance", moreFilters.performanceTier);

    try {
      const data = await fetchTopicJson(`/api/topics/pool?${params.toString()}`);
      if (requestId !== poolRequestId.current) return;
      const parsed = parseTopicPoolResponse(data);
      setPoolItems(parsed.items);
      setPoolTotalCount(parsed.pagination.totalItems);
    } catch (err) {
      if (requestId !== poolRequestId.current) return;
      if (isTeamMembershipRequiredError(err)) {
        setMembershipRequired(true);
        return;
      }
      setPoolError(getErrorMessage(err, "加载选题池失败"));
    } finally {
      if (requestId === poolRequestId.current) {
        setPoolLoading(false);
      }
    }
  }, [
    poolPage,
    poolView,
    sortBy,
    debouncedPoolSearchQuery,
    poolTimeRange,
    selectedTopicIds,
    moreFilters,
  ]);

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
    if (previousPoolQueryKey.current === null) {
      previousPoolQueryKey.current = poolQueryKey;
      return;
    }
    if (previousPoolQueryKey.current === poolQueryKey) return;
    previousPoolQueryKey.current = poolQueryKey;
    void fetchPoolData();
  }, [fetchPoolData, poolQueryKey]);

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
      showToast("已将选题加入在写清单", "success");
      await refreshAll();
      return true;
    } catch (err) {
      if (isTeamMembershipRequiredError(err)) setMembershipRequired(true);
      showToast(getErrorMessage(err, "更新写作状态失败"), "error");
      return false;
    }
  };

  // 取消写作
  const handleCancelWriting = async (subTopicId: string) => {
    try {
      await fetchTopicJson(`/api/topics/sub-topics/${subTopicId}/return`, {
        method: "POST",
      });
      setWritingTopicIds((current) => {
        const next = new Set(current);
        next.delete(subTopicId);
        return next;
      });
      showToast("已取消写作状态", "success");
      await refreshAll();
    } catch (err) {
      if (isTeamMembershipRequiredError(err)) setMembershipRequired(true);
      showToast(getErrorMessage(err, "取消写作失败"), "error");
    }
  };

  // 当前弹窗选题的真实「我在写」状态：首屏快照 + 成功写作动作共同维护。
  const isWritingSelected = feishuModalTopic
    ? feishuModalTopic.isWritingByMe === true
      || feishuModalTopic.myClaim?.status === "writing"
      || writingTopicIds.has(feishuModalTopic.id)
    : false;

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
    return {
      rows: rows.map((row) => ({
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
      })) as BatchImportParsedRow[],
      summary: payload.summary as BatchImportSummary,
    };
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

  if (membershipRequired) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-[#E5E0D6] bg-white p-8 text-center shadow-claude-dialog">
          <h3 className="mb-2 text-lg font-medium text-[#1C1917]">
            请先申请加入团队
          </h3>
          <p className="mb-6 text-sm leading-relaxed text-[#78716C]">
            当前账号还没有有效团队归属，选题库和创作协作暂不可用。
          </p>
          <a
            href="/dashboard"
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-[#D97757] px-5 py-2.5 text-xs font-semibold text-white"
          >
            去工作台申请加入团队
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FBF9F5] text-[#292524] px-3.5 py-2 sm:p-6 lg:p-8 font-sans antialiased">
      {/* Toast 轻提示 (z-[70] 层级) */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-[95] animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="flex items-center gap-2 rounded-xl bg-[#181715] px-4 py-2.5 text-xs font-medium text-[#FAF8F4] shadow-claude-dialog border border-[#292524]">
            {toastMsg.type === "success" ? (
              <CheckCircle2 className="size-4 text-[#6FAA7D]" />
            ) : (
              <AlertTriangle className="size-4 text-[#C0685C]" />
            )}
            <span>{toastMsg.text}</span>
          </div>
        </div>
      )}

      <div className="max-w-[1560px] mx-auto space-y-6">
        {/* 全局顶栏：黄金大标题 Header (原版人文手稿装帧) */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2.5 pt-1">
          <div className="flex items-center gap-3">
            <div className="size-9.5 rounded-xl bg-[#FAF8F4] border border-[#ECE7DE] flex items-center justify-center text-[#D97757] shadow-2xs shrink-0">
              <CompassConstellationIllustration size={22} />
            </div>
            <div className="space-y-1">
              <h1 className="font-serif text-2xl font-semibold text-[#1C1917] tracking-tighter">
                灵感手稿 · 选题库
              </h1>
              <p className="text-[12.5px] text-[#78716C] font-normal leading-relaxed">
                数据验证过的干货选题 · 选定后去飞书创作
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#F5F3EE] text-[11.5px] font-medium text-[#57534E]">
              <span className="size-1.5 rounded-full bg-[#6FAA7D]" />
              <span>八大母题体系</span>
            </span>
            <button
              type="button"
              onClick={() => void refreshAll()}
              title="刷新大盘数据"
              className="p-1.5 rounded-lg text-[#78716C] hover:text-[#1C1917] hover:bg-[#F5F3EE] transition-colors cursor-pointer"
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
          items={poolItems}
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
          onBatchImportClick={
            canManageTopicLibrary ? () => setIsBatchImportModalOpen(true) : undefined
          }
          onCreateClick={() => setIsCreateModalOpen(true)}
          onPageChange={(p) => setPoolPage(p)}
          onViewChange={(v) => setPoolView(v)}
          onTimeRangeChange={(t) => setPoolTimeRange(t)}
          onTopicIdsChange={(ids) => setSelectedTopicIds(ids)}
          onMoreFiltersChange={(f) => setMoreFilters(f)}
          onOpenMoreFilters={() => setIsMoreFiltersOpen(true)}
          onSortByChange={(s) => setSortBy(s)}
          onSearchQueryChange={(q) => setPoolSearchQuery(q)}
          onRetry={() => void refreshAll()}
          onOpenFeishuModal={(topic) => {
            setFeishuModalTopic({
              id: topic.id,
              title: topic.title,
              hook: topic.hook,
              outline: topic.outline,
              topic_id: topic.topic_id,
              topics: topic.topics,
              audience: topic.audience,
              source_type: topic.source_type,
              isWritingByMe: (topic as { isWritingByMe?: boolean }).isWritingByMe,
              summary: (topic as { summary?: SubTopicItem["summary"] }).summary ?? null,
            } as unknown as SubTopicItem);
          }}
          onSelectTopic={(subTopicId) => setInspectTopicId(subTopicId)}
        />
      </div>

      {/* 动态懒加载：选题详情抽屉 */}
      {inspectTopicId && (
        <TopicWorkBreakdownDrawer
          subTopicId={inspectTopicId}
          onClose={() => setInspectTopicId(null)}
          onOpenFeishuModal={(subTopic) => {
            setInspectTopicId(null);
            setFeishuModalTopic(subTopic);
          }}
          onMarkWriting={handleMarkWriting}
          onCancelWriting={handleCancelWriting}
        />
      )}

      {/* 动态懒加载：“更多”高级筛选抽屉 */}
      {isMoreFiltersOpen && (
        <TopicMoreFiltersDrawer
          isOpen={isMoreFiltersOpen}
          filters={moreFilters}
          onChange={(newFilters) => setMoreFilters(newFilters)}
          onClose={() => setIsMoreFiltersOpen(false)}
        />
      )}

      {/* 动态懒加载：飞书创作立卷与协同 Modal */}
      {feishuModalTopic && (
        <FeishuCreationModal
          isOpen={!!feishuModalTopic}
          topic={feishuModalTopic}
          feishuWorkspaceUrl={feishuWorkspaceUrl}
          isWriting={feishuModalTopic.isWritingByMe === true || isWritingSelected}
          onClose={() => setFeishuModalTopic(null)}
          onMarkWriting={handleMarkWriting}
          onCancelWriting={handleCancelWriting}
        />
      )}

      {/* 动态懒加载：外部干货批量导入 Modal（仅真实管理员可进入） */}
      {isBatchImportModalOpen && canManageTopicLibrary && (
        <TopicBatchImportModal
          isOpen={isBatchImportModalOpen}
          onClose={() => setIsBatchImportModalOpen(false)}
          onParseFile={handleParseImportFile}
          onConfirmImport={handleConfirmImport}
        />
      )}

      {/* 动态懒加载：页面内手动录入选题 Modal */}
      {isCreateModalOpen && (
        <TopicCreateModal
          isOpen={isCreateModalOpen}
          topics={topicsOptions}
          topicsError={topicsOptionsError}
          onClose={() => setIsCreateModalOpen(false)}
          onSuccess={async () => {
            await refreshAll();
            showToast("选题录入成功", "success");
          }}
        />
      )}

    </div>
  );
}
