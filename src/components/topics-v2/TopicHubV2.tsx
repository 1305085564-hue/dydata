"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import type {
  ActiveTopicsResponse,
  TopicPoolItem,
  TopicClaimItem,
  TopicOption,
  TopicPoolView,
  TopicTimeRange,
} from "./types";
import {
  fetchTopicJson,
  parseActiveTopicsResponse,
  parseTopicOptionsResponse,
  parseTopicPoolResponse,
  TopicRequestError,
} from "@/lib/topics/v2-client-contract";
import { RefreshCw, Lock, CheckCircle2, AlertTriangle } from "lucide-react";
import { TodayFocusSection } from "./TodayFocusSection";
import { MyClaimDrawer } from "./MyClaimDrawer";
import { TopicPoolExplorer, type SortByOption } from "./TopicPoolExplorer";
import { TopicComparisonMatrix } from "./TopicComparisonMatrix";
import { TopicWorkBreakdownDrawer } from "./TopicWorkBreakdownDrawer";
import { TopicCreateModal } from "./TopicCreateModal";
import { SmartReplaceModal } from "./SmartReplaceModal";

export function TopicHubV2() {
  // Toast 反馈
  const [toastMsg, setToastMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToastMsg({ text, type });
    setTimeout(() => {
      setToastMsg((prev) => (prev?.text === text ? null : prev));
    }, 3000);
  };

  // 全局数据状态
  const [activeTopics, setActiveTopics] = useState<ActiveTopicsResponse | null>(null);
  const [activeLoading, setActiveLoading] = useState(true);
  const [activeError, setActiveError] = useState<string | null>(null);

  const [myClaims, setMyClaims] = useState<TopicClaimItem[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(true);
  const [claimsError, setClaimsError] = useState<string | null>(null);

  const [poolItems, setPoolItems] = useState<TopicPoolItem[]>([]);
  const [poolLoading, setPoolLoading] = useState(true);
  const [poolError, setPoolError] = useState<string | null>(null);
  const [poolTotalCount, setPoolTotalCount] = useState(0);

  const [topicsOptions, setTopicsOptions] = useState<TopicOption[]>([]);
  const [topicsOptionsError, setTopicsOptionsError] = useState<string | null>(null);

  // 选题池 Query & 排序筛选选项
  const [poolView, setPoolView] = useState<TopicPoolView>("all");
  const [poolTimeRange, setPoolTimeRange] = useState<TopicTimeRange>("all");
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortByOption>("latest");
  const [poolSearchQuery, setPoolSearchQuery] = useState("");
  const [debouncedPoolSearchQuery, setDebouncedPoolSearchQuery] = useState("");
  const [poolPage, setPoolPage] = useState(1);

  // 抽屉与 Modal 控制
  const [inspectTopicId, setInspectTopicId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // 满额智能替换弹窗控制
  const [replaceTargetTopic, setReplaceTargetTopic] = useState<{
    id: string;
    title: string;
    hook: string;
  } | null>(null);

  const [authError, setAuthError] = useState(false);
  const poolRequestId = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedPoolSearchQuery(poolSearchQuery.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [poolSearchQuery]);

  useEffect(() => {
    setPoolPage(1);
  }, [debouncedPoolSearchQuery, selectedTopicIds, sortBy, poolView, poolTimeRange]);

  const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error && error.message ? error.message : fallback;

  // 1. 加载今日聚焦与团队动态
  const fetchActiveData = useCallback(async () => {
    try {
      setActiveLoading(true);
      setActiveError(null);
      const data = await fetchTopicJson("/api/topics/active?limit=8");
      setActiveTopics(parseActiveTopicsResponse(data) as ActiveTopicsResponse);
    } catch (err) {
      if (err instanceof TopicRequestError && err.status === 401) setAuthError(true);
      setActiveError(getErrorMessage(err, "今日聚焦加载失败"));
      if (!(err instanceof TopicRequestError && err.status === 401)) console.error("加载今日精选失败:", err);
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
      if (err instanceof TopicRequestError && err.status === 401) setAuthError(true);
      setTopicsOptionsError(getErrorMessage(err, "母题列表加载失败"));
    }
  }, []);

  // 2. 加载完整结果集中的选题池页
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
        sort: sortBy,
      });
      if (debouncedPoolSearchQuery) params.set("q", debouncedPoolSearchQuery);
      selectedTopicIds.forEach((topicId) => params.append("topic_id", topicId));

      const data = parseTopicPoolResponse(await fetchTopicJson(`/api/topics/pool?${params.toString()}`));
      if (requestId !== poolRequestId.current) return;
      setPoolItems(data.items as TopicPoolItem[]);
      setPoolTotalCount(data.pagination.totalItems);
    } catch (err) {
      if (err instanceof TopicRequestError && err.status === 401) setAuthError(true);
      setPoolError(getErrorMessage(err, "选题池加载失败"));
      if (!(err instanceof TopicRequestError && err.status === 401)) console.error("加载选题池列表失败:", err);
    } finally {
      if (requestId === poolRequestId.current) setPoolLoading(false);
    }
  }, [debouncedPoolSearchQuery, poolPage, poolTimeRange, poolView, selectedTopicIds, sortBy]);

  // 3. 我的认领也只从后端明确返回的 myClaim 构造
  const fetchMyClaims = useCallback(async () => {
    try {
      setClaimsLoading(true);
      setClaimsError(null);
      const data = parseTopicPoolResponse(await fetchTopicJson("/api/topics/pool?view=my_claims&time_range=all&sort=latest&page_size=100"));
      setMyClaims(data.items.flatMap((item) => item.myClaim ? [{
        ...item.myClaim,
        subTopic: item,
      }] : []) as TopicClaimItem[]);
    } catch (err) {
      if (err instanceof TopicRequestError && err.status === 401) setAuthError(true);
      setClaimsError(getErrorMessage(err, "我的认领加载失败"));
      if (!(err instanceof TopicRequestError && err.status === 401)) console.error("加载我的认领失败:", err);
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

  // 认领子题 (若满 5 条自动唤起智能替换弹窗)
  const handleClaim = async (subTopicId: string) => {
    const candidateClaims = myClaims.filter((c) => c.status === "candidate");

    // 从已有 items 中找到该子题 title / hook
    const foundItem = poolItems.find((item) => item.id === subTopicId);
    const subObj = foundItem;

    if (candidateClaims.length >= 5) {
      // 唤起智能替换弹窗！
      setReplaceTargetTopic({
        id: subTopicId,
        title: subObj?.title || "所选选题",
        hook: subObj?.hook || "",
      });
      return;
    }

    try {
      try {
        await fetchTopicJson(`/api/topics/sub-topics/${subTopicId}/claim`, { method: "POST" });
      } catch (error) {
        if (error instanceof TopicRequestError && error.status === 409) {
          setReplaceTargetTopic({
            id: subTopicId,
            title: subObj?.title || "所选选题",
            hook: subObj?.hook || "",
          });
          return;
        }
        throw error;
      }

      showToast("已成功认领到您的个人候选", "success");
      refreshAll();
    } catch (err) {
      showToast(getErrorMessage(err, "认领请求失败"), "error");
    }
  };

  // 确认智能替换认领
  const handleConfirmReplace = async (returnedSubTopicId: string, targetSubTopicId: string) => {
    try {
      await fetchTopicJson("/api/topics/sub-topics/replace-claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          returned_sub_topic_id: returnedSubTopicId,
          target_sub_topic_id: targetSubTopicId,
        }),
      });

      showToast("已成功自动替换并完成新选题认领！", "success");
      refreshAll();
      return true;
    } catch (err) {
      showToast(getErrorMessage(err, "替换请求异常"), "error");
      return false;
    }
  };

  // 开始写脚本
  const handleStartScripting = async (subTopicId: string) => {
    try {
      await fetchTopicJson(`/api/topics/sub-topics/${subTopicId}/start-scripting`, { method: "POST" });
      showToast("选题状态已更新为: 脚本撰写中", "success");
      refreshAll();
    } catch (err) {
      showToast(getErrorMessage(err, "切换状态失败"), "error");
    }
  };

  // 归还认领
  const handleReturnClaim = async (subTopicId: string) => {
    try {
      await fetchTopicJson(`/api/topics/sub-topics/${subTopicId}/return`, { method: "POST" });
      showToast("已释放该选题，槽位已空出", "success");
      refreshAll();
    } catch (err) {
      showToast(getErrorMessage(err, "归还请求失败"), "error");
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-800 p-4 sm:p-6 lg:p-8 font-sans antialiased">
      {/* Toast 轻提示 (z-[70] 层级高于所有抽屉弹窗) */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div
            className={`px-4 py-2.5 rounded-xl shadow-xl backdrop-blur-xl text-xs font-medium flex items-center gap-2 ${
              toastMsg.type === "error"
                ? "bg-rose-900/90 text-rose-100 border border-rose-700/50"
                : "bg-zinc-900/90 text-white border border-zinc-700/50"
            }`}
          >
            {toastMsg.type === "error" ? (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span>{toastMsg.text}</span>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto space-y-8">
        {/* 未登录拦截 Banner */}
        {authError && (
          <div className="bg-amber-50/90 border border-amber-200/90 rounded-2xl p-6 text-center shadow-xs">
            <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center mx-auto mb-3">
              <Lock className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-zinc-900 mb-1">
              需要登录后再体验选题库
            </h3>
            <p className="text-xs text-zinc-500 max-w-md mx-auto mb-4">
              为了确保选题防撞车、认领权限与数据隔离，请先登录系统账号后再访问选题指挥舱。
            </p>
            <a
              href="/login"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#D97757] hover:bg-[#C46A4D] active:scale-[0.97] text-white text-xs font-semibold shadow-xs transition-all"
            >
              前往登录账号
            </a>
          </div>
        )}

        {/* 全局顶栏 */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200/80">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-500 mb-1">
              <span>选题库</span>
              <span>/</span>
              <span className="text-[#5F82A8] font-semibold">选题指挥舱 Topic Hub V2</span>
            </div>
            <h1 className="text-2xl font-semibold text-zinc-900 tracking-tight">
              爆款选题指挥舱
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {/* 我的认领位抽屉 */}
            <MyClaimDrawer
              claims={myClaims}
              loading={claimsLoading}
              error={claimsError}
              onRetry={fetchMyClaims}
              onStartScripting={handleStartScripting}
              onReturnClaim={handleReturnClaim}
              onSelectTopic={(id) => setInspectTopicId(id)}
            />

            <button
              type="button"
              onClick={refreshAll}
              className="p-2 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 active:scale-[0.97] text-zinc-600 hover:text-zinc-900 transition-all shadow-2xs"
              title="刷新最新数据"
              aria-label="刷新最新数据"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* 1. 第一优先级：今日最值得写的选题 */}
        <TodayFocusSection
          data={activeTopics}
          loading={activeLoading}
          error={activeError}
          onClaim={handleClaim}
          onRetry={fetchActiveData}
          onSelectTopic={(id) => setInspectTopicId(id)}
        />

        {/* 2. 主主体：选题大盘多维排序与母题多选筛选 */}
        <TopicPoolExplorer
          items={poolItems}
          topics={topicsOptions}
          loading={poolLoading}
          error={poolError}
          totalCount={poolTotalCount}
          searchQuery={poolSearchQuery}
          onRetry={fetchPoolData}
          currentPage={poolPage}
          currentView={poolView}
          currentTimeRange={poolTimeRange}
          selectedTopicIds={selectedTopicIds}
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
          onSortByChange={(s) => setSortBy(s)}
          onSearchQueryChange={(query) => setPoolSearchQuery(query)}
          onClaim={handleClaim}
          onReturnClaim={handleReturnClaim}
          onSelectTopic={(id) => setInspectTopicId(id)}
          onCreateClick={() => setIsCreateModalOpen(true)}
        />

        {/* 3. 选题效果横向对比 */}
        <TopicComparisonMatrix topics={topicsOptions} topicsError={topicsOptionsError} />
      </div>

      {/* 4. 爆款剖析侧滑抽屉 */}
      <TopicWorkBreakdownDrawer
        subTopicId={inspectTopicId}
        onClose={() => setInspectTopicId(null)}
        onClaim={handleClaim}
        onStartScripting={handleStartScripting}
        onReturnClaim={handleReturnClaim}
      />

      {/* 5. 新增子题 Modal */}
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

      {/* 6. 满额智能替换弹窗 */}
      <SmartReplaceModal
        isOpen={!!replaceTargetTopic}
        targetTopic={replaceTargetTopic}
        myClaims={myClaims}
        onClose={() => setReplaceTargetTopic(null)}
        onConfirmReplace={handleConfirmReplace}
      />
    </div>
  );
}
