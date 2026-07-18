"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { SubTopicCard, type SubTopicItem, type SubTopicClaim } from "@/components/topics/sub-topic-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  ChevronDown,
  ChevronUp,
  Filter,
  Calendar,
  Layers,
  Compass,
  CheckCircle,
  RefreshCw
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface TopicInfo {
  id: string;
  name: string;
  sort_order: number;
}

type TopicPoolRequest = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function fetchTopicPoolResponse(
  url: string,
  request: TopicPoolRequest = fetch,
) {
  const response = await request(url);
  const payload = await response.json();
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload
      ? String((payload as { error?: unknown }).error || "获取选题池数据失败")
      : "获取选题池数据失败";
    throw new Error(message);
  }
  return payload;
}

export function resolvePageAfterLoad(currentPage: number, succeeded: boolean) {
  return succeeded ? currentPage + 1 : currentPage;
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

function handleKeyboardActivation(event: React.KeyboardEvent, action: () => void) {
  if (event.target !== event.currentTarget) return;
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  action();
}

export default function TopicPoolPage() {
  const [items, setItems] = useState<SubTopicItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [poolError, setPoolError] = useState<string | null>(null);
  const [topicsList, setTopicsList] = useState<TopicInfo[]>([]);
  const [topicsError, setTopicsError] = useState<string | null>(null);
  
  // 筛选状态
  const [currentView, setCurrentView] = useState<"all" | "my_claims" | "my_created">("all");
  const [timeRange, setTimeRange] = useState<"3d" | "1w" | "1m" | "3m">("1m");
  const [selectedTopicId, setSelectedTopicId] = useState<string>("__all__");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  // 认领上限校验辅助
  // /api/topics/pool?view=my_claims 返回的是子题列表，不是认领记录
  const [myClaims, setMyClaims] = useState<SubTopicItem[]>([]);
  const [claimsError, setClaimsError] = useState<string | null>(null);
  
  // 折叠母题 ID 集合
  const [collapsedTopicIds, setCollapsedTopicIds] = useState<Set<string>>(new Set());

  // 用户权限与身份
  const [currentUserId, setCurrentUserId] = useState<string>("");

  const pageSize = 50;

  // 获取当前用户 ID
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

  // 支持从其他页面带参跳转（如今日工作台"管理我的选题" → /topics?view=my_claims）
  useEffect(() => {
    if (typeof window === "undefined") return;
    const urlView = new URLSearchParams(window.location.search).get("view");
    if (urlView === "all" || urlView === "my_claims" || urlView === "my_created") {
      setCurrentView(urlView);
    }
  }, []);

  // 加载母题分类（供顶部下拉筛选用）
  const fetchTopics = useCallback(async () => {
    setTopicsError(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("topics")
        .select("id, name, sort_order")
        .order("sort_order", { ascending: true });

      if (error) throw error;
      setTopicsList((data ?? []) as TopicInfo[]);
    } catch (err) {
      console.error("加载母题过滤分类失败:", err);
      setTopicsList([]);
      setTopicsError(err instanceof Error ? err.message : "母题分类加载失败");
    }
  }, []);

  useEffect(() => {
    void fetchTopics();
  }, [fetchTopics]);

  // 加载我的认领，用于判断认领总数和是否已认领
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
      params.append("time_range", timeRange);
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
  }, [currentView, selectedTopicId, timeRange]);

  const loadAll = useCallback(async () => {
    setCurrentPage(1);
    await Promise.all([fetchPoolData(1, false), fetchMyClaims()]);
  }, [fetchMyClaims, fetchPoolData]);

  // 当筛选条件变化时，重新获取数据
  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // 监听录入成功事件，随时刷新选题池
  useEffect(() => {
    const handleRefresh = () => {
      void loadAll();
    };
    window.addEventListener("refresh-topics", handleRefresh);
    return () => window.removeEventListener("refresh-topics", handleRefresh);
  }, [loadAll]);

  // 处理加载更多
  const handleLoadMore = async () => {
    const nextPage = currentPage + 1;
    const succeeded = await fetchPoolData(nextPage, true);
    setCurrentPage((page) => resolvePageAfterLoad(page, succeeded));
  };

  // 从子题内的 sub_topic_claims 统计当前用户的 candidate 数量
  const activeCandidateCount = countMyCandidates(myClaims, currentUserId);
  const isLimitReached = activeCandidateCount >= 5;

  // 根据母题进行前端分组聚合
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

  // 展开/收起大分组
  const toggleCollapseGroup = (topicId: string) => {
    setCollapsedTopicIds((prev) => {
      const next = new Set(prev);
      if (next.has(topicId)) {
        next.delete(topicId);
      } else {
        next.add(topicId);
      }
      return next;
    });
  };

  const hasMore = items.length < totalItems;

  return (
    <div className="space-y-6">
      {/* 顶部控制面板 */}
      <div className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-4 md:flex-row md:items-center md:justify-between shadow-sm">
        {/* 视图切换 Tabs */}
        <div className="flex items-center gap-1 rounded-xl bg-stone-100 p-0.5 border border-stone-200/40 w-fit shrink-0">
          {(
            [
              { id: "all", label: "全部选题", icon: Compass },
              { id: "my_claims", label: "我正在做的", icon: CheckCircle },
              { id: "my_created", label: "我提交的", icon: Layers }
            ] as const
          ).map((view) => {
            const ViewIcon = view.icon;
            const active = currentView === view.id;
            return (
              <button
                key={view.id}
                onClick={() => setCurrentView(view.id)}
                className={cn(
                  "relative flex h-8 items-center gap-1.5 rounded-lg px-4 text-[12.5px] font-medium transition-all duration-200 cursor-pointer",
                  active
                    ? "bg-white text-stone-900 shadow-sm font-semibold"
                    : "text-stone-500 hover:text-stone-850"
                )}
              >
                <ViewIcon className={cn("size-3.5", active ? "text-[#D97757]" : "text-stone-400")} />
                <span>{view.label}</span>
              </button>
            );
          })}
        </div>

        {/* 筛选参数：时间 & 母题 */}
        <div className="flex flex-wrap items-center gap-3">
          {/* 母题筛选下拉 */}
          <div className="flex items-center gap-1.5">
            <Filter className="size-3.5 text-stone-400" />
            <select
              value={selectedTopicId}
              onChange={(e) => setSelectedTopicId(e.target.value)}
              className="h-8.5 rounded-xl border border-stone-200 bg-white px-3 py-1 text-[12.5px] text-stone-700 outline-none hover:border-stone-300 focus:border-[#D97757] focus:ring-1 focus:ring-[#D97757]/20"
            >
              <option value="__all__">所有母题分类</option>
              {topicsList.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* 时间范围筛选 */}
          <div className="flex items-center gap-1.5">
            <Calendar className="size-3.5 text-stone-400" />
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as "3d" | "1w" | "1m" | "3m")}
              className="h-8.5 rounded-xl border border-stone-200 bg-white px-3 py-1 text-[12.5px] text-stone-700 outline-none hover:border-stone-300 focus:border-[#D97757] focus:ring-1 focus:ring-[#D97757]/20"
            >
              <option value="3d">近 3 天</option>
              <option value="1w">本周</option>
              <option value="1m">本月</option>
              <option value="3m">近 3 个月</option>
            </select>
          </div>

          {/* 刷新按钮 */}
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => void loadAll()}
            className="size-8.5 rounded-xl text-stone-400 hover:text-stone-700 border-stone-200"
            title="刷新选题池"
            aria-label="刷新选题池"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {topicsError || claimsError ? (
        <div className="space-y-2 rounded-xl border border-[#D99E55]/25 bg-[#D99E55]/5 px-4 py-3 text-[12px] text-stone-600">
          {topicsError ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>母题分类加载失败：{topicsError}</span>
              <Button type="button" variant="outline" size="xs" onClick={() => void fetchTopics()}>
                重新加载分类
              </Button>
            </div>
          ) : null}
          {claimsError ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>认领状态加载失败：{claimsError}</span>
              <Button type="button" variant="outline" size="xs" onClick={() => void fetchMyClaims()}>
                重新加载认领状态
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 列表区 */}
      {loading ? (
        <div className="flex h-[300px] items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="size-6 animate-spin text-[#D97757]" />
            <span className="text-[12.5px] text-stone-500">正在整理选题列表，请稍候...</span>
          </div>
        </div>
      ) : poolError ? (
        <ErrorState
          title="选题池加载失败"
          description={poolError}
          onRetry={() => void loadAll()}
        />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 border border-dashed border-stone-200 bg-white rounded-2xl">
          <EmptyState
            title="暂无对应选题"
            description="未找到符合筛选条件的选题，您可以换个视图条件或点击上方新建选题。"
          />
        </div>
      ) : (
        <div className="space-y-6">
          {groupedGroups.map((group) => {
            const isCollapsed = collapsedTopicIds.has(group.topicId);
            return (
              <div
                key={group.topicId}
                className="space-y-3 rounded-2xl border border-stone-200/60 bg-stone-50/40 p-4 transition-all"
              >
                {/* 分组头部：点击折叠 */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleCollapseGroup(group.topicId)}
                  onKeyDown={(event) => handleKeyboardActivation(event, () => toggleCollapseGroup(group.topicId))}
                  className="flex cursor-pointer items-center justify-between border-b border-stone-250 pb-2 hover:opacity-80 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97757]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-50"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[13.5px] font-bold text-stone-900">
                      {group.topicName}
                    </span>
                    <span className="inline-flex items-center justify-center rounded-full bg-stone-200/70 px-2 py-0.5 text-[11px] font-semibold text-stone-600">
                      {group.items.length}
                    </span>
                  </div>
                  <div className="text-stone-400">
                    {isCollapsed ? (
                      <div className="flex items-center gap-1 text-[11.5px] text-stone-400 font-medium">
                        <span>展开</span>
                        <ChevronDown className="size-4" />
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-[11.5px] text-stone-400 font-medium">
                        <span>折叠</span>
                        <ChevronUp className="size-4" />
                      </div>
                    )}
                  </div>
                </div>

                {/* 分组子项卡片 */}
                <AnimatePresence initial={false}>
                  {!isCollapsed && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden space-y-3"
                    >
                      {group.items.map((subTopic) => (
                        <SubTopicCard
                          key={subTopic.id}
                          item={subTopic}
                          currentUserId={currentUserId}
                          isLimitReached={isLimitReached}
                          isClaimedByMe={isClaimedByMe(subTopic, currentUserId)}
                          onClaimSuccess={fetchMyClaims}
                        />
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}

          {/* 加载更多按钮 */}
          {hasMore && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                disabled={loadingMore}
                onClick={() => void handleLoadMore()}
                className="h-9 rounded-xl px-6 text-[12.5px] border-stone-200 hover:border-stone-300 font-medium text-stone-600 hover:text-stone-900"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin mr-1.5" />
                    正在拼命加载中...
                  </>
                ) : (
                  "加载更多选题"
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
