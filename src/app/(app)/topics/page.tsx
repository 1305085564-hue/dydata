"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { SubTopicCard, type SubTopicItem, type SubTopicClaim } from "@/components/topics/sub-topic-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { triggerGlobalTopicCreate } from "@/components/topics/global-topic-create";
import {
  fetchTopicPoolResponse,
  resolvePageAfterLoad,
  getRecommendationKey,
  type RecommendationSuggestion,
  type RecommendationResponse,
  type ComparisonRow
} from "./topic-helpers";
import {
  Loader2,
  ChevronDown,
  ChevronUp,
  Compass,
  RefreshCw,
  Sparkles,
  BarChart3,
  ArrowRightLeft,
  Check,
  Plus,
  Info,
  Calendar,
  AlertTriangle,
  Film
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface TopicInfo {
  id: string;
  name: string;
  sort_order: number;
}

function getMyClaim(item: { sub_topic_claims?: SubTopicClaim[] | null }, currentUserId: string) {
  return item.sub_topic_claims?.find((c) => c.user_id === currentUserId && c.status !== "returned") ?? null;
}

function isClaimedByMe(item: { sub_topic_claims?: SubTopicClaim[] | null }, currentUserId: string) {
  return !!getMyClaim(item, currentUserId);
}

function countMyCandidates(items: Array<{ sub_topic_claims?: SubTopicClaim[] | null }>, currentUserId: string) {
  return items.filter((item) => getMyClaim(item, currentUserId)?.status === "candidate").length;
}

// 骨架屏组件
function TopicPoolSkeleton() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="animate-pulse space-y-4"
    >
      <div className="h-10 w-full rounded-xl bg-stone-200/60" />
      <div className="space-y-3">
        <div className="h-28 w-full rounded-xl bg-stone-200/50" />
        <div className="h-28 w-full rounded-xl bg-stone-200/50" />
        <div className="h-28 w-full rounded-xl bg-stone-200/50" />
      </div>
    </motion.div>
  );
}

export default function TopicPoolPage() {
  const [items, setItems] = useState<SubTopicItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [poolError, setPoolError] = useState<string | null>(null);
  const [topicsList, setTopicsList] = useState<TopicInfo[]>([]);
  const [topicsError, setTopicsError] = useState<string | null>(null);

  // 主页视图 Tab: "pool" 选题池 | "recommendations" 系统推荐 | "comparison" 横向对比
  const [activeTab, setActiveTab] = useState<"pool" | "comparison" | "recommendations">("pool");
  
  // 筛选状态
  const [currentView, setCurrentView] = useState<"all" | "my_claims" | "my_created">("all");
  const [selectedTopicId, setSelectedTopicId] = useState<string>("__all__");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  // 认领上限与替换弹窗 state
  const [myClaims, setMyClaims] = useState<SubTopicItem[]>([]);
  const [claimsError, setClaimsError] = useState<string | null>(null);
  const [replaceDialogOpen, setReplaceDialogOpen] = useState(false);
  const [targetClaimId, setTargetClaimId] = useState<string | null>(null);
  const [selectedReturnId, setSelectedReturnId] = useState<string | null>(null);
  const [isReplacing, setIsReplacing] = useState(false);

  // 折叠母题 ID 集合
  const [collapsedTopicIds, setCollapsedTopicIds] = useState<Set<string>>(new Set());
  const [currentUserId, setCurrentUserId] = useState<string>("");

  // 系统推荐 (Item 1, 2, 3, 4) state
  const [recData, setRecData] = useState<RecommendationResponse | null>(null);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [ignoredRecKeys, setIgnoredRecKeys] = useState<Set<string>>(new Set());
  const [adoptingRecKey, setAdoptingRecKey] = useState<string | null>(null);

  // 横向对比 (Item 5, 6, 7, 8) state
  const [comparisonDimension, setComparisonDimension] = useState<"topic" | "account">("topic");
  const [comparisonDays, setComparisonDays] = useState<number>(30); // 7, 14, 30 天
  const [comparisonTopicId, setComparisonTopicId] = useState<string>(""); // 账号维度下需选母题
  const [comparisonRows, setComparisonRows] = useState<ComparisonRow[]>([]);
  const [loadingComparison, setLoadingComparison] = useState(false);

  const pageSize = 50;

  useEffect(() => {
    const getUserId = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }
    };
    void getUserId();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const urlView = new URLSearchParams(window.location.search).get("view");
    if (urlView === "all" || urlView === "my_claims" || urlView === "my_created") {
      setCurrentView(urlView);
    }
  }, []);

  // 加载母题分类
  const fetchTopics = useCallback(async () => {
    setTopicsError(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("topics")
        .select("id, name, sort_order")
        .order("sort_order", { ascending: true });

      if (error) throw error;
      const list = (data ?? []) as TopicInfo[];
      setTopicsList(list);
      if (list.length > 0 && !comparisonTopicId) {
        setComparisonTopicId(list[0].id);
      }
    } catch (err) {
      console.error("加载母题过滤分类失败:", err);
      setTopicsList([]);
      setTopicsError(err instanceof Error ? err.message : "母题分类加载失败");
    }
  }, [comparisonTopicId]);

  useEffect(() => {
    void fetchTopics();
  }, [fetchTopics]);

  // 加载我的认领
  const fetchMyClaims = useCallback(async () => {
    setClaimsError(null);
    try {
      const json = await fetchTopicPoolResponse("/api/topics/pool?view=my_claims");
      setMyClaims(json.items || []);
    } catch (err) {
      console.error("我的认领状态拉取失败:", err);
      setMyClaims([]);
      setClaimsError(err instanceof Error ? err.message : "认领状态加载失败");
    }
  }, []);

  // 加载选题池列表
  const fetchPoolData = useCallback(async (page: number, append = false) => {
    if (page === 1) setLoading(true);
    else setLoadingMore(true);
    if (page === 1) setPoolError(null);

    try {
      const params = new URLSearchParams();
      params.append("view", currentView);
      params.append("time_range", "1m");
      params.append("page", String(page));
      params.append("page_size", String(pageSize));

      if (selectedTopicId !== "__all__") {
        params.append("topic_id", selectedTopicId);
      }

      const json = await fetchTopicPoolResponse(`/api/topics/pool?${params.toString()}`);

      if (append) {
        setItems((prev) => [...prev, ...(json.items || [])]);
      } else {
        setItems(json.items || []);
      }
      setTotalItems(json.pagination?.totalItems || 0);
      return true;
    } catch (err) {
      if (page === 1) {
        setItems([]);
        setPoolError(err instanceof Error ? err.message : "获取选题池数据失败");
      }
      feedbackToast.error("加载选题池列表失败", {
        details: err instanceof Error ? err.message : String(err)
      });
      return false;
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [currentView, selectedTopicId]);

  // 加载系统推荐 (Item 1, 3) -> 实际读取 suggestions, evidenceSummary, sampleCount, marketDate
  const fetchRecommendations = useCallback(async () => {
    setLoadingRecommendations(true);
    try {
      const res = await fetch("/api/topics/recommendations");
      if (!res.ok) throw new Error("获取系统推荐失败");
      const json = await res.json();
      setRecData({
        evidenceSummary: json.evidenceSummary || null,
        sampleCount: json.sampleCount ?? 0,
        marketDate: json.marketDate || null,
        suggestions: Array.isArray(json.suggestions) ? json.suggestions : []
      });
    } catch (err) {
      console.error("系统推荐拉取失败:", err);
      setRecData(null);
    } finally {
      setLoadingRecommendations(false);
    }
  }, []);

  // 加载横向对比 (Item 5, 6, 7) -> 读取 rows，传递 days，账号维度带 topicId
  const fetchComparison = useCallback(async () => {
    setLoadingComparison(true);
    try {
      const params = new URLSearchParams();
      params.append("dimension", comparisonDimension);
      params.append("days", String(comparisonDays));
      if (comparisonDimension === "account" && comparisonTopicId) {
        params.append("topicId", comparisonTopicId);
      }

      const res = await fetch(`/api/topics/comparison?${params.toString()}`);
      if (!res.ok) throw new Error("获取对比数据失败");
      const json = await res.json();
      setComparisonRows(json.rows || []);
    } catch (err) {
      console.error("对比数据获取失败:", err);
      setComparisonRows([]);
    } finally {
      setLoadingComparison(false);
    }
  }, [comparisonDimension, comparisonDays, comparisonTopicId]);

  const loadAll = useCallback(async () => {
    setCurrentPage(1);
    await Promise.all([
      fetchPoolData(1, false),
      fetchMyClaims(),
      fetchRecommendations(),
      fetchComparison()
    ]);
  }, [fetchMyClaims, fetchPoolData, fetchRecommendations, fetchComparison]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    const handleRefresh = () => {
      void loadAll();
    };
    window.addEventListener("refresh-topics", handleRefresh);
    return () => window.removeEventListener("refresh-topics", handleRefresh);
  }, [loadAll]);

  // 触发 5/5 认领上限替换弹窗
  const handleTriggerReplaceModal = (subTopicId?: string) => {
    const candidateClaims = myClaims.filter(
      (item) => getMyClaim(item, currentUserId)?.status === "candidate"
    );
    if (subTopicId) setTargetClaimId(subTopicId);
    setSelectedReturnId(candidateClaims[0]?.id || null);
    setReplaceDialogOpen(true);
  };

  // 执行替换认领
  const handleConfirmReplace = async () => {
    if (!selectedReturnId || !targetClaimId || isReplacing) return;
    setIsReplacing(true);
    try {
      const returnRes = await fetch(`/api/topics/sub-topics/${selectedReturnId}/return`, { method: "POST" });
      if (!returnRes.ok) throw new Error("放回旧选题失败");

      const claimRes = await fetch(`/api/topics/sub-topics/${targetClaimId}/claim`, { method: "POST" });
      if (!claimRes.ok) throw new Error("认领新选题失败");

      feedbackToast.success("已替换旧选题并成功认领！");
      setReplaceDialogOpen(false);
      setTargetClaimId(null);
      setSelectedReturnId(null);
      void loadAll();
    } catch (err) {
      feedbackToast.error("替换失败", { details: err instanceof Error ? err.message : String(err) });
    } finally {
      setIsReplacing(false);
    }
  };

  // 采纳 AI 建议入库 (Item 4): 发送 title, angle, category，错误抛原文
  const handleAdoptRecommendation = async (rec: RecommendationSuggestion, key: string) => {
    setAdoptingRecKey(key);
    try {
      const res = await fetch("/api/topics/sub-topics/from-recommendation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: rec.title,
          angle: rec.angle || null,
          category: rec.category
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "采纳入库失败");
      }
      feedbackToast.success(`成功采纳并存入选题池：“${rec.title}”`);
      setIgnoredRecKeys((prev) => new Set(prev).add(key));
      void loadAll();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      feedbackToast.error("采纳失败", { details: errMsg });
    } finally {
      setAdoptingRecKey(null);
    }
  };

  const handleLoadMore = async () => {
    const nextPage = currentPage + 1;
    const succeeded = await fetchPoolData(nextPage, true);
    setCurrentPage((page) => resolvePageAfterLoad(page, succeeded));
  };

  const activeCandidateCount = countMyCandidates(myClaims, currentUserId);
  const isLimitReached = activeCandidateCount >= 5;

  const candidateClaims = myClaims.filter(
    (item) => getMyClaim(item, currentUserId)?.status === "candidate"
  );

  // 母题分组聚合
  const groupedGroups = useMemo(() => {
    const groups: Record<string, { topicId: string; topicName: string; sortOrder: number; items: SubTopicItem[] }> = {};

    items.forEach((item) => {
      const topicId = item.topic_id || "unclassified";
      const topicName = item.topics?.name || "未归类母题";
      const sortOrder = item.topics?.sort_order ?? 999;

      if (!groups[topicId]) {
        groups[topicId] = {
          topicId,
          topicName,
          sortOrder,
          items: []
        };
      }
      groups[topicId].items.push(item);
    });

    return Object.values(groups).sort((a, b) => a.sortOrder - b.sortOrder);
  }, [items]);

  const toggleCollapseGroup = (topicId: string) => {
    setCollapsedTopicIds((prev) => {
      const next = new Set(prev);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);
      return next;
    });
  };

  // 横向对比中位数计算 (Item 8)
  const comparisonMedians = useMemo(() => {
    if (comparisonRows.length === 0) return { qualifiedRateMedian: 0, avgPlayMedian: 0 };
    const rates = comparisonRows.map((r) => r.qualifiedRate).sort((a, b) => a - b);
    const plays = comparisonRows.map((r) => r.avgPlayCount).sort((a, b) => a - b);
    const mid = Math.floor(rates.length / 2);
    return {
      qualifiedRateMedian: rates.length % 2 !== 0 ? rates[mid] : (rates[mid - 1] + rates[mid]) / 2,
      avgPlayMedian: plays.length % 2 !== 0 ? plays[mid] : (plays[mid - 1] + plays[mid]) / 2
    };
  }, [comparisonRows]);

  const rawSuggestions = recData?.suggestions || [];
  const visibleSuggestions = rawSuggestions.filter(
    (s) => !ignoredRecKeys.has(getRecommendationKey(s))
  );

  return (
    <div className="space-y-6">
      {/* 分类 / 认领失败独立重试提示栏 (Item 20) */}
      <AnimatePresence>
        {topicsError && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="flex items-center justify-between rounded-xl border border-[#C9604D]/25 bg-[#C9604D]/5 px-4 py-2.5 text-[12.5px] text-[#C9604D]"
          >
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="size-4 shrink-0" />
              <span>分类加载失败：{topicsError}</span>
            </div>
            <Button size="xs" variant="outline" onClick={() => void fetchTopics()} className="h-7 text-[12px]">
              <RefreshCw className="size-3 mr-1" />
              重新加载分类
            </Button>
          </motion.div>
        )}
        {claimsError && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="flex items-center justify-between rounded-xl border border-[#D99E55]/25 bg-[#D99E55]/5 px-4 py-2.5 text-[12.5px] text-stone-700"
          >
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="size-4 shrink-0 text-[#D99E55]" />
              <span>认领状态加载失败：{claimsError}</span>
            </div>
            <Button size="xs" variant="outline" onClick={() => void fetchMyClaims()} className="h-7 text-[12px]">
              <RefreshCw className="size-3 mr-1" />
              重新加载认领状态
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* L1 工作区主面板 (Unified L1 White Workbench Panel) */}
      <div className="rounded-2xl border border-stone-200/80 bg-white p-5 md:p-6 shadow-xs space-y-6">
        {/* 单层控制台 (Single-Row Flat Control Bar) */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200/70 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            {/* 单行平铺 segmented buttons */}
            <div className="flex flex-wrap items-center gap-1 bg-stone-100/70 p-1 rounded-xl border border-stone-200/50">
              <button
                onClick={() => {
                  setActiveTab("pool");
                  setCurrentView("all");
                }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-all duration-200 cursor-pointer",
                  activeTab === "pool" && currentView === "all"
                    ? "bg-white text-stone-900 shadow-xs"
                    : "text-stone-500 hover:text-stone-800"
                )}
              >
                <Compass className="size-4 text-[#D97757]" />
                <span>全部选题</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab("pool");
                  setCurrentView("my_claims");
                }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-all duration-200 cursor-pointer",
                  activeTab === "pool" && currentView === "my_claims"
                    ? "bg-white text-stone-900 shadow-xs"
                    : "text-stone-500 hover:text-stone-800"
                )}
              >
                <span>我正在做的</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab("pool");
                  setCurrentView("my_created");
                }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-all duration-200 cursor-pointer",
                  activeTab === "pool" && currentView === "my_created"
                    ? "bg-white text-stone-900 shadow-xs"
                    : "text-stone-500 hover:text-stone-800"
                )}
              >
                <span>我录入的</span>
              </button>

              <button
                onClick={() => setActiveTab("recommendations")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-all duration-200 cursor-pointer relative",
                  activeTab === "recommendations"
                    ? "bg-white text-stone-900 shadow-xs"
                    : "text-stone-500 hover:text-stone-800"
                )}
              >
                <Sparkles className="size-4 text-[#D97757]" />
                <span>AI系统推荐</span>
                {visibleSuggestions.length > 0 && (
                  <span className="ml-1 rounded-full bg-[#D97757] px-1.5 py-0.2 text-[10px] text-white">
                    {visibleSuggestions.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab("comparison")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-all duration-200 cursor-pointer",
                  activeTab === "comparison"
                    ? "bg-white text-stone-900 shadow-xs"
                    : "text-stone-500 hover:text-stone-800"
                )}
              >
                <BarChart3 className="size-4 text-[#5F82A8]" />
                <span>趋势与对比</span>
              </button>
            </div>

            {/* 母题分类下拉只在 "pool" 视图出现 */}
            {activeTab === "pool" && topicsList.length > 0 && (
              <select
                value={selectedTopicId}
                onChange={(e) => setSelectedTopicId(e.target.value)}
                className="h-8.5 rounded-lg border border-stone-200 bg-white px-2.5 text-[12px] text-stone-700 outline-none focus:border-[#D97757]"
              >
                <option value="__all__">全部分类母题</option>
                {topicsList.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* 控制栏右侧：5位动态点阵候选位 + 录入选题主 CTA */}
          <div className="flex items-center gap-4">
            {activeTab === "pool" && (
              <div
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-3 py-1.5 transition-all duration-200",
                  isLimitReached
                    ? "border-[#C9604D]/30 bg-[#C9604D]/8 text-[#C9604D]"
                    : "border-stone-200/80 bg-stone-50/60 text-stone-600"
                )}
                title={isLimitReached ? "候选位已满 (5/5)，点新选题将触发置换" : `当前候选选题 ${activeCandidateCount}/5`}
              >
                <span className="text-[11.5px] font-medium">候选位</span>
                <div className="flex items-center gap-1">
                  {Array.from({ length: 5 }).map((_, i) => {
                    const isFilled = i < activeCandidateCount;
                    return (
                      <span
                        key={i}
                        className={cn(
                          "size-2 rounded-full transition-all duration-300",
                          isFilled
                            ? isLimitReached
                              ? "bg-[#C9604D] shadow-[0_0_6px_rgba(201,96,77,0.6)] animate-pulse"
                              : "bg-[#5F82A8] shadow-[0_0_4px_rgba(95,130,168,0.4)]"
                            : "bg-stone-300/60"
                        )}
                      />
                    );
                  })}
                </div>
                <span className="text-[11.5px] font-semibold tabular-nums ml-0.5">
                  {activeCandidateCount}/5
                </span>
              </div>
            )}
            <Button
              size="sm"
              onClick={() => triggerGlobalTopicCreate()}
              className="h-8.5 rounded-xl px-4 text-[12.5px] font-medium bg-[#D97757] hover:bg-[#D97757]/90 text-white gap-1.5 cursor-pointer shadow-sm hover:shadow-md active:scale-95 transition-all"
            >
              <Plus className="size-4 stroke-[2.5]" />
              <span>录入选题</span>
            </Button>
          </div>
        </div>

      {/* 视图 1：选题池 View */}
      {activeTab === "pool" && (
        <div className="space-y-6">
          {/* 列表 / 骨架屏 / 空态 (带淡入淡出动效 Item 19) */}
          <AnimatePresence mode="wait">
            {loading && items.length === 0 ? (
              <TopicPoolSkeleton key="skeleton" />
            ) : poolError ? (
              <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <ErrorState title="获取选题数据失败" description={poolError} onRetry={() => void loadAll()} />
              </motion.div>
            ) : items.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center p-12 border border-dashed border-stone-200 bg-white rounded-2xl space-y-3 text-center"
              >
                <EmptyState title="暂无相关选题" description="当前筛选条件下没有查找到符合要求的选题。" />
                <Button size="sm" onClick={() => triggerGlobalTopicCreate()} className="bg-[#D97757] text-white">
                  <Plus className="size-4 mr-1" />
                  立即新建选题
                </Button>
              </motion.div>
            ) : (
              <motion.div key="content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-7">
                {groupedGroups.map((group) => {
                  const isCollapsed = collapsedTopicIds.has(group.topicId);
                  return (
                    <div key={group.topicId} className="space-y-3">
                      {/* 强层级母题大 Header */}
                      <div
                        onClick={() => toggleCollapseGroup(group.topicId)}
                        className="flex items-center justify-between cursor-pointer select-none rounded-xl px-4 py-3 bg-stone-100/90 hover:bg-stone-200/60 border border-stone-200/60 transition-all shadow-2xs group"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="flex size-7 items-center justify-center rounded-lg bg-[#5F82A8]/12 text-[#5F82A8] group-hover:bg-[#5F82A8] group-hover:text-white transition-colors">
                            <Compass className="size-4" />
                          </div>
                          <span className="text-[15px] font-bold text-stone-900 group-hover:text-stone-950">{group.topicName}</span>
                          <span className="inline-flex items-center rounded-lg bg-white px-2.5 py-0.5 text-[11.5px] font-semibold text-stone-600 border border-stone-200/70 shadow-2xs">
                            {group.items.length} 条选题
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-stone-400 group-hover:text-stone-700">
                          <span className="text-[12px] font-medium hidden sm:inline">{isCollapsed ? "展开分类" : "收起分类"}</span>
                          {isCollapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
                        </div>
                      </div>

                      {/* 子题 2 列 Grid 布局（提升信息吞吐量） */}
                      {!isCollapsed && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full pt-1">
                          {group.items.map((subTopic) => (
                            <SubTopicCard
                              key={subTopic.id}
                              item={subTopic}
                              currentUserId={currentUserId}
                              isLimitReached={isLimitReached}
                              isClaimedByMe={isClaimedByMe(subTopic, currentUserId)}
                              onClaimSuccess={() => void loadAll()}
                              onLimitReached409={() => handleTriggerReplaceModal(subTopic.id)}
                              onRefresh={() => void loadAll()}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {items.length < totalItems && (
                  <div className="flex justify-center pt-4">
                    <Button
                      variant="outline"
                      disabled={loadingMore}
                      onClick={() => void handleLoadMore()}
                      className="h-9 px-6 rounded-xl border-stone-200 text-[13px] font-medium"
                    >
                      {loadingMore ? <Loader2 className="size-4 animate-spin mr-1.5" /> : null}
                      加载更多选题（已加载 {items.length} / {totalItems}）
                    </Button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* 视图 2：系统推荐 (Item 1, 2, 3, 4) View */}
      {activeTab === "recommendations" && (
        <AnimatePresence mode="wait">
          <motion.div key="rec-panel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
            {/* 顶栏全局依据展示 (Item 3) */}
            <div className="rounded-2xl border border-[#D97757]/30 bg-gradient-to-r from-[#D97757]/5 to-amber-50/40 p-5 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-5 text-[#D97757]" />
                  <h2 className="text-[15px] font-bold text-stone-900">AI 爆款选题推荐</h2>
                </div>
                {recData && (
                  <div className="flex items-center gap-3 text-[11.5px] text-stone-500 font-medium">
                    {typeof recData.sampleCount === "number" && recData.sampleCount > 0 && <span>样本数：{recData.sampleCount} 条</span>}
                    {recData.marketDate && <span>热点日期：{recData.marketDate}</span>}
                  </div>
                )}
              </div>
              {recData?.evidenceSummary ? (
                <p className="text-[12.5px] text-stone-600 leading-relaxed">
                  推荐依据：{recData.evidenceSummary}
                </p>
              ) : (
                <p className="text-[12.5px] text-stone-600 leading-relaxed">
                  基于团队全网爆款视频样本与数据趋势生成的选题提炼。采纳后将自动转换为正式子题放入选题池。
                </p>
              )}
            </div>

            {loadingRecommendations ? (
              <TopicPoolSkeleton />
            ) : visibleSuggestions.length === 0 ? (
              <div className="py-12 text-center border border-dashed border-stone-200 rounded-2xl bg-white space-y-2">
                <EmptyState title="暂无推荐选题" description="先积累更多作品数据，AI 将持续学习并自动生成复刻建议。" />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {visibleSuggestions.map((rec) => {
                  const key = getRecommendationKey(rec);
                  const isAdopting = adoptingRecKey === key;
                  return (
                    <div
                      key={key}
                      className="flex flex-col justify-between rounded-2xl border border-[#D97757]/25 bg-white p-5 shadow-2xs hover:border-[#D97757]/45 transition-all"
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <span className="rounded-md bg-[#D97757]/10 px-2 py-0.5 text-[11px] font-semibold text-[#D97757]">
                            {rec.category || "爆款推荐"}
                          </span>
                          {rec.expectedPerformance && (
                            <span className="text-[11px] font-medium text-[#5F82A8] bg-[#5F82A8]/10 px-2 py-0.5 rounded-md">
                              预期表现: {rec.expectedPerformance}
                            </span>
                          )}
                        </div>

                        <h3 className="text-[15px] font-bold text-stone-900 leading-snug">{rec.title}</h3>

                        {rec.angle && (
                          <div className="rounded-xl bg-stone-50 p-3 border border-stone-150 text-[12.5px] text-stone-700 leading-relaxed">
                            <span className="font-semibold text-stone-850 block mb-0.5">切入角度：</span>
                            “{rec.angle}”
                          </div>
                        )}

                        {rec.evidence && (
                          <div className="text-[11.5px] text-stone-500 flex items-start gap-1">
                            <Info className="size-3.5 text-[#5F82A8] shrink-0 mt-0.5" />
                            <span>依据：{rec.evidence}</span>
                          </div>
                        )}

                        {rec.referenceVideos && rec.referenceVideos.length > 0 && (
                          <div className="space-y-1 pt-1 border-t border-stone-100">
                            <span className="text-[11px] font-medium text-stone-400 block flex items-center gap-1">
                              <Film className="size-3 text-stone-400" />
                              参考视频 ({rec.referenceVideos.length})
                            </span>
                            <div className="space-y-1">
                              {rec.referenceVideos.slice(0, 2).map((vid, idx) => {
                                const playVal = vid.playCount24h ?? vid.playCount;
                                return (
                                  <div key={idx} className="flex items-center justify-between text-[11px] text-stone-600 bg-stone-50 px-2 py-1 rounded-md">
                                    <span className="truncate max-w-[200px]">{vid.title || "爆款原片"}</span>
                                    {playVal !== undefined && (
                                      <span className="text-stone-400 tabular-nums">
                                        {playVal >= 10000 ? `${(playVal / 10000).toFixed(1)}w` : playVal}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="mt-4 flex items-center justify-end gap-2 border-t border-stone-100 pt-3">
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => setIgnoredRecKeys((prev) => new Set(prev).add(key))}
                          className="h-7.5 text-stone-400 hover:text-stone-600"
                        >
                          忽略
                        </Button>
                        <Button
                          size="xs"
                          disabled={isAdopting}
                          onClick={() => void handleAdoptRecommendation(rec, key)}
                          className="h-7.5 px-3.5 bg-[#D97757] hover:bg-[#D97757]/90 text-white font-medium rounded-lg"
                        >
                          {isAdopting ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
                          采纳进库
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      )}

      {/* 视图 3：横向对比 (Item 5, 6, 7, 8) View */}
      {activeTab === "comparison" && (
        <AnimatePresence mode="wait">
          <motion.div key="comp-panel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-stone-200 bg-white p-3.5 shadow-2xs">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1 bg-stone-100 p-0.5 rounded-lg border border-stone-200/50">
                  <button
                    onClick={() => setComparisonDimension("topic")}
                    className={cn(
                      "px-3 py-1 text-[12px] font-medium rounded-md cursor-pointer transition-all",
                      comparisonDimension === "topic" ? "bg-white text-stone-900 font-semibold shadow-2xs" : "text-stone-500"
                    )}
                  >
                    母题维度
                  </button>
                  <button
                    onClick={() => setComparisonDimension("account")}
                    className={cn(
                      "px-3 py-1 text-[12px] font-medium rounded-md cursor-pointer transition-all",
                      comparisonDimension === "account" ? "bg-white text-stone-900 font-semibold shadow-2xs" : "text-stone-500"
                    )}
                  >
                    账号维度
                  </button>
                </div>

                {/* 账号维度下强制选择对比母题 (Item 7) */}
                {comparisonDimension === "account" && topicsList.length > 0 && (
                  <div className="flex items-center gap-1.5 text-[12px]">
                    <span className="text-stone-500 font-medium">对比母题：</span>
                    <select
                      value={comparisonTopicId}
                      onChange={(e) => setComparisonTopicId(e.target.value)}
                      className="h-7.5 rounded-lg border border-stone-200 bg-white px-2 text-[12px] text-stone-800 outline-none focus:border-[#5F82A8]"
                    >
                      {topicsList.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* 时间筛选传递 days (Item 6) */}
              <div className="flex items-center gap-1.5 text-[12px]">
                <Calendar className="size-3.5 text-stone-400" />
                <span className="text-stone-500 font-medium">时间筛选：</span>
                <select
                  value={comparisonDays}
                  onChange={(e) => setComparisonDays(Number(e.target.value))}
                  className="h-7.5 rounded-lg border border-stone-200 bg-white px-2 text-[12px] outline-none"
                >
                  <option value={7}>近 7 天</option>
                  <option value={14}>近 14 天</option>
                  <option value={30}>近 30 天</option>
                </select>
              </div>
            </div>

            {/* 基于中位数的红涨绿跌人话解读 (Item 8) */}
            {comparisonRows.length > 0 && (
              <div className="rounded-xl bg-stone-100/70 p-3 border border-stone-200/50 text-[12px] text-stone-700 flex items-center gap-1.5">
                <Info className="size-4 text-[#5F82A8] shrink-0" />
                <span>
                  对比数据解读：基于当前列表分布中位数（达标率中位数：{(comparisonMedians.qualifiedRateMedian * 100).toFixed(1)}%，均播中位数：{comparisonMedians.avgPlayMedian.toLocaleString()}）。低于中位数标绿，高于中位数标红。
                </span>
              </div>
            )}

            {loadingComparison ? (
              <TopicPoolSkeleton />
            ) : comparisonRows.length === 0 ? (
              <div className="py-12 text-center border border-dashed border-stone-200 rounded-2xl bg-white space-y-2">
                <EmptyState title="暂无对比样本" description="当前筛选条件下缺少足够的作品发布样本。" />
              </div>
            ) : (
              <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[12.5px]">
                    <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 font-medium">
                      <tr>
                        <th className="py-3 px-4">{comparisonDimension === "topic" ? "母题分类" : "账号名称"}</th>
                        <th className="py-3 px-4">作品样本数</th>
                        <th className="py-3 px-4">爆款达标率</th>
                        <th className="py-3 px-4">平均播放量</th>
                        <th className="py-3 px-4">最高播放量</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {comparisonRows.map((row, idx) => {
                        const name = comparisonDimension === "account"
                          ? (row.accountName || row.topicName || `账号 ${idx + 1}`)
                          : (row.topicName || row.accountName || `母题 ${idx + 1}`);
                        const rowKey = comparisonDimension === "account"
                          ? `acc-${row.accountId || idx}-${idx}`
                          : `top-${row.topicId || idx}-${idx}`;

                        const isLowConfidence = row.lowConfidence || row.workCount < 3;
                        const isRateHigher = row.qualifiedRate >= comparisonMedians.qualifiedRateMedian;
                        const isPlayHigher = row.avgPlayCount >= comparisonMedians.avgPlayMedian;

                        return (
                          <tr key={rowKey} className={cn("hover:bg-stone-50/60", isLowConfidence && "opacity-70 bg-stone-50/30")}>
                            <td className="py-3 px-4 font-semibold text-stone-900 flex items-center gap-1.5">
                              <span className={cn(isLowConfidence && "text-stone-500")}>{name}</span>
                              {isLowConfidence && (
                                <span className="rounded bg-stone-200 px-1.5 py-0.2 text-[10px] text-stone-500 font-normal shrink-0">
                                  样本少仅供参考
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 tabular-nums text-stone-700">{row.workCount} 条</td>
                            <td className="py-3 px-4 font-semibold tabular-nums">
                              <span className={isRateHigher ? "text-[#C9604D]" : "text-[#6FAA7D]"}>
                                {(row.qualifiedRate * 100).toFixed(1)}%
                              </span>
                            </td>
                            <td className="py-3 px-4 font-semibold tabular-nums">
                              <span className={isPlayHigher ? "text-[#C9604D]" : "text-[#6FAA7D]"}>
                                {row.avgPlayCount >= 10000 ? `${(row.avgPlayCount / 10000).toFixed(1)}w` : row.avgPlayCount.toLocaleString()}
                              </span>
                            </td>
                            <td className="py-3 px-4 tabular-nums text-stone-800">
                              {row.bestPlayCount >= 10000 ? `${(row.bestPlayCount / 10000).toFixed(1)}w` : row.bestPlayCount.toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      )}
      </div>

      {/* 替换选择 (5/5 满额) Dialog (Item 4, 18 真正认领时间) */}
      <Dialog open={replaceDialogOpen} onOpenChange={setReplaceDialogOpen}>
        <DialogContent className="sm:max-w-md p-5 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-stone-900 text-[15px] font-semibold flex items-center gap-2">
              <ArrowRightLeft className="size-4 text-[#D97757]" />
              <span>候选位已满 (5/5) · 请选择替换</span>
            </DialogTitle>
            <DialogDescription className="text-stone-500 text-[12.5px]">
              您的候选选题库已达 5 条上限。请选择一条放回选题池，以便腾出空间认领新题。
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 space-y-2 max-h-[220px] overflow-y-auto pr-1">
            {candidateClaims.map((item) => {
              const isSelected = selectedReturnId === item.id;
              const myClaimObj = getMyClaim(item, currentUserId);
              const claimedAtTime = myClaimObj?.claimed_at || item.created_at;

              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedReturnId(item.id)}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all duration-150",
                    isSelected ? "border-[#D97757] bg-[#D97757]/5 shadow-xs" : "border-stone-200 bg-white hover:bg-stone-50"
                  )}
                >
                  <div className="space-y-0.5 min-w-0 pr-2">
                    <div className="text-[13px] font-medium text-stone-900 truncate">{item.title}</div>
                    <div className="text-[11px] text-stone-400">
                      认领时间: {new Date(claimedAtTime).toLocaleString()}
                    </div>
                  </div>
                  {isSelected && <Check className="size-4 text-[#D97757] shrink-0" />}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-stone-100">
            <Button type="button" variant="outline" size="sm" disabled={isReplacing} onClick={() => setReplaceDialogOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!selectedReturnId || isReplacing}
              onClick={() => void handleConfirmReplace()}
              className="bg-[#D97757] text-white hover:bg-[#D97757]/90"
            >
              {isReplacing ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
              确认替换并认领
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
