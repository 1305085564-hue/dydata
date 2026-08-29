"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import type {
  ActiveTopicsResponse,
  TopicPoolItem,
  TopicClaimItem,
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
  parseTopicOptionsResponse,
  parseTopicPoolResponse,
  isTeamMembershipRequiredError,
  TopicRequestError,
} from "@/lib/topics/v2-client-contract";
import {
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
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
}: {
  canManageTopicLibrary?: boolean;
  feishuWorkspaceUrl?: string | null;
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
    null,
  );
  const [activeLoading, setActiveLoading] = useState(true);
  const [activeError, setActiveError] = useState<string | null>(null);

  const [myClaims, setMyClaims] = useState<TopicClaimItem[]>([]);
  const [, setClaimsLoading] = useState(true);
  const [, setClaimsError] = useState<string | null>(null);

  const [poolItems, setPoolItems] = useState<TopicPoolItem[]>([]);
  const [poolLoading, setPoolLoading] = useState(true);
  const [poolError, setPoolError] = useState<string | null>(null);
  const [poolTotalCount, setPoolTotalCount] = useState(0);

  const [topicsOptions, setTopicsOptions] = useState<TopicOption[]>([]);
  const [, setTopicsOptionsError] = useState<string | null>(null);

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

  // 1. 获取母题列表
  const fetchTopicOptions = useCallback(async () => {
    setTopicsOptionsError(null);
    try {
      const data = await fetchTopicJson("/api/topics/options");
      const parsed = parseTopicOptionsResponse(data);
      setTopicsOptions(parsed);
    } catch (err) {
      if (isTeamMembershipRequiredError(err)) {
        setMembershipRequired(true);
        return;
      }
      setTopicsOptionsError(getErrorMessage(err, "获取母题选项失败"));
    }
  }, []);

  // 2. 获取大盘活跃数据
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

  // 3. 获取我的认领状态列表
  const fetchMyClaims = useCallback(async () => {
    setClaimsLoading(true);
    setClaimsError(null);
    try {
      const data = (await fetchTopicJson(
        "/api/topics/pool?view=my_claims",
      )) as { items?: unknown[] };
      setMyClaims((data.items || []) as TopicClaimItem[]);
    } catch (err) {
      if (isTeamMembershipRequiredError(err)) {
        setMembershipRequired(true);
        return;
      }
      setClaimsError(getErrorMessage(err, "获取写作状态失败"));
    } finally {
      setClaimsLoading(false);
    }
  }, []);

  // 4. 获取选题池列表
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

  // 初始化加载
  useEffect(() => {
    fetchActiveData();
    fetchMyClaims();
    fetchTopicOptions();
  }, [fetchActiveData, fetchMyClaims, fetchTopicOptions]);

  useEffect(() => {
    fetchPoolData();
  }, [fetchPoolData]);

  // 刷新全量数据
  const refreshAll = () => {
    fetchActiveData();
    fetchMyClaims();
    fetchTopicOptions();
    fetchPoolData();
  };

  // 兼容性保留与旧契约映射已废除：V3 不再有 replace-claim / 候选位 / 撞车阻断
  // 开始写作（幂等；等待结果，失败返回 false，不显示成功）
  const handleMarkWriting = async (subTopicId: string): Promise<boolean> => {
    try {
      await fetchTopicJson(
        `/api/topics/sub-topics/${subTopicId}/start-scripting`,
        { method: "POST" },
      );
      showToast("已将选题加入在写清单", "success");
      refreshAll();
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
      showToast("已取消写作状态", "success");
      refreshAll();
    } catch (err) {
      if (isTeamMembershipRequiredError(err)) setMembershipRequired(true);
      showToast(getErrorMessage(err, "取消写作失败"), "error");
    }
  };

  // 当前弹窗选题的真实「我在写」状态（来自 my_claims 服务端数据，不做本地伪装）
  const isWritingSelected = feishuModalTopic
    ? myClaims.some((item) => {
      const claim = (item as { myClaim?: { status?: string; subTopicId?: string } }).myClaim;
      const subTopicId = claim?.subTopicId ?? (item as { id?: string }).id ?? (item as { subTopicId?: string }).subTopicId;
      return subTopicId === feishuModalTopic.id && claim?.status === "writing";
    })
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

  const handleConfirmImport = useCallback(async (rows: BatchImportParsedRow[]) => {
    const res = await fetch("/api/admin/topics-library/import/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    });
    const payload = (await res.json().catch(() => null)) as
      | { error?: string; successCount?: number; skippedCount?: number; failedCount?: number; errors?: Array<{ rowNumber: number; title: string; reason: string }> }
      | null;
    if (!res.ok || !payload) {
      throw new Error(payload?.error || "导入执行失败，请稍后重试");
    }
    if ((payload.successCount ?? 0) > 0) {
      refreshAll();
    }
    return {
      successCount: payload.successCount ?? 0,
      skippedCount: payload.skippedCount ?? 0,
      failedCount: payload.failedCount ?? 0,
      errors: payload.errors ?? [],
    };
  }, []);

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
    <div className="min-h-screen bg-[#FBF9F5] text-[#292524] px-0 py-1 sm:p-6 lg:p-8 font-sans antialiased">
      {/* Toast 轻提示 (z-[70] 层级) */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-[95] animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-medium shadow-claude-dialog ${
              toastMsg.type === "success"
                ? "bg-[#1C1917] text-white"
                : "bg-[#DC2626] text-white"
            }`}
          >
            {toastMsg.type === "success" ? (
              <CheckCircle2 className="size-4 text-[#6FAA7D]" />
            ) : (
              <AlertTriangle className="size-4 text-[#FAF8F4]" />
            )}
            <span>{toastMsg.text}</span>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto space-y-6">
        {/* 页头区 */}
        <header className="space-y-1">
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1917]">
                干货选题库
              </h1>
              <p className="text-xs sm:text-sm text-[#78716C] mt-1 font-normal leading-relaxed">
                沉淀团队内部验证（≥3万播放）与外部收集干货 · 支持多人协同创作
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#F5F3EE] text-[11.5px] font-medium text-[#57534E]">
                <span className="size-1.5 rounded-full bg-[#6FAA7D]" />
                <span>八大母题体系</span>
              </span>
            </div>
          </div>
        </header>

        {/* 顶部大盘动态看板 */}
        <TeamActivitySection
          data={activeTopics}
          loading={activeLoading}
          error={activeError}
          onRetry={fetchActiveData}
          onSelectTopic={(topicId) => {
            setSelectedTopicIds([topicId]);
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
          isAdmin={canManageTopicLibrary}
          onBatchImportClick={
            canManageTopicLibrary ? () => setIsBatchImportModalOpen(true) : undefined
          }
          onPageChange={(p) => setPoolPage(p)}
          onViewChange={(v) => setPoolView(v)}
          onTimeRangeChange={(t) => setPoolTimeRange(t)}
          onTopicIdsChange={(ids) => setSelectedTopicIds(ids)}
          onMoreFiltersChange={(f) => setMoreFilters(f)}
          onOpenMoreFilters={() => setIsMoreFiltersOpen(true)}
          onSortByChange={(s) => setSortBy(s)}
          onSearchQueryChange={(q) => setPoolSearchQuery(q)}
          onRetry={refreshAll}
          onOpenFeishuModal={(topic) => {
            setFeishuModalTopic({
              id: topic.id,
              title: topic.title,
              hook: topic.hook,
              outline: topic.outline,
              topic_id: topic.topic_id,
              topics: topic.topics,
              target_audience: (
                topic as unknown as { target_audience?: unknown }
              ).target_audience,
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
          topics={topicsOptions}
          onClose={() => setIsBatchImportModalOpen(false)}
          onParseFile={handleParseImportFile}
          onConfirmImport={handleConfirmImport}
        />
      )}

      {/* 动态懒加载：创建选题 Modal */}
      {isCreateModalOpen && (
        <TopicCreateModal
          isOpen={isCreateModalOpen}
          topics={topicsOptions}
          onClose={() => setIsCreateModalOpen(false)}
          onSuccess={() => {
            setIsCreateModalOpen(false);
            showToast("干货选题录入成功", "success");
            refreshAll();
          }}
        />
      )}
    </div>
  );
}
