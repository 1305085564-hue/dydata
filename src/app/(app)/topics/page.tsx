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
  Layers,
  User
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface TopicInfo {
  id: string;
  name: string;
  sort_order: number;
}

type TopicSortMode = "default" | "play_desc" | "claims_desc" | "newest";

const TOPIC_SORT_OPTIONS = [
  { id: "default", label: "默认排序" },
  { id: "play_desc", label: "均播最高" },
  { id: "claims_desc", label: "认领热度" },
  { id: "newest", label: "最新录入" },
] as const satisfies ReadonlyArray<{ id: TopicSortMode; label: string }>;

function getMyClaim(item: { sub_topic_claims?: SubTopicClaim[] | null }, currentUserId: string) {
  return item.sub_topic_claims?.find((c) => c.user_id === currentUserId && c.status !== "returned") ?? null;
}

function isClaimedByMe(item: { sub_topic_claims?: SubTopicClaim[] | null }, currentUserId: string) {
  return !!getMyClaim(item, currentUserId);
}

function countMyCandidates(items: Array<{ sub_topic_claims?: SubTopicClaim[] | null }>, currentUserId: string) {
  return items.filter((item) => getMyClaim(item, currentUserId) !== null).length;
}

function formatTopicName5(rawName: string): string {
  if (!rawName) return rawName;
  const trimmed = rawName.trim();
  if (trimmed.includes("热点") || trimmed.includes("新闻") || trimmed.includes("实时")) return "实时解读类";
  if (trimmed.includes("案例") || trimmed.includes("拆解") || trimmed.includes("复盘")) return "案例复盘类";
  if (trimmed.includes("工具") || trimmed.includes("神技")) return "工具神技类";
  if (trimmed.endsWith("类")) return trimmed;
  return `${trimmed}类`;
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
      <div className="h-10 w-full rounded-xl bg-zinc-200/60" />
      <div className="space-y-3">
        <div className="h-28 w-full rounded-xl bg-zinc-200/50" />
        <div className="h-28 w-full rounded-xl bg-zinc-200/50" />
        <div className="h-28 w-full rounded-xl bg-zinc-200/50" />
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

  // 主页视图 Tab
  const [activeTab, setActiveTab] = useState<"pool" | "comparison" | "recommendations">("pool");
  
  // 推荐选题与趋势变化 Modal / Popover 状态
  const [recModalOpen, setRecModalOpen] = useState(false);
  const [compModalOpen, setCompModalOpen] = useState(false);
  const [compPopoverOpen, setCompPopoverOpen] = useState(false);

  // 筛选与 Popover 控制状态
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  const [sortBy, setSortBy] = useState<TopicSortMode>("default");
  const [viewDensity, setViewDensity] = useState<"grid" | "compact">("grid");
  const [groupBy, setGroupBy] = useState<"none" | "topic">("none");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // 多选分类 Toggle Handler
  const handleToggleTopicId = useCallback((id: string) => {
    setSelectedTopicIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }, []);

  // 视图基础过滤状态
  const [currentView, setCurrentView] = useState<"all" | "my_claims" | "my_created">("all");
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

      if (selectedTopicIds.length > 0) {
        selectedTopicIds.forEach((id) => {
          params.append("topic_id", id);
        });
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
  }, [currentView, selectedTopicIds]);

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
      const replaceRes = await fetch("/api/topics/sub-topics/replace-claim", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returned_sub_topic_id: selectedReturnId, target_sub_topic_id: targetClaimId }),
      });
      if (!replaceRes.ok) throw new Error("替换认领失败");

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

    if (selectedTopicIds.length > 0) {
      result = result.filter((item) => item.topic_id && selectedTopicIds.includes(item.topic_id));
    }

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
  }, [items, selectedTopicIds, searchQuery, sortBy]);

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
            className="flex items-center justify-between rounded-xl border border-[#D99E55]/25 bg-[#D99E55]/5 px-4 py-2.5 text-[12.5px] text-zinc-700"
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
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 md:p-6 shadow-xs space-y-6">
        {/* 控制台顶栏：Tab 筛选与合一控制器 */}
        <div className="flex items-center justify-between gap-4 pb-1 flex-wrap">
          {/* 左侧：Tab 菜单 + 三合一筛选口 + 划入伸缩搜索 */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* 主焦点组：核心业务视角切换器 (Primary Focus - Unified 3-Way Segmented Control) */}
            <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl border border-zinc-200/80 shadow-2xs">
              {[
                { id: "all", label: "全部选题", icon: Compass },
                { id: "my_created", label: "个人选题", icon: Film },
                { id: "my_claims", label: "脚本中", icon: Clock }
              ].map((opt) => {
                const Icon = opt.icon;
                const isSelected = activeTab === "pool" && currentView === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setActiveTab("pool");
                      setCurrentPage(1);
                      setCurrentView(opt.id as "all" | "my_claims" | "my_created");
                    }}
                    className={cn(
                      "flex items-center gap-1.5 text-[13px] font-bold transition-all cursor-pointer px-3.5 py-1.5 rounded-lg select-none",
                      isSelected
                        ? "bg-white text-zinc-900 font-bold shadow-xs border border-zinc-200/90 ring-1 ring-zinc-950/5"
                        : "text-zinc-500 hover:text-zinc-800"
                    )}
                  >
                    <Icon className={cn("size-4 shrink-0", isSelected ? "text-zinc-900" : "text-zinc-400")} />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>

            {/* 次焦点组：辅助决策工具 (Secondary Focus - Subdued & Subtle Control) */}
            <div className="flex items-center gap-1 bg-zinc-50/70 p-1 rounded-xl border border-zinc-200/40">
              <button
                type="button"
                onClick={() => setRecModalOpen(true)}
                className={cn(
                  "flex items-center gap-1.5 text-[12px] font-medium transition-all cursor-pointer px-2.5 py-1.5 rounded-lg select-none relative",
                  recModalOpen
                    ? "bg-white text-zinc-800 font-semibold shadow-2xs border border-zinc-200/60"
                    : "text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100/60"
                )}
              >
                <Sparkles className="size-3.5 text-[#D97757]/80 shrink-0" />
                <span>推荐选题</span>
                {visibleSuggestions.length > 0 && (
                  <span className="ml-0.5 rounded-full bg-[#D97757]/80 px-1.5 py-0.2 text-[9.5px] text-white font-medium">
                    {visibleSuggestions.length}
                  </span>
                )}
              </button>

              {/* 趋势变化：划入/Hover 展开母题/账号维度 Dropover 子选项 (次焦点 2) */}
              <div
                className="relative group"
                onMouseEnter={() => setCompPopoverOpen(true)}
                onMouseLeave={() => setCompPopoverOpen(false)}
              >
                <button
                  type="button"
                  onClick={() => {
                    setCompModalOpen(true);
                    setCompPopoverOpen(false);
                  }}
                  className={cn(
                    "flex items-center gap-1.5 text-[12px] font-medium transition-all cursor-pointer px-2.5 py-1.5 rounded-lg select-none",
                    compModalOpen
                      ? "bg-white text-zinc-800 font-semibold shadow-2xs border border-zinc-200/60"
                      : "text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100/60"
                  )}
                >
                  <BarChart3 className="size-3.5 text-zinc-500 shrink-0" />
                  <span>趋势变化</span>
                  <ChevronDown className="size-3 text-zinc-400 group-hover:rotate-180 transition-transform duration-200" />
                </button>

                <AnimatePresence>
                  {compPopoverOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 4, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 4, scale: 0.96 }}
                      transition={{ duration: 0.12 }}
                      className="absolute left-0 top-full pt-1.5 z-30 w-48"
                    >
                      <div className="bg-white rounded-2xl shadow-xl border border-zinc-200/90 p-1.5 space-y-1 text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            setComparisonDimension("topic");
                            setCompModalOpen(true);
                            setCompPopoverOpen(false);
                          }}
                          className={cn(
                            "flex w-full items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-all cursor-pointer text-left group/item",
                            comparisonDimension === "topic" ? "bg-zinc-100/90 text-zinc-900 font-semibold shadow-2xs" : "text-zinc-600 hover:bg-zinc-50"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <Layers className="size-3.5 text-zinc-500 group-hover/item:text-zinc-900 transition-colors shrink-0" />
                            <div className="flex flex-col">
                              <span className="font-semibold leading-tight">母题维度</span>
                              <span className="text-[10px] text-zinc-400 font-normal">统计母题爆款率</span>
                            </div>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setComparisonDimension("account");
                            setCompModalOpen(true);
                            setCompPopoverOpen(false);
                          }}
                          className={cn(
                            "flex w-full items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-all cursor-pointer text-left group/item",
                            comparisonDimension === "account" ? "bg-zinc-100/90 text-zinc-900 font-semibold shadow-2xs" : "text-zinc-600 hover:bg-zinc-50"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <User className="size-3.5 text-zinc-500 group-hover/item:text-zinc-900 transition-colors shrink-0" />
                            <div className="flex flex-col">
                              <span className="font-semibold leading-tight">账号维度</span>
                              <span className="text-[10px] text-zinc-400 font-normal">评估矩阵号播放</span>
                            </div>
                          </div>
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* 划入（Hover）即时展开的“三合一筛选与视图” Popover 入口 */}
            {activeTab === "pool" && (
              <div className="flex items-center gap-2">
                <div className="h-4 w-[1px] bg-zinc-200 shrink-0" />

                <div
                  className="relative group"
                  onMouseEnter={() => setFilterPopoverOpen(true)}
                  onMouseLeave={() => setFilterPopoverOpen(false)}
                >
                  <button
                    type="button"
                    onClick={() => setFilterPopoverOpen((prev) => !prev)}
                    className={cn(
                      "flex items-center gap-1.5 text-xs font-medium transition-all cursor-pointer h-8 px-3 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 shadow-2xs",
                      filterPopoverOpen && "border-zinc-300 bg-white text-zinc-900 font-semibold"
                    )}
                  >
                    <SlidersHorizontal className="size-3.5 text-zinc-500" />
                    <span>筛选与视图</span>
                    <ChevronDown className="size-3 text-zinc-400 transition-transform duration-200 group-hover:rotate-180" />
                  </button>

                  <AnimatePresence>
                    {filterPopoverOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 6, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6, scale: 0.96 }}
                        transition={{ duration: 0.15 }}
                        className="absolute left-0 top-full mt-1.5 z-30 w-[380px] bg-white rounded-xl shadow-md border border-zinc-200 p-4 space-y-4 text-xs"
                      >
                        {/* 分区 1：母题分类（4 列 2 行 4x2 胶囊矩阵，可多选与取消，不选即全选） */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-[11.5px] font-semibold text-zinc-400 uppercase tracking-wider">
                            <span>母题分类</span>
                            <span className="text-[11px] font-normal text-zinc-400">
                              {selectedTopicIds.length === 0 ? "默认全选" : `已指定 ${selectedTopicIds.length} 项`}
                            </span>
                          </div>
                          <div className="grid grid-cols-4 gap-1.5">
                            {topicsList.slice(0, 8).map((t) => {
                              const isSelected = selectedTopicIds.includes(t.id);
                              return (
                                <button
                                  key={t.id}
                                  type="button"
                                  onClick={() => handleToggleTopicId(t.id)}
                                  title={t.name}
                                  className={cn(
                                    "h-8 rounded-lg border text-[11.5px] font-medium transition-all cursor-pointer truncate px-0.5 text-center tracking-tight",
                                    isSelected
                                      ? "border-zinc-900 bg-zinc-900 text-white font-medium"
                                      : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100"
                                  )}
                                >
                                  {formatTopicName5(t.name)}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="h-[1px] bg-zinc-100" />

                        {/* 分区 2：排序方式（单行一字排开 4 项） */}
                        <div className="space-y-2">
                          <div className="text-[11.5px] font-semibold text-zinc-400 uppercase tracking-wider">
                            排序方式
                          </div>
                          <div className="grid grid-cols-4 gap-1.5">
                            {TOPIC_SORT_OPTIONS.map((opt) => (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => setSortBy(opt.id)}
                                className={cn(
                                  "h-8 rounded-lg border text-[11.5px] font-medium transition-all cursor-pointer text-center px-1",
                                  sortBy === opt.id
                                    ? "border-zinc-900 bg-zinc-900 text-white font-medium"
                                    : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100"
                                )}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="h-[1px] bg-zinc-100" />

                        {/* 分区 3：视图密度与分组结构 (在一行左右分开) */}
                        <div className="grid grid-cols-2 gap-3 pt-0.5">
                          <div className="space-y-1.5">
                            <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                              视图密度
                            </div>
                            <div className="flex items-center gap-1 bg-zinc-100 p-0.5 rounded-lg border border-zinc-200/50">
                              <button
                                type="button"
                                onClick={() => setViewDensity("grid")}
                                className={cn(
                                  "flex-1 h-7 rounded text-[11.5px] font-medium flex items-center justify-center gap-1 transition-all cursor-pointer",
                                  viewDensity === "grid" ? "bg-white text-zinc-900 shadow-2xs font-semibold" : "text-zinc-500 hover:text-zinc-800"
                                )}
                              >
                                <LayoutGrid className="size-3" />
                                <span>网格</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setViewDensity("compact")}
                                className={cn(
                                  "flex-1 h-7 rounded text-[11.5px] font-medium flex items-center justify-center gap-1 transition-all cursor-pointer",
                                  viewDensity === "compact" ? "bg-white text-zinc-900 shadow-2xs font-semibold" : "text-zinc-500 hover:text-zinc-800"
                                )}
                              >
                                <List className="size-3" />
                                <span>紧凑</span>
                              </button>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                              分组结构
                            </div>
                            <div className="flex items-center gap-1 bg-zinc-100 p-0.5 rounded-lg border border-zinc-200/50">
                              <button
                                type="button"
                                onClick={() => setGroupBy("none")}
                                className={cn(
                                  "flex-1 h-7 rounded text-[11.5px] font-medium flex items-center justify-center gap-1 transition-all cursor-pointer",
                                  groupBy === "none" ? "bg-white text-zinc-900 shadow-2xs font-semibold" : "text-zinc-500 hover:text-zinc-800"
                                )}
                              >
                                <span>平铺</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setGroupBy("topic")}
                                className={cn(
                                  "flex-1 h-7 rounded text-[11.5px] font-medium flex items-center justify-center gap-1 transition-all cursor-pointer",
                                  groupBy === "topic" ? "bg-white text-zinc-900 shadow-2xs font-semibold" : "text-zinc-500 hover:text-zinc-800"
                                )}
                              >
                                <Layers className="size-3" />
                                <span>母题分组</span>
                              </button>
                            </div>
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
                  <div className="absolute left-2.5 top-2 z-10 text-zinc-400 group-hover:text-[#D97757] transition-colors pointer-events-none">
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
                      "h-8.5 rounded-xl border border-zinc-200/90 bg-zinc-50/80 pl-8 pr-7 text-xs text-zinc-800 placeholder-zinc-400 outline-none focus:border-[#D97757] focus:bg-white transition-all duration-300 ease-out w-full shadow-2xs",
                      searchQuery || isSearchFocused ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100 cursor-pointer"
                    )}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 top-2.5 z-10 text-zinc-400 hover:text-zinc-700"
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
                    : "border-zinc-200/80 bg-zinc-50/60 text-zinc-600"
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
                            : "bg-zinc-300/60"
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
                  className="flex flex-col items-center justify-center p-12 border border-dashed border-zinc-200 bg-white rounded-2xl space-y-3 text-center"
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
                                <span className="text-[14px] font-semibold text-zinc-800 group-hover:text-zinc-950 transition-colors">
                                  {group.topicName}
                                </span>
                                <span className="text-[11.5px] text-zinc-400 font-normal tabular-nums">
                                  ({group.items.length})
                                </span>
                              </div>
                              <div className="flex items-center gap-1 text-[11.5px] text-zinc-400 group-hover:text-zinc-600 transition-colors">
                                <span className="hidden sm:inline">{isCollapsed ? "展开" : "收起"}</span>
                                {isCollapsed ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
                              </div>
                            </div>

                            {!isCollapsed && (
                              viewDensity === "compact" ? (
                                <div className="rounded-2xl border border-zinc-200/80 bg-white overflow-hidden shadow-2xs divide-y divide-zinc-100">
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
                      <div className="rounded-2xl border border-zinc-200/80 bg-white overflow-hidden shadow-2xs divide-y divide-zinc-100">
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
                        className="h-9 px-6 rounded-xl border-zinc-200 text-[13px] font-medium"
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
            <DialogTitle className="text-zinc-900 text-[15px] font-semibold flex items-center gap-2">
              <ArrowRightLeft className="size-4 text-[#D97757]" />
              <span>候选位已满 (5/5) · 请选择替换</span>
            </DialogTitle>
            <DialogDescription className="text-zinc-500 text-[12.5px]">
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
                      : "border-zinc-200/80 bg-white hover:bg-zinc-50"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[13px] font-semibold text-zinc-900 truncate">{item.title}</span>
                      {isOldest && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-[#C9604D]/15 px-2 py-0.2 text-[10px] font-bold text-[#C9604D] shrink-0">
                          <Clock className="size-3" />
                          挂机最久 · 建议替换
                        </span>
                      )}
                    </div>
                    {isSelected && <Check className="size-4 text-[#D97757] shrink-0 stroke-[2.5]" />}
                  </div>

                  <div className="flex items-center justify-between text-[11.5px] text-zinc-500">
                    <span>状态：已认领 {days} 天 · 尚未提交作品</span>
                    {item.topic_groups && (
                      <span className="text-zinc-400">{item.topic_groups.name}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-100">
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
            <DialogTitle className="text-zinc-900 text-[15px] font-semibold flex items-center gap-2">
              <Sparkles className="size-4 text-[#D97757]" />
              <span>微调选题并采纳入库</span>
            </DialogTitle>
            <DialogDescription className="text-zinc-500 text-[12.5px]">
              可在入库前修改选题标题或更改归属的分类母题。
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleConfirmAdopt} className="space-y-3.5 mt-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-700">选题标题 *</label>
              <input
                type="text"
                required
                value={tuneTitle}
                onChange={(e) => setTuneTitle(e.target.value)}
                className="w-full h-9 rounded-xl border border-zinc-200 px-3 text-xs outline-none focus:border-[#D97757]"
              />
            </div>

            {topicsList.length > 0 && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-700">归属分类母题</label>
                <select
                  value={tuneTopicId}
                  onChange={(e) => setTuneTopicId(e.target.value)}
                  className="w-full h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs outline-none focus:border-[#D97757]"
                >
                  {topicsList.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}

            {adoptingRec?.angle && (
              <div className="rounded-xl bg-zinc-50 p-3 border border-zinc-200/60 text-xs text-zinc-600 space-y-0.5">
                <span className="font-semibold text-zinc-800">原推荐切入角度：</span>
                <p>“{adoptingRec.angle}”</p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100">
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

      {/* 沉浸式“推荐选题”大弹窗 (黄金视口 max-w-[960px], 2张一行) */}
      <Dialog open={recModalOpen} onOpenChange={setRecModalOpen}>
        <DialogContent className="!max-w-[960px] sm:!max-w-[960px] w-[92vw] max-h-[86vh] overflow-y-auto rounded-2xl p-6 bg-white border border-zinc-200/90 shadow-xl space-y-4">
          <DialogHeader className="pb-1 space-y-1">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4.5 text-[#D97757]" />
                <DialogTitle className="text-base font-semibold text-zinc-900">推荐选题</DialogTitle>
              </div>
              {recData && (
                <div className="flex items-center gap-3 text-[11.5px] text-zinc-400 font-normal">
                  {typeof recData.sampleCount === "number" && recData.sampleCount > 0 && <span>样本数: {recData.sampleCount} 条</span>}
                  {recData.marketDate && <span>热点日期: {recData.marketDate}</span>}
                </div>
              )}
            </div>
            <DialogDescription className="text-[12px] text-zinc-500 font-normal leading-relaxed text-left">
              {recData?.evidenceSummary
                ? `推荐依据：${recData.evidenceSummary}`
                : "基于团队全网爆款视频样本与数据趋势生成的选题提炼。采纳后将自动转换为正式子题放入选题池。"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">

            {loadingRecommendations ? (
              <TopicPoolSkeleton />
            ) : visibleSuggestions.length === 0 ? (
              <div className="py-12 text-center border border-dashed border-zinc-200 rounded-xl bg-white space-y-2">
                <EmptyState title="暂无推荐选题" description="先积累更多作品数据，AI 将持续学习并自动生成复刻建议。" />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4.5">
                {visibleSuggestions.map((rec) => {
                  const key = getRecommendationKey(rec);
                  return (
                    <div
                      key={key}
                      className="flex flex-col justify-between rounded-xl border border-zinc-200/90 bg-white p-4.5 transition-colors hover:border-zinc-300 shadow-2xs min-w-0"
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="rounded bg-zinc-100 px-2.5 py-0.5 text-[11px] font-semibold text-zinc-700 whitespace-nowrap shrink-0">
                            {rec.category || "爆款推荐"}
                          </span>
                          {rec.expectedPerformance && (
                            <span className="text-[11px] font-normal text-zinc-500 bg-zinc-100/70 px-2 py-0.5 rounded whitespace-nowrap shrink-0">
                              预期表现: {rec.expectedPerformance}
                            </span>
                          )}
                        </div>

                        <h3 className="text-[14.5px] font-semibold text-zinc-900 leading-snug">{rec.title}</h3>

                        {rec.angle && (
                          <div className="border-l-2 border-zinc-300 pl-3 py-0.5 text-[12px] text-zinc-600 leading-relaxed">
                            <span className="font-medium text-zinc-800 block mb-0.5">切入角度：</span>
                            “{rec.angle}”
                          </div>
                        )}

                        {rec.evidence && (
                          <div className="text-[11.5px] text-zinc-500 flex items-start gap-1">
                            <Info className="size-3.5 text-zinc-400 shrink-0 mt-0.5" />
                            <span>依据：{rec.evidence}</span>
                          </div>
                        )}

                        {rec.referenceVideos && rec.referenceVideos.length > 0 && (
                          <div className="space-y-1.5 pt-1">
                            <span className="text-[11px] font-normal text-zinc-400 flex items-center gap-1">
                              <Film className="size-3 text-zinc-400" />
                              参考视频 ({rec.referenceVideos.length})
                            </span>
                            <div className="space-y-1">
                              {rec.referenceVideos.slice(0, 2).map((vid, idx) => {
                                const playVal = vid.playCount24h ?? vid.playCount;
                                return (
                                  <div key={idx} className="flex items-center justify-between text-[11px] text-zinc-600 bg-zinc-50/80 px-2 py-1 rounded">
                                    <span className="truncate max-w-[200px]">{vid.title || "爆款原片"}</span>
                                    {playVal !== undefined && (
                                      <span className="text-zinc-400 tabular-nums">
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

                      <div className="mt-3 flex items-center justify-end gap-2 pt-1">
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => setIgnoredRecKeys((prev) => new Set(prev).add(key))}
                          className="h-7 text-zinc-400 hover:text-zinc-600 text-[12px]"
                        >
                          忽略
                        </Button>
                        <Button
                          size="xs"
                          onClick={() => handleOpenAdoptModal(rec, key)}
                          className="h-7 px-3 bg-[#D97757] hover:bg-[#C46A4D] text-white font-medium rounded-lg text-[12px] cursor-pointer"
                        >
                          采纳微调
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 沉浸式“趋势变化”大弹窗 (精细视口 max-w-[1040px]) */}
      <Dialog open={compModalOpen} onOpenChange={setCompModalOpen}>
        <DialogContent className="!max-w-[1040px] sm:!max-w-[1040px] w-[92vw] max-h-[86vh] overflow-y-auto rounded-2xl p-6 bg-white border border-zinc-200 shadow-xl space-y-4.5">
          <DialogHeader className="flex flex-row items-center justify-between border-b border-zinc-100 pb-3.5">
            <div className="flex items-center gap-2">
              <BarChart3 className="size-4.5 text-zinc-900" />
              <DialogTitle className="text-base font-semibold text-zinc-900">趋势变化</DialogTitle>
            </div>
          </DialogHeader>

          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-2xs">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1 bg-zinc-100 p-0.5 rounded-lg border border-zinc-200/50">
                  <button
                    onClick={() => setComparisonDimension("topic")}
                    className={cn(
                      "px-3 py-1 text-[12px] font-medium rounded-md cursor-pointer transition-all",
                      comparisonDimension === "topic" ? "bg-white text-zinc-900 font-semibold shadow-2xs" : "text-zinc-500"
                    )}
                  >
                    母题维度
                  </button>
                  <button
                    onClick={() => setComparisonDimension("account")}
                    className={cn(
                      "px-3 py-1 text-[12px] font-medium rounded-md cursor-pointer transition-all",
                      comparisonDimension === "account" ? "bg-white text-zinc-900 font-semibold shadow-2xs" : "text-zinc-500"
                    )}
                  >
                    账号维度
                  </button>
                </div>

                {comparisonDimension === "account" && topicsList.length > 0 && (
                  <div className="flex items-center gap-1.5 text-[12px]">
                    <span className="text-zinc-500 font-medium">对比母题：</span>
                    <select
                      value={comparisonTopicId}
                      onChange={(e) => setComparisonTopicId(e.target.value)}
                      className="h-7.5 rounded-lg border border-zinc-200 bg-white px-2 text-[12px] text-zinc-800 outline-none focus:border-[#5F82A8]"
                    >
                      {topicsList.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1.5 text-[12px]">
                <Calendar className="size-3.5 text-zinc-400" />
                <span className="text-zinc-500 font-medium">时间筛选：</span>
                <select
                  value={comparisonDays}
                  onChange={(e) => setComparisonDays(Number(e.target.value))}
                  className="h-7.5 rounded-lg border border-zinc-200 bg-white px-2 text-[12px] outline-none"
                >
                  <option value={7}>近 7 天</option>
                  <option value={14}>近 14 天</option>
                  <option value={30}>近 30 天</option>
                </select>
              </div>
            </div>

            {comparisonRows.length > 0 && (
              <div className="rounded-xl bg-zinc-100/70 p-3.5 border border-zinc-200/50 text-[12px] text-zinc-700 flex items-center gap-1.5">
                <Info className="size-4 text-[#5F82A8] shrink-0" />
                <span>
                  对比数据解读：基于当前列表分布中位数（达标率中位数：{(comparisonMedians.qualifiedRateMedian * 100).toFixed(1)}%，均播中位数：{comparisonMedians.avgPlayMedian.toLocaleString()}）。低于中位数标绿，高于中位数标红。
                </span>
              </div>
            )}

            {loadingComparison ? (
              <TopicPoolSkeleton />
            ) : comparisonRows.length === 0 ? (
              <div className="py-12 text-center border border-dashed border-zinc-200 rounded-2xl bg-white space-y-2">
                <EmptyState title="暂无对比样本" description="当前筛选条件下缺少足够的作品发布样本。" />
              </div>
            ) : (
              <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[13px]">
                    <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-medium">
                      <tr>
                        <th className="py-3.5 px-6">{comparisonDimension === "topic" ? "母题分类" : "账号名称"}</th>
                        <th className="py-3.5 px-6">作品样本数</th>
                        <th className="py-3.5 px-6">爆款达标率</th>
                        <th className="py-3.5 px-6">平均播放量</th>
                        <th className="py-3.5 px-6">最高播放量</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
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
                          <tr key={rowKey} className={cn("hover:bg-zinc-50/60", isLowConfidence && "opacity-70 bg-zinc-50/30")}>
                            <td className="py-3.5 px-6 font-semibold text-zinc-900 flex items-center gap-1.5">
                              <span className={cn(isLowConfidence && "text-zinc-500")}>{name}</span>
                              {isLowConfidence && (
                                <span className="rounded bg-zinc-200 px-1.5 py-0.2 text-[10px] text-zinc-500 font-normal shrink-0">
                                  样本少仅供参考
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-6 tabular-nums text-zinc-700">{row.workCount} 条</td>
                            <td className="py-3.5 px-6 font-semibold tabular-nums">
                              <span className={isRateHigher ? "text-[#C9604D]" : "text-[#6FAA7D]"}>
                                {(row.qualifiedRate * 100).toFixed(1)}%
                              </span>
                            </td>
                            <td className="py-3.5 px-6 font-semibold tabular-nums">
                              <span className={isPlayHigher ? "text-[#C9604D]" : "text-[#6FAA7D]"}>
                                {row.avgPlayCount >= 10000 ? `${(row.avgPlayCount / 10000).toFixed(1)}w` : row.avgPlayCount.toLocaleString()}
                              </span>
                            </td>
                            <td className="py-3.5 px-6 tabular-nums text-zinc-800">
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
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
