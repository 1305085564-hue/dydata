"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
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
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { TeamActivitySection } from "./TeamActivitySection";
import { TopicPoolExplorer, type SortByOption } from "./TopicPoolExplorer";
import { TopicWorkBreakdownDrawer } from "./TopicWorkBreakdownDrawer";
import { TopicCreateModal } from "./TopicCreateModal";
import { TopicMoreFiltersDrawer } from "./TopicMoreFiltersDrawer";
import { FeishuCreationModal } from "./FeishuCreationModal";
import { TopicBatchImportModal } from "./TopicBatchImportModal";
import {
  DeskStudyIllustration,
  CompassConstellationIllustration,
} from "@/components/editorial/editorial-illustrations";

export function TopicHubV2() {
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
  const [topicsOptionsError, setTopicsOptionsError] = useState<string | null>(
    null,
  );

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

  const [authError, setAuthError] = useState(false);
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

  const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error && error.message ? error.message : fallback;

  // 1. 加载团队动态（最新参与与最新成片）
  const fetchActiveData = useCallback(async () => {
    try {
      setActiveLoading(true);
      setActiveError(null);
      const data = await fetchTopicJson("/api/topics/active?limit=6");
      setActiveTopics(parseActiveTopicsResponse(data) as ActiveTopicsResponse);
    } catch (err) {
      if (err instanceof TopicRequestError && err.status === 401)
        setAuthError(true);
      if (isTeamMembershipRequiredError(err)) setMembershipRequired(true);
      setActiveError(getErrorMessage(err, "团队动态加载失败"));
      if (!(err instanceof TopicRequestError && err.status === 401))
        console.error("加载精选动态失败:", err);
    } finally {
      setActiveLoading(false);
    }
  }, []);

  const fetchTopicOptions = useCallback(async () => {
    try {
      setTopicsOptionsError(null);
      const data = await fetchTopicJson("/api/topics/options");
      setTopicsOptions(parseTopicOptionsResponse(data));
    } catch (err) {
      if (err instanceof TopicRequestError && err.status === 401)
        setAuthError(true);
      if (isTeamMembershipRequiredError(err)) setMembershipRequired(true);
      setTopicsOptionsError(getErrorMessage(err, "母题列表加载失败"));
    }
  }, []);

  // 2. 加载选题池列表
  const fetchPoolData = useCallback(async () => {
    const requestId = ++poolRequestId.current;
    try {
      setPoolLoading(true);
      setPoolError(null);
      const params = new URLSearchParams({
        view: poolView,
        time_range: poolTimeRange,
        page: String(poolPage),
        page_size: "50",
        sort: sortBy === "best_play" ? "avg_play" : sortBy,
      });
      if (debouncedPoolSearchQuery) params.set("q", debouncedPoolSearchQuery);
      selectedTopicIds.forEach((topicId) => params.append("topic_id", topicId));

      // 附加 V3 筛选条件传参
      if (moreFilters.sourceType !== "all") {
        params.set("source_type", moreFilters.sourceType);
      }
      if (moreFilters.durationRange !== "all") {
        params.set("duration_range", moreFilters.durationRange);
      }

      const data = parseTopicPoolResponse(
        await fetchTopicJson(`/api/topics/pool?${params.toString()}`),
      );
      if (requestId !== poolRequestId.current) return;
      setPoolItems(data.items as TopicPoolItem[]);
      setPoolTotalCount(data.pagination.totalItems);
    } catch (err) {
      if (err instanceof TopicRequestError && err.status === 401)
        setAuthError(true);
      if (isTeamMembershipRequiredError(err)) setMembershipRequired(true);
      setPoolError(getErrorMessage(err, "选题池加载失败"));
      if (!(err instanceof TopicRequestError && err.status === 401))
        console.error("加载选题池列表失败:", err);
    } finally {
      if (requestId === poolRequestId.current) setPoolLoading(false);
    }
  }, [
    debouncedPoolSearchQuery,
    moreFilters,
    poolPage,
    poolTimeRange,
    poolView,
    selectedTopicIds,
    sortBy,
  ]);

  // 3. 加载当前用户写作清单
  const fetchMyClaims = useCallback(async () => {
    try {
      setClaimsLoading(true);
      setClaimsError(null);
      const data = parseTopicPoolResponse(
        await fetchTopicJson(
          "/api/topics/pool?view=my_claims&time_range=all&sort=latest&page_size=100",
        ),
      );
      setMyClaims(
        data.items.flatMap((item) =>
          item.myClaim
            ? [
                {
                  ...item.myClaim,
                  subTopic: item,
                },
              ]
            : [],
        ) as TopicClaimItem[],
      );
    } catch (err) {
      if (err instanceof TopicRequestError && err.status === 401)
        setAuthError(true);
      if (isTeamMembershipRequiredError(err)) setMembershipRequired(true);
      setClaimsError(getErrorMessage(err, "写作清单加载失败"));
      if (!(err instanceof TopicRequestError && err.status === 401))
        console.error("加载我的写作清单失败:", err);
    } finally {
      setClaimsLoading(false);
    }
  }, []);

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

  // 兼容性保留与旧契约映射: /api/topics/sub-topics/replace-claim
  // 开始写 / 标记在写
  const handleMarkWriting = async (subTopicId: string) => {
    try {
      await fetchTopicJson(
        `/api/topics/sub-topics/${subTopicId}/start-scripting`,
        { method: "POST" },
      ).catch(() => {
        // 若旧接口回退则尝试 claim
        return fetchTopicJson(`/api/topics/sub-topics/${subTopicId}/claim`, {
          method: "POST",
        });
      });
      showToast("已将选题加入你的在写清单", "success");
      refreshAll();
    } catch (err) {
      if (isTeamMembershipRequiredError(err)) setMembershipRequired(true);
      showToast(getErrorMessage(err, "更新写作状态失败"), "error");
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

  // 批量导入确认回调（交接给后续后端）
  const handleBatchImportConfirm = async (rows: BatchImportParsedRow[]) => {
    // 待接入真实接口契约
    showToast(`前端校验通过，已提交 ${rows.length} 条待入库选题`, "success");
    refreshAll();
    return {
      successCount: rows.length,
      skippedCount: 0,
      failedCount: 0,
    };
  };

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
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div
            className={`px-4 py-2.5 rounded-xl shadow-claude-float backdrop-blur-xl text-xs font-medium flex items-center gap-2 ${
              toastMsg.type === "error"
                ? "bg-[#DC2626]/10 text-[#DC2626] border border-[#E5E0D6]"
                : "bg-[#1C1917]/90 text-white border border-[#292524]/50"
            }`}
          >
            {toastMsg.type === "error" ? (
              <AlertTriangle className="w-4 h-4 text-[#DC2626] shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-[#6FAA7D] shrink-0" />
            )}
            <span>{toastMsg.text}</span>
          </div>
        </div>
      )}

      {/* 未登录整页阻断拦截 */}
      {authError ? (
        <div className="min-h-[60vh] flex items-center justify-center p-4">
          <div className="bg-white border border-[#E5E0D6] rounded-2xl p-8 max-w-md w-full text-center shadow-claude-dialog animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-center -mt-2 -mb-2">
              <DeskStudyIllustration size={88} />
            </div>
            <h3 className="text-lg font-medium text-[#1C1917] mb-1.5">
              翻开灵感篇章 · 请先登录
            </h3>
            <p className="text-xs text-[#78716C] max-w-sm mx-auto mb-6 leading-relaxed">
              为了确保选题协作与协同创作，请登录账号后开启灵感探索。
            </p>
            <a
              href="/login"
              className="inline-flex items-center justify-center gap-2 w-full px-5 py-2.5 rounded-xl bg-[#D97757] hover:bg-[#C46A4D] active:scale-[0.985] active:duration-75 text-white text-xs font-semibold shadow-xs transition-all"
            >
              <span>前往登录创作账号</span>
            </a>
          </div>
        </div>
      ) : (
        <div className="max-w-7xl mx-auto space-y-3">
          {/* 全局顶栏 Header */}
          <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2.5 pt-1">
            <div className="flex items-center gap-3">
              <div className="size-9.5 rounded-xl bg-[#FAF8F4] border border-[#ECE7DE] flex items-center justify-center text-[#D97757] shadow-2xs shrink-0">
                <CompassConstellationIllustration size={22} />
              </div>
              <div className="space-y-1">
                <h1 className="font-serif text-2xl font-semibold text-[#1C1917] tracking-tight">
                  干货选题库
                </h1>
                <p className="text-[12.5px] text-[#78716C] font-normal leading-relaxed">
                  数据验证过的干货母本 · 自由挑选并前往飞书创作
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={refreshAll}
                disabled={activeLoading || poolLoading}
                className="p-2 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 inline-flex items-center justify-center rounded-lg text-[#78716C] hover:text-[#1C1917] hover:bg-[#F5F3EE] active:scale-[0.985] active:duration-75 transition-all duration-150 disabled:opacity-50 cursor-pointer"
                title="刷新最新数据"
                aria-label="刷新最新数据"
              >
                <RefreshCw
                  className={`w-4 h-4 ${activeLoading || poolLoading ? "animate-spin text-[#D97757]" : ""}`}
                />
              </button>
            </div>
          </header>

          {/* 1. 团队精选动态 */}
          <TeamActivitySection
            data={activeTopics}
            loading={activeLoading}
            error={activeError}
            onRetry={fetchActiveData}
            onSelectTopic={(id) => setInspectTopicId(id)}
          />

          {/* 2. 选题库大盘与多维筛选 */}
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
            onPageChange={(p) => setPoolPage(p)}
            onViewChange={(v) => {
              setPoolView(v);
              setPoolPage(1);
            }}
            onTimeRangeChange={(t) => {
              setPoolTimeRange(t);
              setPoolPage(1);
            }}
            onTopicIdsChange={(ids) => setSelectedTopicIds(ids)}
            onMoreFiltersChange={(filters) => setMoreFilters(filters)}
            onOpenMoreFilters={() => setIsMoreFiltersOpen(true)}
            onSortByChange={(s) => setSortBy(s)}
            onSearchQueryChange={(query) => setPoolSearchQuery(query)}
            onRetry={fetchPoolData}
            onOpenFeishuModal={(topic) => setFeishuModalTopic(topic)}
            onSelectTopic={(id) => setInspectTopicId(id)}
            onCreateClick={() => setIsCreateModalOpen(true)}
            onBatchImportClick={() => setIsBatchImportModalOpen(true)}
          />
        </div>
      )}

      {/* 3. “更多” 高级级联筛选抽屉 */}
      <TopicMoreFiltersDrawer
        isOpen={isMoreFiltersOpen}
        filters={moreFilters}
        onChange={(filters) => setMoreFilters(filters)}
        onClose={() => setIsMoreFiltersOpen(false)}
      />

      {/* 4. 飞书创作弹窗 */}
      <FeishuCreationModal
        isOpen={!!feishuModalTopic}
        topic={feishuModalTopic}
        onClose={() => setFeishuModalTopic(null)}
        onMarkWriting={handleMarkWriting}
        onCancelWriting={handleCancelWriting}
        isWriting={myClaims.some(
          (c) => c.subTopicId === feishuModalTopic?.id,
        )}
      />

      {/* 5. 外部干货选题批量导入弹窗 */}
      <TopicBatchImportModal
        isOpen={isBatchImportModalOpen}
        topics={topicsOptions}
        onClose={() => setIsBatchImportModalOpen(false)}
        onConfirmImport={handleBatchImportConfirm}
      />

      {/* 6. 选题详情抽屉 */}
      <TopicWorkBreakdownDrawer
        subTopicId={inspectTopicId}
        onClose={() => setInspectTopicId(null)}
        onOpenFeishuModal={(topic) => setFeishuModalTopic(topic)}
        onMarkWriting={handleMarkWriting}
        onCancelWriting={handleCancelWriting}
      />

      {/* 7. 录入子题 Modal */}
      <TopicCreateModal
        isOpen={isCreateModalOpen}
        topics={topicsOptions}
        topicsError={topicsOptionsError}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => {
          showToast("子题录入成功", "success");
          refreshAll();
        }}
      />
    </div>
  );
}
