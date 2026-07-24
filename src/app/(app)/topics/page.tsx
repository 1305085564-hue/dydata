"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { SubTopicCard, type SubTopicItem, type SubTopicClaim } from "@/components/topics/sub-topic-card";
import { TopicDetailModal } from "@/components/topics/topic-detail-modal";
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
  Film,
  Clock,
  SlidersHorizontal,
  Search,
  X,
  LayoutGrid,
  List,
  Layers
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
  return items.filter((item) => getMyClaim(item, currentUserId) !== null).length;
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
  
  // 筛选与 Popover 控制状态
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  const [viewPopoverOpen, setViewPopoverOpen] = useState(false);
  const [sortBy, setSortBy] = useState<"default" | "play_desc" | "claims_desc" | "newest">("default");
  const [viewDensity, setViewDensity] = useState<"grid" | "compact">("grid");
  const [groupBy, setGroupBy] = useState<"none" | "topic">("none");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // 视图基础过滤状态
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

  // 3:4 沉浸中心弹窗 state
  const [activeDetailItem, setActiveDetailItem] = useState<SubTopicItem | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  // 折叠母题 ID 集合
  const [collapsedTopicIds, setCollapsedTopicIds] = useState<Set<string>>(new Set());
  const [currentUserId, setCurrentUserId] = useState<string>("");

  // 系统推荐 (Item 1, 2, 3, 4) state
  const [recData, setRecData] = useState<RecommendationResponse | null>(null);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [ignoredRecKeys, setIgnoredRecKeys] = useState<Set<string>>(new Set());
  const [adoptingRecKey, setAdoptingRecKey] = useState<string | null>(null);

  // 采纳 AI 建议微调气泡
  const [adoptModalOpen, setAdoptModalOpen] = useState(false);
  const [adoptingRec, setAdoptingRec] = useState<RecommendationSuggestion | null>(null);
  const [tuneTitle, setTuneTitle] = useState("");
  const [tuneTopicId, setTuneTopicId] = useState("");
  const [isSubmittingAdopt, setIsSubmittingAdopt] = useState(false);

  // 横向对比 (Item 5, 6, 7, 8) state
  const [comparisonDimension, setComparisonDimension] = useState<"topic" | "account">("topic");
  const [comparisonDays, setComparisonDays] = useState<number>(30);
  const [comparisonTopicId, setComparisonTopicId] = useState<string>("");
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

    try {
      const savedCollapsed = localStorage.getItem("dydata_topic_collapsed_ids");
      if (savedCollapsed) {
        const parsed = JSON.parse(savedCollapsed);
        if (Array.isArray(parsed)) {
          setCollapsedTopicIds(new Set(parsed));
        }
      }
    } catch (err) {
      console.error("读取折叠偏好失败:", err);
    }
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
      if (list.length > 0 && !tuneTopicId) {
        setTuneTopicId(list[0].id);
      }
    } catch (err) {
      console.error("加载母题过滤分类失败:", err);
      setTopicsList([]);
      setTopicsError(err instanceof Error ? err.message : "母题分类加载失败");
    }
  }, [comparisonTopicId, tuneTopicId]);

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

  // 加载系统推荐
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

  // 加载横向对比
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

  // 触发 5/5 认领上限替换弹窗 (智能高亮挂机最久)
  const candidateClaims = useMemo(() => {
    return myClaims.filter(
      (item) => getMyClaim(item, currentUserId) !== null
    );
  }, [myClaims, currentUserId]);

  const candidateClaimsWithDays = useMemo(() => {
    return candidateClaims.map((item) => {
      const claimObj = getMyClaim(item, currentUserId);
      const claimedAtTime = claimObj?.claimed_at || item.created_at;
      const diffMs = Date.now() - new Date(claimedAtTime).getTime();
      const days = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
      return {
        item,
        claimedAtTime,
        days
      };
    });
  }, [candidateClaims, currentUserId]);

  const oldestCandidateId = useMemo(() => {
    if (candidateClaimsWithDays.length === 0) return null;
    const sorted = [...candidateClaimsWithDays].sort((a, b) => b.days - a.days);
    return sorted[0]?.item.id || null;
  }, [candidateClaimsWithDays]);

  const handleTriggerReplaceModal = (subTopicId?: string) => {
    if (subTopicId) setTargetClaimId(subTopicId);
    setSelectedReturnId(oldestCandidateId || candidateClaims[0]?.id || null);
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

  // 打开 AI 推荐采纳微调弹窗
  const handleOpenAdoptModal = (rec: RecommendationSuggestion, key: string) => {
    setAdoptingRec(rec);
    setAdoptingRecKey(key);
    setTuneTitle(rec.title);
    if (topicsList.length > 0) {
      setTuneTopicId(topicsList[0].id);
    }
    setAdoptModalOpen(true);
  };

  // 提交 AI 采纳微调入库
  const handleConfirmAdopt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adoptingRec || !adoptingRecKey) return;
    if (!tuneTitle.trim()) {
      feedbackToast.warning("选题标题不能为空");
      return;
    }

    setIsSubmittingAdopt(true);
    try {
      const res = await fetch("/api/topics/sub-topics/from-recommendation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: tuneTitle.trim(),
          angle: adoptingRec.angle || null,
          category: topicsList.find((t) => t.id === tuneTopicId)?.name || adoptingRec.category
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "采纳入库失败");
      }
      feedbackToast.success(`成功微调并入库：“${tuneTitle.trim()}”`);
      setIgnoredRecKeys((prev) => new Set(prev).add(adoptingRecKey));
      setAdoptModalOpen(false);
      setAdoptingRec(null);
      setAdoptingRecKey(null);
      setActiveTab("pool");
      void loadAll();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      feedbackToast.error("采纳失败", { details: errMsg });
    } finally {
      setIsSubmittingAdopt(false);
    }
  };

  const handleLoadMore = async () => {
    const nextPage = currentPage + 1;
    const succeeded = await fetchPoolData(nextPage, true);
    setCurrentPage((page) => resolvePageAfterLoad(page, succeeded));
  };

  const activeCandidateCount = countMyCandidates(myClaims, currentUserId);
  const isLimitReached = activeCandidateCount >= 5;

  // 即时搜索与排序过滤
  const filteredAndSortedItems = useMemo(() => {
    let result = [...items];

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.hook?.toLowerCase().includes(q) ||
          item.emotion_tag?.toLowerCase().includes(q) ||
          item.topics?.name?.toLowerCase().includes(q)
      );
    }

    if (sortBy === "play_desc") {
      result.sort((a, b) => (b.summary.averagePlayCount ?? 0) - (a.summary.averagePlayCount ?? 0));
    } else if (sortBy === "claims_desc") {
      result.sort((a, b) => (b.claimCount ?? 0) - (a.claimCount ?? 0));
    } else if (sortBy === "newest") {
      result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    return result;
  }, [items, searchQuery, sortBy]);

  // 母题分组聚合
  const groupedGroups = useMemo(() => {
    const groups: Record<string, { topicId: string; topicName: string; sortOrder: number; items: SubTopicItem[] }> = {};

    filteredAndSortedItems.forEach((item) => {
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
  }, [filteredAndSortedItems]);

  // 折叠母题偏好持久化 (localStorage)
  const toggleCollapseGroup = (topicId: string) => {
    setCollapsedTopicIds((prev) => {
      const next = new Set(prev);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);
      try {
        localStorage.setItem("dydata_topic_collapsed_ids", JSON.stringify(Array.from(next)));
      } catch (err) {
        console.error("保存折叠偏好失败:", err);
      }
      return next;
    });
  };

  // 横向对比中位数计算
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
      {/* 分类 / 认领失败独立重试提示栏 */}
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
        {/* 控制台顶栏：Tab 筛选与合一控制器 */}
        <div className="flex items-center justify-between gap-4 border-b border-stone-100 pb-3.5 flex-wrap">
          {/* 左侧：Tab 菜单 + 三合一筛选口 + 划入伸缩搜索 */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-stone-100/60 p-1 rounded-2xl border border-stone-200/50">
              {/* 一体化视角切换控制器（划入/Hover 平滑展开 3 个视角选项） */}
              <div
                className="relative group"
                onMouseEnter={() => setViewPopoverOpen(true)}
                onMouseLeave={() => setViewPopoverOpen(false)}
              >
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("pool");
                    setViewPopoverOpen((prev) => !prev);
                  }}
                  className={cn(
                    "flex items-center gap-1.5 text-[13px] transition-all cursor-pointer px-3 py-1.5 rounded-xl border",
                    activeTab === "pool"
                      ? "bg-[#D97757]/12 text-[#D97757] font-bold shadow-2xs border-[#D97757]/20"
                      : "text-stone-600 hover:text-stone-900 hover:bg-white/60 border-transparent font-medium"
                  )}
                >
                  {currentView === "all" ? (
                    <Compass className="size-4 shrink-0 text-[#D97757]" />
                  ) : currentView === "my_claims" ? (
                    <Clock className="size-4 shrink-0 text-[#D97757]" />
                  ) : (
                    <Film className="size-4 shrink-0 text-[#D97757]" />
                  )}
                  <span>
                    {currentView === "all"
                      ? "全部选题"
                      : currentView === "my_claims"
                      ? "我正在做的"
                      : "我录入的"}
                  </span>
                  <ChevronDown className="size-3 text-stone-400 group-hover:rotate-180 transition-transform duration-200" />
                </button>

                <AnimatePresence>
                  {viewPopoverOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 6, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 6, scale: 0.96 }}
                      transition={{ duration: 0.15 }}
                      className="absolute left-0 top-full mt-1 z-30 w-44 bg-white rounded-2xl shadow-xl border border-stone-200/90 p-1.5 space-y-1 text-xs"
                    >
                      {[
                        { id: "all", label: "全部选题", icon: Compass },
                        { id: "my_claims", label: "我正在做的", icon: Clock },
                        { id: "my_created", label: "我录入的", icon: Film },
                      ].map((opt) => {
                        const Icon = opt.icon;
                        const isSelected = activeTab === "pool" && currentView === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setActiveTab("pool");
                              setCurrentView(opt.id as any);
                              setViewPopoverOpen(false);
                            }}
                            className={cn(
                              "flex w-full items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer text-left",
                              isSelected
                                ? "bg-[#D97757]/12 text-[#D97757] font-semibold"
                                : "text-stone-700 hover:bg-stone-100"
                            )}
                          >
                            <Icon className={cn("size-3.5", isSelected ? "text-[#D97757]" : "text-stone-400")} />
                            <span>{opt.label}</span>
                            {isSelected && <Check className="size-3 ml-auto text-[#D97757]" />}
                          </button>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <button
                onClick={() => setActiveTab("recommendations")}
                className={cn(
                  "flex items-center gap-1.5 text-[13px] transition-all cursor-pointer px-3 py-1.5 rounded-xl relative",
                  activeTab === "recommendations"
                    ? "bg-[#D97757]/12 text-[#D97757] font-bold shadow-2xs border border-[#D97757]/20"
                    : "text-stone-600 hover:text-stone-900 hover:bg-white/60 font-medium"
                )}
              >
                <Sparkles className={cn("size-4 shrink-0", activeTab === "recommendations" ? "text-[#D97757]" : "text-stone-400")} />
                <span>AI系统推荐</span>
                {visibleSuggestions.length > 0 && (
                  <span className="ml-1 rounded-full bg-[#D97757] px-1.5 py-0.2 text-[10px] text-white font-semibold shadow-xs">
                    {visibleSuggestions.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab("comparison")}
                className={cn(
                  "flex items-center gap-1.5 text-[13px] transition-all cursor-pointer px-3 py-1.5 rounded-xl",
                  activeTab === "comparison"
                    ? "bg-[#D97757]/12 text-[#D97757] font-bold shadow-2xs border border-[#D97757]/20"
                    : "text-stone-600 hover:text-stone-900 hover:bg-white/60 font-medium"
                )}
              >
                <BarChart3 className={cn("size-4 shrink-0", activeTab === "comparison" ? "text-[#D97757]" : "text-stone-400")} />
                <span>趋势与对比</span>
              </button>
            </div>

            {/* 划入（Hover）即时展开的“三合一筛选与视图” Popover 入口 */}
            {activeTab === "pool" && (
              <div className="flex items-center gap-2">
                <div className="h-4 w-[1px] bg-stone-200/80 shrink-0" />

                <div
                  className="relative group"
                  onMouseEnter={() => setFilterPopoverOpen(true)}
                  onMouseLeave={() => setFilterPopoverOpen(false)}
                >
                  <button
                    type="button"
                    onClick={() => setFilterPopoverOpen((prev) => !prev)}
                    className={cn(
                      "flex items-center gap-1.5 text-xs font-medium transition-all cursor-pointer h-8.5 px-3 rounded-xl border border-stone-200/90 bg-stone-50/80 hover:bg-white text-stone-700 shadow-2xs",
                      filterPopoverOpen && "border-[#D97757]/50 bg-[#D97757]/8 text-[#D97757] font-semibold"
                    )}
                  >
                    <SlidersHorizontal className="size-3.5 text-stone-500" />
                    <span>筛选与视图</span>
                    <ChevronDown className="size-3 text-stone-400 transition-transform duration-200 group-hover:rotate-180" />
                  </button>

                  <AnimatePresence>
                    {filterPopoverOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 6, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6, scale: 0.96 }}
                        transition={{ duration: 0.15 }}
                        className="absolute left-0 top-full mt-1.5 z-30 w-[380px] bg-white rounded-2xl shadow-xl border border-stone-200/90 p-4.5 space-y-4 text-xs"
                      >
                        {/* 分区 1：母题分类（3 行 3 列 3x3 宽幅胶囊矩阵，全部分类置于末尾） */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-[11.5px] font-semibold text-stone-400 uppercase tracking-wider">
                            <span>母题分类</span>
                            <span className="text-[11px] font-normal text-stone-400">划入直选</span>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            {topicsList.map((t) => (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => setSelectedTopicId(t.id)}
                                title={t.name}
                                className={cn(
                                  "h-8.5 rounded-xl border text-[12px] font-medium transition-all cursor-pointer truncate px-2 text-center",
                                  selectedTopicId === t.id
                                    ? "border-[#D97757]/40 bg-[#D97757]/10 text-[#D97757] font-semibold shadow-2xs"
                                    : "border-stone-200/80 bg-stone-50/60 text-stone-700 hover:bg-stone-100"
                                )}
                              >
                                {t.name}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => setSelectedTopicId("__all__")}
                              className={cn(
                                "h-8.5 rounded-xl border text-[12px] font-medium transition-all cursor-pointer truncate px-2 text-center",
                                selectedTopicId === "__all__"
                                  ? "border-[#D97757]/40 bg-[#D97757]/10 text-[#D97757] font-semibold shadow-2xs"
                                  : "border-stone-200/80 bg-stone-50/60 text-stone-700 hover:bg-stone-100"
                              )}
                            >
                              全部分类
                            </button>
                          </div>
                        </div>

                        <div className="h-[1px] bg-stone-100" />

                        {/* 分区 2：排序方式（单行一字排开 4 项） */}
                        <div className="space-y-2">
                          <div className="text-[11.5px] font-semibold text-stone-400 uppercase tracking-wider">
                            排序方式
                          </div>
                          <div className="grid grid-cols-4 gap-1.5">
                            {[
                              { id: "default", label: "默认排序" },
                              { id: "play_desc", label: "均播最高" },
                              { id: "claims_desc", label: "认领热度" },
                              { id: "newest", label: "最新录入" }
                            ].map((opt) => (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => setSortBy(opt.id as any)}
                                className={cn(
                                  "h-8 rounded-xl border text-[11.5px] font-medium transition-all cursor-pointer text-center px-1",
                                  sortBy === opt.id
                                    ? "border-[#D97757]/40 bg-[#D97757]/10 text-[#D97757] font-semibold shadow-2xs"
                                    : "border-stone-200/80 bg-stone-50/60 text-stone-700 hover:bg-stone-100"
                                )}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="h-[1px] bg-stone-100" />

                        {/* 分区 3：视图模式 */}
                        <div className="space-y-2">
                          <div className="text-[11.5px] font-semibold text-stone-400 uppercase tracking-wider">
                            视图密度
                          </div>
                          <div className="flex items-center gap-1.5 bg-stone-100 p-1 rounded-xl">
                            <button
                              type="button"
                              onClick={() => setViewDensity("grid")}
                              className={cn(
                                "flex-1 h-8 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                                viewDensity === "grid" ? "bg-white text-stone-900 shadow-2xs font-semibold" : "text-stone-500 hover:text-stone-800"
                              )}
                            >
                              <LayoutGrid className="size-3.5" />
                              <span>网格视图</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setViewDensity("compact")}
                              className={cn(
                                "flex-1 h-8 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                                viewDensity === "compact" ? "bg-white text-stone-900 shadow-2xs font-semibold" : "text-stone-500 hover:text-stone-800"
                              )}
                            >
                              <List className="size-3.5" />
                              <span>紧凑列表</span>
                            </button>
                          </div>
                        </div>

                        <div className="h-[1px] bg-stone-100" />

                        {/* 分区 4：分组结构 */}
                        <div className="space-y-2">
                          <div className="text-[11.5px] font-semibold text-stone-400 uppercase tracking-wider">
                            分组结构
                          </div>
                          <div className="flex items-center gap-1.5 bg-stone-100 p-1 rounded-xl">
                            <button
                              type="button"
                              onClick={() => setGroupBy("none")}
                              className={cn(
                                "flex-1 h-8 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                                groupBy === "none" ? "bg-white text-stone-900 shadow-2xs font-semibold" : "text-stone-500 hover:text-stone-800"
                              )}
                            >
                              <span>平铺无分组</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setGroupBy("topic")}
                              className={cn(
                                "flex-1 h-8 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                                groupBy === "topic" ? "bg-white text-stone-900 shadow-2xs font-semibold" : "text-stone-500 hover:text-stone-800"
                              )}
                            >
                              <Layers className="size-3.5" />
                              <span>按母题分组</span>
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* 撤回项 3 还原：默认紧凑 Icon 按钮，划入/聚焦平滑展开为搜索框 */}
                <div
                  className={cn(
                    "relative flex items-center transition-all duration-300 ease-out group",
                    searchQuery || isSearchFocused ? "w-44" : "w-8.5 hover:w-44 focus-within:w-44"
                  )}
                >
                  <div className="absolute left-2.5 top-2 z-10 text-stone-400 group-hover:text-[#D97757] transition-colors pointer-events-none">
                    <Search className="size-4" />
                  </div>
                  <input
                    type="text"
                    value={searchQuery}
                    onFocus={() => setIsSearchFocused(true)}
                    onBlur={() => setIsSearchFocused(false)}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="搜索选题标题/Hook..."
                    className={cn(
                      "h-8.5 rounded-xl border border-stone-200/90 bg-stone-50/80 pl-8 pr-7 text-xs text-stone-800 placeholder-stone-400 outline-none focus:border-[#D97757] focus:bg-white transition-all duration-300 ease-out w-full shadow-2xs",
                      searchQuery || isSearchFocused ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100 cursor-pointer"
                    )}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 top-2.5 z-10 text-stone-400 hover:text-stone-700"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
              </div>
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
                <motion.div key="content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5">
                  {groupBy === "topic" ? (
                    /* 按母题分组结构渲染 */
                    <div className="space-y-6">
                      {groupedGroups.map((group) => {
                        const isCollapsed = collapsedTopicIds.has(group.topicId);
                        return (
                          <div key={group.topicId} className="space-y-2.5 pt-1">
                            {/* 母题分类组头 Header */}
                            <div
                              onClick={() => toggleCollapseGroup(group.topicId)}
                              className="flex items-center justify-between cursor-pointer select-none py-1 px-0.5 group transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <span className="h-3.5 w-1 rounded-full bg-[#D97757] shrink-0" />
                                <span className="text-[14px] font-semibold text-stone-800 group-hover:text-stone-950 transition-colors">
                                  {group.topicName}
                                </span>
                                <span className="text-[11.5px] text-stone-400 font-normal tabular-nums">
                                  ({group.items.length})
                                </span>
                              </div>
                              <div className="flex items-center gap-1 text-[11.5px] text-stone-400 group-hover:text-stone-600 transition-colors">
                                <span className="hidden sm:inline">{isCollapsed ? "展开" : "收起"}</span>
                                {isCollapsed ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
                              </div>
                            </div>

                            {!isCollapsed && (
                              viewDensity === "compact" ? (
                                <div className="rounded-2xl border border-stone-200/80 bg-white overflow-hidden shadow-2xs divide-y divide-stone-100">
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
                                      compactView={true}
                                      onOpenDetail={(item) => {
                                        setActiveDetailItem(item);
                                        setDetailModalOpen(true);
                                      }}
                                    />
                                  ))}
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 w-full">
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
                                      compactView={false}
                                      onOpenDetail={(item) => {
                                        setActiveDetailItem(item);
                                        setDetailModalOpen(true);
                                      }}
                                    />
                                  ))}
                                </div>
                              )
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* 无分组平铺模式 (默认) */
                    viewDensity === "compact" ? (
                      <div className="rounded-2xl border border-stone-200/80 bg-white overflow-hidden shadow-2xs divide-y divide-stone-100">
                        {filteredAndSortedItems.map((subTopic) => (
                          <SubTopicCard
                            key={subTopic.id}
                            item={subTopic}
                            currentUserId={currentUserId}
                            isLimitReached={isLimitReached}
                            isClaimedByMe={isClaimedByMe(subTopic, currentUserId)}
                            onClaimSuccess={() => void loadAll()}
                            onLimitReached409={() => handleTriggerReplaceModal(subTopic.id)}
                            onRefresh={() => void loadAll()}
                            compactView={true}
                            onOpenDetail={(item) => {
                              setActiveDetailItem(item);
                              setDetailModalOpen(true);
                            }}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 w-full">
                        {filteredAndSortedItems.map((subTopic) => (
                          <SubTopicCard
                            key={subTopic.id}
                            item={subTopic}
                            currentUserId={currentUserId}
                            isLimitReached={isLimitReached}
                            isClaimedByMe={isClaimedByMe(subTopic, currentUserId)}
                            onClaimSuccess={() => void loadAll()}
                            onLimitReached409={() => handleTriggerReplaceModal(subTopic.id)}
                            onRefresh={() => void loadAll()}
                            compactView={false}
                            onOpenDetail={(item) => {
                              setActiveDetailItem(item);
                              setDetailModalOpen(true);
                            }}
                          />
                        ))}
                      </div>
                    )
                  )}

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

        {/* 视图 2：系统推荐 View */}
        {activeTab === "recommendations" && (
          <AnimatePresence mode="wait">
            <motion.div key="rec-panel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
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
                            onClick={() => handleOpenAdoptModal(rec, key)}
                            className="h-7.5 px-3.5 bg-[#D97757] hover:bg-[#D97757]/90 text-white font-medium rounded-lg cursor-pointer"
                          >
                            采纳微调
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

        {/* 视图 3：横向对比 View */}
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

      {/* 3:4 全局沉浸中心弹窗 */}
      <TopicDetailModal
        item={activeDetailItem}
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        currentUserId={currentUserId}
        isLimitReached={isLimitReached}
        isClaimedByMe={activeDetailItem ? isClaimedByMe(activeDetailItem, currentUserId) : false}
        onClaimSuccess={() => void loadAll()}
        onLimitReached409={() => {
          if (activeDetailItem) handleTriggerReplaceModal(activeDetailItem.id);
        }}
        onRefresh={() => void loadAll()}
      />

      {/* 升级版 5/5 满额替换决策 Dialog */}
      <Dialog open={replaceDialogOpen} onOpenChange={setReplaceDialogOpen}>
        <DialogContent className="sm:max-w-md p-5 rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-stone-900 text-[15px] font-semibold flex items-center gap-2">
              <ArrowRightLeft className="size-4 text-[#D97757]" />
              <span>候选位已满 (5/5) · 请选择替换</span>
            </DialogTitle>
            <DialogDescription className="text-stone-500 text-[12.5px]">
              您的候选选题库已达 5 条上限。系统已智能高亮挂机最久的选题，请选择一条放回以腾出空间。
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 space-y-2 max-h-[260px] overflow-y-auto pr-1">
            {candidateClaimsWithDays.map(({ item, days }) => {
              const isSelected = selectedReturnId === item.id;
              const isOldest = item.id === oldestCandidateId;

              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedReturnId(item.id)}
                  className={cn(
                    "flex flex-col p-3 rounded-2xl border cursor-pointer transition-all duration-150 relative space-y-1",
                    isSelected
                      ? "border-[#D97757] bg-[#D97757]/8 shadow-xs"
                      : "border-stone-200/80 bg-white hover:bg-stone-50"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[13px] font-semibold text-stone-900 truncate">{item.title}</span>
                      {isOldest && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-[#C9604D]/15 px-2 py-0.2 text-[10px] font-bold text-[#C9604D] shrink-0">
                          <Clock className="size-3" />
                          挂机最久 · 建议替换
                        </span>
                      )}
                    </div>
                    {isSelected && <Check className="size-4 text-[#D97757] shrink-0 stroke-[2.5]" />}
                  </div>

                  <div className="flex items-center justify-between text-[11.5px] text-stone-500">
                    <span>状态：已认领 {days} 天 · 尚未提交作品</span>
                    {item.topic_groups && (
                      <span className="text-stone-400">{item.topic_groups.name}</span>
                    )}
                  </div>
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
              className="bg-[#D97757] text-white hover:bg-[#D97757]/90 rounded-xl"
            >
              {isReplacing ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
              确认替换并认领
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* AI 推荐采纳微调气泡 Dialog */}
      <Dialog open={adoptModalOpen} onOpenChange={setAdoptModalOpen}>
        <DialogContent className="sm:max-w-md p-5 rounded-3xl z-[60]">
          <DialogHeader>
            <DialogTitle className="text-stone-900 text-[15px] font-semibold flex items-center gap-2">
              <Sparkles className="size-4 text-[#D97757]" />
              <span>微调选题并采纳入库</span>
            </DialogTitle>
            <DialogDescription className="text-stone-500 text-[12.5px]">
              可在入库前修改选题标题或更改归属的分类母题。
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleConfirmAdopt} className="space-y-3.5 mt-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-stone-700">选题标题 *</label>
              <input
                type="text"
                required
                value={tuneTitle}
                onChange={(e) => setTuneTitle(e.target.value)}
                className="w-full h-9 rounded-xl border border-stone-200 px-3 text-xs outline-none focus:border-[#D97757]"
              />
            </div>

            {topicsList.length > 0 && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-stone-700">归属分类母题</label>
                <select
                  value={tuneTopicId}
                  onChange={(e) => setTuneTopicId(e.target.value)}
                  className="w-full h-9 rounded-xl border border-stone-200 bg-white px-3 text-xs outline-none focus:border-[#D97757]"
                >
                  {topicsList.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}

            {adoptingRec?.angle && (
              <div className="rounded-xl bg-stone-50 p-3 border border-stone-200/60 text-xs text-stone-600 space-y-0.5">
                <span className="font-semibold text-stone-800">原推荐切入角度：</span>
                <p>“{adoptingRec.angle}”</p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
              <Button type="button" variant="outline" size="sm" onClick={() => setAdoptModalOpen(false)}>
                取消
              </Button>
              <Button type="submit" size="sm" disabled={isSubmittingAdopt} className="bg-[#D97757] text-white hover:bg-[#D97757]/90 rounded-xl">
                {isSubmittingAdopt ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
                确认采纳并存入选题池
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
