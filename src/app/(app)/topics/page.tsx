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

export type ActiveView =
  | "trending"        // 1 推荐选题（近期高热 + AI 建议两段式）
  | "high_potential"  // 2 高潜待挖
  | "never_worked"    // 3 从未做过
  | "my_claims"       // 4 脚本中
  | "all"             // 5 全部选题
  | "my_created"      // 6 个人选题
  | "comparison";     // 7 趋势变化

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

  // 7 扁平智能 Tab 视角
  const [activeView, setActiveView] = useState<ActiveView>("trending");

  // 筛选与 Popover 控制状态
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  const [recDropdownOpen, setRecDropdownOpen] = useState(false);
  const [libDropdownOpen, setLibDropdownOpen] = useState(false);
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

  // 视图基础过滤与分页状态
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

  // 系统推荐 state
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

  // 横向对比 state
  const [comparisonDimension, setComparisonDimension] = useState<"topic" | "account">("topic");
  const [comparisonDays, setComparisonDays] = useState<number>(30);
  const [comparisonTopicId, setComparisonTopicId] = useState<string>("");
  const [comparisonRows, setComparisonRows] = useState<ComparisonRow[]>([]);
  const [loadingComparison, setLoadingComparison] = useState(false);

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
    const validViews: ActiveView[] = ["trending", "high_potential", "never_worked", "my_claims", "all", "my_created", "comparison"];
    if (urlView && validViews.includes(urlView as ActiveView)) {
      setActiveView(urlView as ActiveView);
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

  // 获取各 Tab 最佳 PageSize
  const getPageSize = useCallback((view: ActiveView): number => {
    if (view === "trending" || view === "high_potential") return 8;
    if (view === "never_worked") return 20;
    return 50;
  }, []);

  // 加载选题池数据
  const fetchPoolData = useCallback(async (page: number, append = false, targetView?: ActiveView) => {
    const viewToFetch = targetView || activeView;
    if (viewToFetch === "comparison") return true;

    if (page === 1) setLoading(true);
    else setLoadingMore(true);
    if (page === 1) setPoolError(null);

    try {
      const params = new URLSearchParams();
      params.append("view", viewToFetch);
      params.append("time_range", "1m");
      params.append("page", String(page));
      params.append("page_size", String(getPageSize(viewToFetch)));

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
  }, [activeView, getPageSize, selectedTopicIds]);

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
      fetchPoolData(1, false, activeView),
      fetchMyClaims(),
      fetchRecommendations(),
      activeView === "comparison" ? fetchComparison() : Promise.resolve()
    ]);
  }, [activeView, fetchComparison, fetchMyClaims, fetchPoolData, fetchRecommendations]);

  useEffect(() => {
    if (activeView === "comparison") {
      void fetchComparison();
    } else {
      void fetchPoolData(1, false, activeView);
    }
    void fetchMyClaims();
    if (activeView === "trending") {
      void fetchRecommendations();
    }
  }, [activeView, selectedTopicIds, fetchComparison, fetchMyClaims, fetchPoolData, fetchRecommendations]);

  useEffect(() => {
    const handleRefresh = () => {
      void loadAll();
    };
    window.addEventListener("refresh-topics", handleRefresh);
    return () => window.removeEventListener("refresh-topics", handleRefresh);
  }, [loadAll]);

  // 触发 5/5 认领上限替换弹窗
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
      setActiveView("trending");
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
    const succeeded = await fetchPoolData(nextPage, true, activeView);
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
      result.sort((a, b) => (b._avgPlayCount ?? b.summary.averagePlayCount ?? 0) - (a._avgPlayCount ?? a.summary.averagePlayCount ?? 0));
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

  // 折叠母题偏好持久化
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

  const getEmptyStateProps = useCallback((view: ActiveView) => {
    switch (view) {
      case "trending":
        return {
          title: "最近 30 天还没有作品数据",
          description: "先发几条视频，积累数据后这里会自动出现推荐。"
        };
      case "high_potential":
        return {
          title: "暂无沉睡的高潜选题",
          description: "最近 30 天内所有有历史作品的选题都还在活跃期。"
        };
      case "never_worked":
        return {
          title: "所有选题均已有作品",
          description: "选题库里所有选题都已经有作品了，继续录入新灵感吧。"
        };
      case "my_claims":
        return {
          title: "暂无脚本中的选题",
          description: "你还没有认领任何选题，去「推荐选题」或「全部选题」中认领吧。"
        };
      case "my_created":
        return {
          title: "暂无个人录入选题",
          description: "你还没有录入过个人选题，点击右上角「录入选题」开始添加吧。"
        };
      default:
        return {
          title: "暂无相关选题",
          description: "当前筛选条件下没有查找到符合要求的选题。"
        };
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* 错误提示栏 */}
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
            className="flex items-center justify-between rounded-xl border border-[#D97757]/25 bg-[#D97757]/5 px-4 py-2.5 text-[12.5px] text-zinc-700"
          >
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="size-4 shrink-0 text-[#D97757]" />
              <span>认领状态加载失败：{claimsError}</span>
            </div>
            <Button size="xs" variant="outline" onClick={() => void fetchMyClaims()} className="h-7 text-[12px]">
              <RefreshCw className="size-3 mr-1" />
              重新加载认领状态
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* L1 工作区主面板 */}
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 md:p-6 shadow-xs space-y-6">
        {/* 控制台顶栏：7 扁平智能 Tab 控制器 */}
        <div className="flex items-center justify-between gap-4 pb-1 flex-wrap">
          {/* 左侧：7 扁平 Tab + 筛选 + 搜索 */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* 4 胶囊折叠智能分段控制器 */}
            <div className="flex items-center gap-1 bg-zinc-100/90 p-1 rounded-xl border border-zinc-200/80 shadow-2xs relative">
              {/* 胶囊 1：推荐/智能选题 ▾ (滑入展开 / 防断连桥) */}
              <div
                className="relative group/rec"
                onMouseEnter={() => setRecDropdownOpen(true)}
                onMouseLeave={() => setRecDropdownOpen(false)}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (activeView === "trending") setActiveView("high_potential");
                    else if (activeView === "high_potential") setActiveView("never_worked");
                    else setActiveView("trending");
                    setCurrentPage(1);
                  }}
                  className={cn(
                    "relative flex items-center gap-1 text-[13px] transition-all cursor-pointer px-3 py-1.5 rounded-lg select-none whitespace-nowrap z-10 font-medium",
                    ["trending", "high_potential", "never_worked"].includes(activeView)
                      ? "text-zinc-950 font-bold bg-white shadow-2xs border border-zinc-200/90"
                      : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200"
                  )}
                >
                  <Sparkles className={cn("size-3.5 shrink-0 transition-colors", ["trending", "high_potential", "never_worked"].includes(activeView) ? "text-[#D97757]" : "text-zinc-400")} />
                  <span>
                    {activeView === "trending" && "推荐选题"}
                    {activeView === "high_potential" && "高潜待挖"}
                    {activeView === "never_worked" && "从未做过"}
                    {!["trending", "high_potential", "never_worked"].includes(activeView) && "推荐选题"}
                  </span>
                  <ChevronDown className={cn("size-3 text-zinc-400 ml-0.5 transition-transform duration-200", recDropdownOpen && "rotate-180 text-zinc-700")} />
                </button>

                <AnimatePresence>
                  {recDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 4, scale: 0.96 }}
                      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                      className="absolute left-0 top-full pt-2 z-30 w-52 before:absolute before:inset-x-0 before:-top-2 before:h-4 before:z-[-1]"
                    >
                      <div className="bg-white/98 rounded-2xl shadow-xl shadow-zinc-950/10 border border-zinc-200/90 p-1.5 space-y-1 text-xs backdrop-blur-md">
                        <div className="px-2 py-1 text-[10px] font-semibold text-zinc-400 tracking-wider flex items-center justify-between border-b border-zinc-100 pb-1.5 mb-1">
                          <span>✨ 智能推荐视角</span>
                        </div>
                        {[
                          { id: "trending", label: "推荐选题", desc: "近期高热作品", icon: Sparkles },
                          { id: "high_potential", label: "高潜待挖", desc: "沉睡爆款潜力", icon: Compass },
                          { id: "never_worked", label: "从未做过", desc: "全新灵感储备", icon: Plus }
                        ].map((opt) => {
                          const Icon = opt.icon;
                          const isAct = activeView === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => {
                                setActiveView(opt.id as ActiveView);
                                setCurrentPage(1);
                                setRecDropdownOpen(false);
                              }}
                              className={cn(
                                "w-full flex items-center justify-between p-2 rounded-xl text-left transition-all duration-150 cursor-pointer group/item border",
                                isAct
                                  ? "bg-zinc-100/90 border-zinc-200/90 text-zinc-950 font-bold shadow-2xs"
                                  : "bg-transparent border-transparent text-zinc-600 hover:bg-zinc-100/90 hover:border-zinc-200/80 hover:shadow-xs hover:text-zinc-950"
                              )}
                            >
                              <div className="flex items-center gap-2">
                                <div className={cn(
                                  "p-1 rounded-md transition-all duration-150 border border-transparent",
                                  isAct
                                    ? "bg-white text-[#D97757] shadow-2xs border-zinc-200/80 font-bold"
                                    : "bg-zinc-100 text-zinc-400 group-hover/item:bg-white group-hover/item:text-zinc-800 group-hover/item:shadow-2xs group-hover/item:border-zinc-200/80"
                                )}>
                                  <Icon className="size-3.5" />
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-[12.5px] leading-tight font-medium group-hover/item:font-semibold">{opt.label}</span>
                                  <span className="text-[10px] text-zinc-400 font-normal leading-tight mt-0.5 group-hover/item:text-zinc-500">{opt.desc}</span>
                                </div>
                              </div>
                              {isAct && <Check className="size-3.5 text-[#D97757] stroke-[2.5]" />}
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* 胶囊 2：全部/个人选题 ▾ (加深冷灰 Hover 区分度) */}
              <div
                className="relative group/lib"
                onMouseEnter={() => setLibDropdownOpen(true)}
                onMouseLeave={() => setLibDropdownOpen(false)}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (activeView === "all") setActiveView("my_created");
                    else setActiveView("all");
                    setCurrentPage(1);
                  }}
                  className={cn(
                    "relative flex items-center gap-1 text-[13px] transition-all cursor-pointer px-3 py-1.5 rounded-lg select-none whitespace-nowrap z-10 font-medium",
                    ["all", "my_created"].includes(activeView)
                      ? "text-zinc-950 font-bold bg-white shadow-2xs border border-zinc-200/90"
                      : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200"
                  )}
                >
                  <LayoutGrid className={cn("size-3.5 shrink-0 transition-colors", ["all", "my_created"].includes(activeView) ? "text-[#D97757]" : "text-zinc-400")} />
                  <span>
                    {activeView === "all" && "全部选题"}
                    {activeView === "my_created" && "个人选题"}
                    {!["all", "my_created"].includes(activeView) && "全部选题"}
                  </span>
                  <ChevronDown className={cn("size-3 text-zinc-400 ml-0.5 transition-transform duration-200", libDropdownOpen && "rotate-180 text-zinc-700")} />
                </button>

                <AnimatePresence>
                  {libDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 4, scale: 0.96 }}
                      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                      className="absolute left-0 top-full pt-2 z-30 w-52 before:absolute before:inset-x-0 before:-top-2 before:h-4 before:z-[-1]"
                    >
                      <div className="bg-white/98 rounded-2xl shadow-xl shadow-zinc-950/10 border border-zinc-200/90 p-1.5 space-y-1 text-xs backdrop-blur-md">
                        <div className="px-2 py-1 text-[10px] font-semibold text-zinc-400 tracking-wider flex items-center justify-between border-b border-zinc-100 pb-1.5 mb-1">
                          <span>📂 选题库范围</span>
                        </div>
                        {[
                          { id: "all", label: "全部选题", desc: "全站公开优质库", icon: LayoutGrid },
                          { id: "my_created", label: "个人选题", desc: "我创作录入的选题", icon: Film }
                        ].map((opt) => {
                          const Icon = opt.icon;
                          const isAct = activeView === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => {
                                setActiveView(opt.id as ActiveView);
                                setCurrentPage(1);
                                setLibDropdownOpen(false);
                              }}
                              className={cn(
                                "w-full flex items-center justify-between p-2 rounded-xl text-left transition-all duration-150 cursor-pointer group/item border",
                                isAct
                                  ? "bg-zinc-100/90 border-zinc-200/90 text-zinc-950 font-bold shadow-2xs"
                                  : "bg-transparent border-transparent text-zinc-600 hover:bg-zinc-100/90 hover:border-zinc-200/80 hover:shadow-xs hover:text-zinc-950"
                              )}
                            >
                              <div className="flex items-center gap-2">
                                <div className={cn(
                                  "p-1 rounded-md transition-all duration-150 border border-transparent",
                                  isAct
                                    ? "bg-white text-[#D97757] shadow-2xs border-zinc-200/80 font-bold"
                                    : "bg-zinc-100 text-zinc-400 group-hover/item:bg-white group-hover/item:text-zinc-800 group-hover/item:shadow-2xs group-hover/item:border-zinc-200/80"
                                )}>
                                  <Icon className="size-3.5" />
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-[12.5px] leading-tight font-medium group-hover/item:font-semibold">{opt.label}</span>
                                  <span className="text-[10px] text-zinc-400 font-normal leading-tight mt-0.5 group-hover/item:text-zinc-500">{opt.desc}</span>
                                </div>
                              </div>
                              {isAct && <Check className="size-3.5 text-[#D97757] stroke-[2.5]" />}
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* 胶囊 3：脚本中 (独立认领切态) */}
              <button
                type="button"
                onClick={() => {
                  setActiveView("my_claims");
                  setCurrentPage(1);
                  setRecDropdownOpen(false);
                  setLibDropdownOpen(false);
                }}
                className={cn(
                  "relative flex items-center gap-1.5 text-[13px] transition-all cursor-pointer px-3 py-1.5 rounded-lg select-none whitespace-nowrap font-medium",
                  activeView === "my_claims"
                    ? "text-zinc-950 font-bold bg-white shadow-2xs border border-zinc-200/90"
                    : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200"
                )}
              >
                <Clock className={cn("size-3.5 shrink-0", activeView === "my_claims" ? "text-[#D97757]" : "text-zinc-400")} />
                <span>脚本中</span>
              </button>

              {/* 胶囊 4：趋势变化 (独立分析切态) */}
              <button
                type="button"
                onClick={() => {
                  setActiveView("comparison");
                  setCurrentPage(1);
                  setRecDropdownOpen(false);
                  setLibDropdownOpen(false);
                }}
                className={cn(
                  "relative flex items-center gap-1.5 text-[13px] transition-all cursor-pointer px-3 py-1.5 rounded-lg select-none whitespace-nowrap font-medium",
                  activeView === "comparison"
                    ? "text-zinc-950 font-bold bg-white shadow-2xs border border-zinc-200/90"
                    : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200"
                )}
              >
                <BarChart3 className={cn("size-3.5 shrink-0", activeView === "comparison" ? "text-[#D97757]" : "text-zinc-400")} />
                <span>趋势变化</span>
              </button>
            </div>

            {/* 筛选与搜索 (非趋势变化页展示) */}
            {activeView !== "comparison" && (
              <div className="flex items-center gap-2">
                <div className="h-4 w-[1px] bg-zinc-200 shrink-0" />

                {/* “筛选与视图” Popover 入口 */}
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
                        {/* 母题分类 */}
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

                        {/* 排序方式 */}
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

                        {/* 视图密度与分组结构 */}
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

                {/* 搜索框 */}
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

          {/* 右侧：5位动态点阵候选位 + 录入选题主 CTA */}
          <div className="flex items-center gap-4">
            {activeView !== "comparison" && (
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

        {/* 智能 Tab 主内容展现区 */}
        {activeView === "comparison" ? (
          /* Tab 7：趋势变化 */
          <div className="space-y-5 pt-2">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 shadow-2xs">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-zinc-200/80 shadow-2xs">
                  <button
                    onClick={() => setComparisonDimension("topic")}
                    className={cn(
                      "px-3 py-1 text-[12px] font-medium rounded-md cursor-pointer transition-all",
                      comparisonDimension === "topic" ? "bg-zinc-900 text-white font-semibold shadow-2xs" : "text-zinc-500 hover:text-zinc-800"
                    )}
                  >
                    母题维度
                  </button>
                  <button
                    onClick={() => setComparisonDimension("account")}
                    className={cn(
                      "px-3 py-1 text-[12px] font-medium rounded-md cursor-pointer transition-all",
                      comparisonDimension === "account" ? "bg-zinc-900 text-white font-semibold shadow-2xs" : "text-zinc-500 hover:text-zinc-800"
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
        ) : (
          /* Tab 1-6 子题卡片列表 */
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
                  <EmptyState {...getEmptyStateProps(activeView)} />
                  {activeView === "never_worked" && (
                    <Button size="sm" onClick={() => triggerGlobalTopicCreate()} className="bg-[#D97757] text-white">
                      <Plus className="size-4 mr-1" />
                      录入选题
                    </Button>
                  )}
                </motion.div>
              ) : (
                <motion.div key="content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                  {/* 近期高热 / 高潜 / 从未做过 Header 提示语 */}
                  {activeView === "trending" && (
                    <div className="flex items-center gap-2 text-xs text-zinc-500 pb-1">
                      <span className="font-semibold text-zinc-800">近期高热选题</span>
                      <span>· 最近 30 天表现优异的团队选题方向</span>
                    </div>
                  )}
                  {activeView === "high_potential" && (
                    <div className="flex items-center gap-2 text-xs text-zinc-500 pb-1">
                      <span className="font-semibold text-zinc-800">高潜沉睡选题</span>
                      <span>· 30 天以上未发新作品但历史表现突出的机会选题</span>
                    </div>
                  )}
                  {activeView === "never_worked" && (
                    <div className="flex items-center gap-2 text-xs text-zinc-500 pb-1">
                      <span className="font-semibold text-zinc-800">从未做过选题</span>
                      <span>· 选题库中尚无任何关联作品的储备灵感</span>
                    </div>
                  )}

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
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 w-full">
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
                        {/* 统一工整单行模式表头 */}
                        <div className="flex h-8 items-center justify-between gap-3 px-3 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider bg-zinc-50/80 border-b border-zinc-200/80 select-none">
                          <div className="w-[84px] shrink-0">状态/认领</div>
                          <div className="flex-1 min-w-0">选题标题与黄金切口</div>
                          <div className="w-[120px] shrink-0">母题与标签</div>
                          <div className="w-[110px] shrink-0 text-end">均播 / 热度</div>
                          <div className="w-7 shrink-0 text-end">详情</div>
                        </div>

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
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 w-full">
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

            {/* Tab 1 下半区：AI 选题建议 (两段式布局) */}
            {activeView === "trending" && (
              <div className="pt-6 border-t border-zinc-200/80 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4.5 text-[#D97757]" />
                    <h2 className="text-[15px] font-semibold text-zinc-900">
                      AI 建议 <span className="text-[12.5px] font-normal text-zinc-500">（基于近期爆款样本生成，尚未入库）</span>
                    </h2>
                  </div>
                  {recData?.evidenceSummary && (
                    <span className="text-[12px] text-zinc-400 font-normal">
                      {recData.evidenceSummary}
                    </span>
                  )}
                </div>

                {loadingRecommendations ? (
                  <TopicPoolSkeleton />
                ) : visibleSuggestions.length === 0 ? (
                  <div className="py-8 text-center border border-dashed border-zinc-200 rounded-xl bg-zinc-50/50 space-y-1">
                    <p className="text-xs text-zinc-500">暂无 AI 建议，系统在积累更多爆款样本后会自动为你提炼新创意。</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {visibleSuggestions.map((rec) => {
                      const key = getRecommendationKey(rec);
                      return (
                        <div
                          key={key}
                          className="flex flex-col justify-between rounded-xl border border-zinc-200/90 bg-[#FBF9F7] border-l-2 border-l-[#D97757] p-4 transition-all hover:border-zinc-300 hover:shadow-xs min-w-0"
                        >
                          <div className="space-y-2.5">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="rounded bg-[#D97757]/10 text-[#D97757] px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap shrink-0">
                                {rec.category || "爆款推荐"}
                              </span>
                              {rec.expectedPerformance && (
                                <span className="text-[11px] font-normal text-zinc-500 bg-white/80 px-2 py-0.5 rounded border border-zinc-200/60 whitespace-nowrap shrink-0">
                                  预期表现: {rec.expectedPerformance}
                                </span>
                              )}
                            </div>

                            <h3 className="text-[14.5px] font-semibold text-zinc-900 leading-snug">{rec.title}</h3>

                            {rec.angle && (
                              <div className="border-l-2 border-zinc-300/80 pl-3 py-0.5 text-[12px] text-zinc-600 leading-relaxed">
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
                          </div>

                          <div className="mt-3 flex items-center justify-end gap-2 pt-2 border-t border-zinc-200/40">
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
            )}
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

      {/* 5/5 满额替换决策 Dialog */}
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
    </div>
  );
}
