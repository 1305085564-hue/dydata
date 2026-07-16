"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  ChevronLeft,
  ChevronUp,
  ChevronDown,
  Calendar,
  Award,
  Video,
  User,
  Plus,
  RefreshCw,
  AlertTriangle,
  ExternalLink,
  BookOpen
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface TopicDetail {
  id: string;
  title: string;
  hook: string;
  topic_id: string;
  group_id: string | null;
  emotion_tag: string | null;
  source: string | null;
  audience: string | null;
  created_by: string;
  created_at: string;
  topics: {
    id: string;
    name: string;
  } | null;
  topic_groups: {
    id: string;
    name: string;
  } | null;
}

interface WorkItem {
  id: string;
  video_title: string;
  content: string | null;
  uploaded_at: string | null;
  referenceType: "direct" | "similar";
  video_metrics_snapshots?: Array<{
    play_count: number;
    likes: number;
    comments: number;
    shares: number;
    favorites: number;
    follower_gain?: number;
    follower_convert?: number;
  }>;
}

interface WorksSummary {
  qualifiedWorkCount: number;
  averagePlayCount: number | null;
  bestCopy: string | null;
  latestCopy: string | null;
}

interface ClaimInfo {
  id: string;
  sub_topic_id: string;
  user_id: string;
  status: "candidate" | "scripting" | "returned";
  claimed_at: string;
  returned_at?: string | null;
  notes?: string | null;
}

interface AllClaimsRecord {
  id: string;
  sub_topic_id: string;
  user_id: string;
  status: "candidate" | "scripting" | "returned";
  claimed_at: string;
  profiles: {
    display_name: string | null;
    name: string;
    role: string;
  } | null;
}

interface ClaimRecord {
  id: string;
  sub_topic_id: string;
  user_id: string;
  status: "candidate" | "scripting" | "returned";
  claimed_at: string;
}

interface WorksData {
  items: WorkItem[];
  similarReferences: WorkItem[];
  summary: WorksSummary;
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
  };
}

export default function TopicDetailPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);
  const router = useRouter();
  const id = params.id;

  const [detail, setDetail] = useState<TopicDetail | null>(null);
  const [works, setWorks] = useState<WorkItem[]>([]);
  const [similarWorks, setSimilarWorks] = useState<WorkItem[]>([]);
  const [summary, setSummary] = useState<WorksSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // 排序与分页
  const [sortType, setSortType] = useState<"best" | "recent">("best");
  const [worksPage, setWorksPage] = useState(1);
  const [totalWorks, setTotalWorks] = useState(0);
  const [loadingWorks, setLoadingWorks] = useState(false);

  // 认领状态
  const [myClaim, setMyClaim] = useState<ClaimInfo | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [allClaims, setAllClaims] = useState<AllClaimsRecord[]>([]); // 全局认领记录 (低频展开看)
  const [showAllClaims, setShowAllClaims] = useState(false);
  
  const [actionLoading, setActionLoading] = useState(false);
  const [claimLimitReached, setClaimLimitReached] = useState(false);

  // 获取当前用户及管理员属性
  useEffect(() => {
    const checkUser = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        
        // 查 profile 获取 role 用以判断管理员权限
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();
        if (profile) {
          setIsAdmin(["owner", "admin", "team_admin"].includes(profile.role));
        }
      }
    };
    void checkUser();
  }, []);

  // 加载认领上限校验
  const checkClaimLimit = useCallback(async () => {
    try {
      const res = await fetch("/api/topics/pool?view=my_claims&time_range=3m");
      if (res.ok) {
        const json = await res.json();
        const activeClaims: ClaimRecord[] = json.items || [];
        const activeCandidateCount = activeClaims.filter((c) => c.status === "candidate").length;
        setClaimLimitReached(activeCandidateCount >= 5);
      }
    } catch (err) {
      console.error("上限检查失败:", err);
    }
  }, []);

  // 加载当前用户的本题认领记录
  const fetchMyClaim = useCallback(async () => {
    if (!currentUserId) return;
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("sub_topic_claims")
        .select("*")
        .eq("sub_topic_id", id)
        .eq("user_id", currentUserId)
        .neq("status", "returned")
        .maybeSingle();

      if (!error) {
        setMyClaim(data);
      }
    } catch (err) {
      console.error("获取认领失败:", err);
    }
  }, [id, currentUserId]);

  // 拉取其他人的认领记录 (非 returned)，需要 RLS 或管理员权限支持
  const fetchAllClaims = useCallback(async () => {
    try {
      const supabase = createClient();
      // 普通用户若没有 RLS 权限只返回空，我们做优雅兜底
      const { data, error } = await supabase
        .from("sub_topic_claims")
        .select("*, profiles:user_id(display_name, name, role)")
        .eq("sub_topic_id", id)
        .neq("status", "returned");
      
      if (!error && data) {
        setAllClaims(data);
      }
    } catch (err) {
      console.log("无法获取其他人的认领详情:", err);
    }
  }, [id]);

  // 加载作品列表（支持排序与分页）
  const fetchWorks = useCallback(async (page: number, sort: "best" | "recent") => {
    setLoadingWorks(true);
    try {
      const res = await fetch(`/api/topics/sub-topics/${id}/works?sort=${sort}&page=${page}&page_size=15`);
      if (!res.ok) throw new Error("加载作品列表失败");
      const json = await res.json();
      setWorks(json.items || []);
      setSimilarWorks(json.similarReferences || []);
      setSummary(json.summary || null);
      setTotalWorks(json.pagination?.totalItems || 0);
    } catch (err) {
      console.error("加载作品列表失败:", err);
    } finally {
      setLoadingWorks(false);
    }
  }, [id]);

  // 初始化所有数据
  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/topics/sub-topics/${id}`);
      if (!res.ok) {
        if (res.status === 404) {
          feedbackToast.error("该选题不存在或已被删除");
          router.push("/topics");
          return;
        }
        throw new Error("加载选题详情失败");
      }
      const json = await res.json();
      setDetail(json.subTopic);
      
      // 预先填充 works 数据
      if (json.works) {
        setWorks(json.works.items || []);
        setSimilarWorks(json.works.similarReferences || []);
        setSummary(json.works.summary || null);
        setTotalWorks(json.works.pagination?.totalItems || 0);
      } else {
        await fetchWorks(1, sortType);
      }
    } catch (err) {
      feedbackToast.error("加载选题详情出错");
    } finally {
      setLoading(false);
    }
  }, [id, sortType, fetchWorks, router]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    if (currentUserId) {
      void fetchMyClaim();
      void checkClaimLimit();
      void fetchAllClaims();
    }
  }, [currentUserId, fetchMyClaim, checkClaimLimit, fetchAllClaims]);

  // 当切换排序时重新拉取作品
  const handleSortChange = (type: "best" | "recent") => {
    setSortType(type);
    setWorksPage(1);
    void fetchWorks(1, type);
  };

  // 处理认领操作
  const handleClaim = async () => {
    if (actionLoading || claimLimitReached) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/topics/sub-topics/${id}/claim`, { method: "POST" });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "认领选题失败");

      feedbackToast.success("成功认领选题至您的候选库");
      await Promise.all([fetchMyClaim(), checkClaimLimit(), fetchAllClaims()]);
    } catch (err) {
      feedbackToast.error("认领失败", {
        details: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setActionLoading(false);
    }
  };

  // 处理标记脚本中操作
  const handleStartScripting = async () => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/topics/sub-topics/${id}/start-scripting`, { method: "POST" });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "操作失败");

      feedbackToast.success("已标记为脚本制作中");
      await fetchMyClaim();
    } catch (err) {
      feedbackToast.error("标记失败", {
        details: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setActionLoading(false);
    }
  };

  // 处理放回选题池操作
  const handleReturn = async () => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/topics/sub-topics/${id}/return`, { method: "POST" });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "放回失败");

      feedbackToast.success("已成功从我的选题库移出，放回选题池");
      setMyClaim(null);
      await Promise.all([fetchMyClaim(), checkClaimLimit(), fetchAllClaims()]);
    } catch (err) {
      feedbackToast.error("放回失败", {
        details: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setActionLoading(false);
    }
  };

  if (loading || !detail) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="size-6 animate-spin text-[#D97757]" />
          <span className="text-[12.5px] text-stone-500">正在整理选题深度信息...</span>
        </div>
      </div>
    );
  }

  const averagePlay = summary?.averagePlayCount || null;

  // 红涨绿跌色彩渲染逻辑
  const renderPlayCount = (playCount: number) => {
    if (averagePlay === null) {
      return <span className="text-stone-700 font-medium tabular-nums">{playCount.toLocaleString()}</span>;
    }
    const isHigher = playCount >= averagePlay;
    return (
      <span className={cn("font-semibold tabular-nums", isHigher ? "text-[#C9604D]" : "text-[#6FAA7D]")}>
        {playCount.toLocaleString()}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* 头部导航与返回 */}
      <div className="flex items-center justify-between">
        <Link
          href="/topics"
          className="inline-flex items-center gap-1 text-[13px] text-stone-500 hover:text-stone-800 transition-colors"
        >
          <ChevronLeft className="size-4" />
          <span>返回选题池</span>
        </Link>

        {/* 创作跳转辅助 */}
        {myClaim && (
          <Link href={`/video-review/submit?topicId=${detail.id}`} className="inline-block">
            <Button size="sm" className="h-8 rounded-lg gap-1 font-medium bg-[#8AA8C7] hover:bg-[#7998b8]">
              <span>使用此选题去创作/上传</span>
              <ExternalLink className="size-3.5" />
            </Button>
          </Link>
        )}
      </div>

      {/* 子题卡详细大面板 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* 左侧及中栏：基础信息与历史文案列表 */}
        <div className="lg:col-span-2 space-y-6">
          {/* 基本信息区块 */}
          <div className="rounded-2xl border border-stone-200 bg-white p-5 md:p-6 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {detail.topics && (
                <span className="inline-flex items-center rounded-md bg-[#8AA8C7]/5 border border-[#8AA8C7]/15 px-2 py-0.5 text-[11.5px] font-medium text-[#8AA8C7]">
                  母题：{detail.topics.name}
                </span>
              )}
              {detail.topic_groups && (
                <span className="inline-flex items-center rounded-md bg-stone-100 px-2 py-0.5 text-[11.5px] font-medium text-stone-600">
                  分组：{detail.topic_groups.name}
                </span>
              )}
              {detail.emotion_tag && (
                <span className="inline-flex items-center rounded-md bg-amber-50 border border-amber-200/50 px-2 py-0.5 text-[11.5px] font-medium text-amber-700">
                  情绪：{detail.emotion_tag}
                </span>
              )}
              {detail.audience && (
                <span className="inline-flex items-center rounded-md bg-stone-100 px-2 py-0.5 text-[11.5px] font-medium text-stone-500">
                  目标受众：{detail.audience}
                </span>
              )}
            </div>

            <div className="space-y-2">
              <h2 className="text-[18px] font-bold text-stone-900 leading-tight">
                {detail.title}
              </h2>
              <div className="rounded-xl bg-stone-50 p-4 border border-stone-150 text-[13px] text-stone-700 leading-relaxed italic">
                “{detail.hook}”
              </div>
            </div>
            
            <div className="flex items-center gap-4 text-[12px] text-stone-400">
              <span className="flex items-center gap-1">
                <Calendar className="size-3.5" />
                录入于 {new Date(detail.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>

          {/* 历史文案列表区块 */}
          <div className="rounded-2xl border border-stone-200 bg-white p-5 md:p-6 shadow-sm space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-stone-100 pb-3">
              <div className="space-y-0.5">
                <h3 className="text-[14px] font-bold text-stone-900 flex items-center gap-2">
                  <Video className="size-4 text-[#D97757]" />
                  <span>本题历史发布版本</span>
                  <span className="text-[12px] font-normal text-stone-400">
                    (共 {totalWorks} 个作品)
                  </span>
                </h3>
              </div>

              {/* 排序切换 */}
              <div className="flex items-center rounded-lg bg-stone-100 p-0.5 border border-stone-200/40 w-fit">
                <button
                  onClick={() => handleSortChange("best")}
                  className={cn(
                    "flex h-7 items-center gap-1 rounded-md px-3 text-[12px] font-medium transition-all duration-200 cursor-pointer",
                    sortType === "best" ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-850"
                  )}
                >
                  <Award className="size-3" />
                  <span>爆款优先</span>
                </button>
                <button
                  onClick={() => handleSortChange("recent")}
                  className={cn(
                    "flex h-7 items-center gap-1 rounded-md px-3 text-[12px] font-medium transition-all duration-200 cursor-pointer",
                    sortType === "recent" ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-850"
                  )}
                >
                  <Calendar className="size-3" />
                  <span>最新发布</span>
                </button>
              </div>
            </div>

            {/* 列表渲染 */}
            {loadingWorks ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="size-5 animate-spin text-stone-400" />
              </div>
            ) : works.length === 0 ? (
              <div className="py-12 text-center text-[13px] text-stone-400 border border-dashed border-stone-200 rounded-xl bg-stone-50/20">
                暂无关联发布作品，快来发布第一版吧！
              </div>
            ) : (
              <div className="space-y-4">
                {works.map((work) => {
                  const snap = work.video_metrics_snapshots?.[0];
                  return (
                    <div
                      key={work.id}
                      className="rounded-xl border border-stone-200/70 p-4 space-y-3 hover:border-stone-300 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-0.5">
                          <div className="font-semibold text-stone-850 text-[13px] leading-tight">
                            {work.video_title}
                          </div>
                          <span className="text-[11px] text-stone-400 block">
                            上传时间：{work.uploaded_at ? new Date(work.uploaded_at).toLocaleString() : "未知"}
                          </span>
                        </div>

                        {/* 数据指标 */}
                        {snap && (
                          <div className="flex flex-wrap items-center gap-3 text-[12px] text-stone-500 shrink-0 font-medium bg-stone-50 border border-stone-150 rounded-lg px-2.5 py-1">
                            <div className="flex flex-col items-end">
                              <span className="text-[9.5px] text-stone-400 leading-none">播放量</span>
                              <span className="mt-0.5">{renderPlayCount(snap.play_count)}</span>
                            </div>
                            <div className="h-5.5 w-px bg-stone-200" />
                            <div className="flex flex-col items-end">
                              <span className="text-[9.5px] text-stone-400 leading-none">点赞数</span>
                              <span className="mt-0.5 text-stone-700">{snap.likes.toLocaleString()}</span>
                            </div>
                            {snap.follower_convert !== undefined && (
                              <>
                                <div className="h-5.5 w-px bg-stone-200" />
                                <div className="flex flex-col items-end">
                                  <span className="text-[9.5px] text-stone-400 leading-none">转粉率</span>
                                  <span className="mt-0.5 text-[#8AA8C7]">{(snap.follower_convert * 100).toFixed(2)}%</span>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      {/* 文案展示 */}
                      {work.content && (
                        <div className="rounded-lg bg-stone-50/70 border border-stone-150/40 p-3 text-[12.5px] text-stone-700 leading-relaxed italic whitespace-pre-wrap">
                          “{work.content}”
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 右侧边栏：状态控制与相近参考 */}
        <div className="space-y-6">
          {/* 操作台卡片 */}
          <div className="rounded-2xl border border-stone-200 bg-white p-5 md:p-6 shadow-sm space-y-4">
            <h3 className="text-[13.5px] font-bold text-stone-900 border-b border-stone-100 pb-2 flex items-center gap-1.5">
              <BookOpen className="size-4 text-[#D97757]" />
              <span>选题操作台</span>
            </h3>

            <div className="space-y-3">
              {/* 根据当前认领状态渲染按钮 */}
              {!myClaim ? (
                <div className="space-y-2">
                  <Button
                    disabled={actionLoading || claimLimitReached}
                    onClick={handleClaim}
                    className="w-full h-9 rounded-xl font-medium"
                  >
                    {actionLoading ? (
                      <Loader2 className="size-4 animate-spin mr-1.5" />
                    ) : (
                      "认领选题"
                    )}
                  </Button>
                  {claimLimitReached && (
                    <div className="flex items-start gap-1 text-[11px] text-[#C9604D] leading-relaxed bg-[#C9604D]/5 p-2 rounded-lg border border-[#C9604D]/15">
                      <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                      <span>已认领 5 条候选选题，请先去【选题池-我正在做的】放回部分选题以重新腾出空间。</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-xl bg-stone-50 border border-stone-150 p-3 text-[12.5px]">
                    <div className="flex items-center justify-between">
                      <span className="text-stone-500 font-medium">当前认领状态：</span>
                      <span className={cn(
                        "font-semibold rounded-md px-2 py-0.5 text-[11.5px]",
                        myClaim.status === "scripting"
                          ? "bg-[#8AA8C7]/15 text-[#8AA8C7]"
                          : "bg-[#D97757]/10 text-[#D97757]"
                      )}>
                        {myClaim.status === "scripting" ? "脚本制作中" : "候选选题中"}
                      </span>
                    </div>
                    <span className="text-[11px] text-stone-400 block mt-1">
                      认领时间：{new Date(myClaim.claimed_at).toLocaleString()}
                    </span>
                  </div>

                  {myClaim.status === "candidate" && (
                    <Button
                      disabled={actionLoading}
                      onClick={handleStartScripting}
                      className="w-full h-9 rounded-xl font-medium bg-[#8AA8C7] hover:bg-[#7998b8]"
                    >
                      {actionLoading ? <Loader2 className="size-4 animate-spin" /> : "标记已写完脚本/制作中"}
                    </Button>
                  )}

                  <Button
                    disabled={actionLoading}
                    variant="outline"
                    onClick={handleReturn}
                    className="w-full h-9 rounded-xl font-medium border-stone-200 text-stone-600 hover:text-stone-900"
                  >
                    {actionLoading ? <Loader2 className="size-4 animate-spin" /> : "放弃认领，放回选题池"}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* 认领动态区 (低频折叠) */}
          <div className="rounded-2xl border border-stone-200 bg-white p-5 md:p-6 shadow-sm space-y-3">
            <div
              onClick={() => setShowAllClaims(!showAllClaims)}
              className="flex items-center justify-between cursor-pointer select-none hover:opacity-85"
            >
              <div className="flex items-center gap-1.5">
                <User className="size-4 text-stone-400" />
                <span className="text-[13px] font-bold text-stone-800">
                  当前认领动态 ({allClaims.length}人)
                </span>
              </div>
              <div className="text-stone-400">
                {showAllClaims ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              </div>
            </div>

            {showAllClaims && (
              <div className="pt-2 border-t border-stone-100 space-y-2">
                {allClaims.length === 0 ? (
                  <span className="text-[11.5px] text-stone-400 block py-1">当前没有其他用户认领。</span>
                ) : (
                  <div className="max-h-[150px] overflow-y-auto space-y-2 pr-1">
                    {allClaims.map((claim) => (
                      <div
                        key={claim.id}
                        className="flex items-center justify-between text-[12px] bg-stone-50/50 p-2 rounded-lg border border-stone-150/40"
                      >
                        <span className="font-medium text-stone-700">
                          {claim.profiles?.display_name || claim.profiles?.name || "未知成员"}
                        </span>
                        <span className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded-md font-semibold",
                          claim.status === "scripting" ? "bg-[#8AA8C7]/10 text-[#8AA8C7]" : "bg-stone-200 text-stone-500"
                        )}>
                          {claim.status === "scripting" ? "脚本中" : "候选"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 相近选题参考区块 */}
          {similarWorks.length > 0 && (
            <div className="rounded-2xl border border-stone-200 bg-white p-5 md:p-6 shadow-sm space-y-3">
              <h3 className="text-[13.5px] font-bold text-stone-900 border-b border-stone-100 pb-2 flex items-center gap-1.5">
                <TrendingUp className="size-4 text-[#8AA8C7]" />
                <span>同类相近选题文案参考</span>
              </h3>

              <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                {similarWorks.map((work) => (
                  <div
                    key={work.id}
                    className="rounded-lg border border-stone-150 p-3 space-y-2 hover:border-stone-250 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-stone-600 truncate max-w-[120px]">
                        {work.video_title}
                      </span>
                      {work.video_metrics_snapshots?.[0]?.play_count !== undefined && (
                        <span className="text-[11px] text-stone-400 font-medium">
                          播放量: {work.video_metrics_snapshots[0].play_count.toLocaleString()}
                        </span>
                      )}
                    </div>
                    {work.content && (
                      <p className="text-[11.5px] text-stone-500 leading-relaxed italic line-clamp-3">
                        “{work.content}”
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
