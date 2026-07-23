"use client";

import { useEffect, useState, useCallback, use, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  parseSubTopicDetailResponse,
  parseSubTopicWorksResponse,
  resolveWorkLikes,
  calculateTotalInFlight,
  DETAIL_PAGE_SIZE,
  type SubTopicDetail,
  type WorkItem,
  type ReferenceWork
} from "../topic-helpers";
import {
  ChevronLeft,
  User,
  Check,
  Plus,
  Loader2,
  AlertTriangle,
  Video,
  Edit2,
  Trash2,
  ArrowRightLeft,
  RefreshCw,
  FileText,
  RotateCcw,
  Film
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getClaimToggleRequest } from "@/lib/topics/claim-toggle";

interface ClaimInfo {
  userId: string;
  displayName: string;
  claimedAt: string;
  status: "candidate" | "scripting" | "returned";
}

interface ClaimsApiResponse {
  claims: ClaimInfo[];
  candidateCount: number;
  scriptingCount: number;
}



interface SubTopicClaim {
  id: string;
  user_id: string;
  status: "candidate" | "scripting" | "returned";
  claimed_at: string;
}

interface MyClaimSubTopicItem {
  id: string;
  title: string;
  hook?: string | null;
  sub_topic_claims?: SubTopicClaim[];
}

export default function SubTopicDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const subTopicId = resolvedParams.id;
  const router = useRouter();

  const [detail, setDetail] = useState<SubTopicDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);

  // 撞车动态
  const [claimsData, setClaimsData] = useState<ClaimsApiResponse>({
    claims: [],
    candidateCount: 0,
    scriptingCount: 0
  });
  const [claimsError, setClaimsError] = useState<string | null>(null);

  // 我的认领
  const [myClaims, setMyClaims] = useState<MyClaimSubTopicItem[]>([]);
  const [myClaimsError, setMyClaimsError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");

  // 认领与状态流转操作 Loading
  const [isClaiming, setIsClaiming] = useState(false);
  const [isUpdatingClaim, setIsUpdatingClaim] = useState(false);

  // 作品列表、排序与分页 (问题 3)
  const [works, setWorks] = useState<WorkItem[]>([]);
  const [similarReferences, setSimilarReferences] = useState<ReferenceWork[]>([]);
  const [worksTotal, setWorksTotal] = useState(0);
  const [worksPage, setWorksPage] = useState(1);
  const [worksPageSize, setWorksPageSize] = useState(DETAIL_PAGE_SIZE);
  const [worksSort, setWorksSort] = useState<"best" | "recent">("best");
  const [loadingWorks, setLoadingWorks] = useState(false);
  const hasLoadedWorksRef = useRef(false);

  // 编辑 Modal
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editHook, setEditHook] = useState("");
  const [editEmotionTag, setEditEmotionTag] = useState("");
  const [editAudience, setEditAudience] = useState("");
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // 删除 Dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteErrorMsg, setDeleteErrorMsg] = useState<string | null>(null);

  // 替换 5/5 认领 Dialog
  const [replaceDialogOpen, setReplaceDialogOpen] = useState(false);
  const [selectedReturnId, setSelectedReturnId] = useState<string | null>(null);
  const [isReplacing, setIsReplacing] = useState(false);

  // 获取当前登录用户 ID
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

  // 加载“我的认领”状态列表 (含错误显露与重试 问题 5)
  const fetchMyClaims = useCallback(async () => {
    setMyClaimsError(null);
    try {
      const res = await fetch("/api/topics/pool?view=my_claims");
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "获取我的认领状态失败");
      }
      const data = await res.json();
      setMyClaims(data.items || []);
    } catch (err) {
      console.error("加载我的认领状态失败:", err);
      setMyClaimsError(err instanceof Error ? err.message : "获取我的认领状态失败");
    }
  }, []);

  // 加载作品列表 (包含后端真正 total、分页与同类参考作品 问题 3)
  const fetchWorks = useCallback(async (page = 1, sort: "best" | "recent" = "best") => {
    setLoadingWorks(true);
    try {
      const res = await fetch(
        `/api/topics/sub-topics/${subTopicId}/works?page=${page}&page_size=${DETAIL_PAGE_SIZE}&sort=${sort}`
      );
      if (!res.ok) throw new Error("获取作品失败");
      const data = await res.json();
      const parsed = parseSubTopicWorksResponse(data);
      setWorks(parsed.items);
      setSimilarReferences(parsed.similarReferences);
      setWorksTotal(parsed.total);
      setWorksPage(parsed.page);
      setWorksPageSize(parsed.pageSize);
    } catch (err) {
      console.error("加载作品数据失败:", err);
    } finally {
      setLoadingWorks(false);
    }
  }, [subTopicId]);

  // 加载详情接口 (适配错层并消除冗余作品请求 问题 7)
  const fetchDetail = useCallback(async () => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/topics/sub-topics/${subTopicId}`);
      if (!res.ok) throw new Error("选题不存在或已被删除");
      const data = await res.json();

      const parsed = parseSubTopicDetailResponse(data);
      setDetail(parsed.subTopic);
      setEditTitle(parsed.subTopic?.title || "");
      setEditHook(parsed.subTopic?.hook || "");
      setEditEmotionTag(parsed.subTopic?.emotion_tag || "");
      setEditAudience(parsed.subTopic?.audience || "");

      if (!hasLoadedWorksRef.current) {
        if (parsed.worksItems && parsed.worksItems.length > 0) {
          setWorks(parsed.worksItems);
          setWorksTotal(parsed.worksTotal);
          hasLoadedWorksRef.current = true;
        } else {
          void fetchWorks(1, "best");
          hasLoadedWorksRef.current = true;
        }
      }
    } catch (err) {
      feedbackToast.error("加载详情失败", {
        details: err instanceof Error ? err.message : String(err)
      });
      setDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }, [subTopicId, fetchWorks]);

  // 加载撞车动态
  const fetchClaims = useCallback(async () => {
    setClaimsError(null);
    try {
      const res = await fetch(`/api/topics/sub-topics/${subTopicId}/claims`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "获取撞车动态失败");
      }
      const data = await res.json();
      setClaimsData({
        claims: Array.isArray(data.claims) ? data.claims : [],
        candidateCount: data.candidateCount ?? 0,
        scriptingCount: data.scriptingCount ?? 0
      });
    } catch (err) {
      console.error("加载撞车动态失败:", err);
      setClaimsError(err instanceof Error ? err.message : "获取撞车动态失败");
    }
  }, [subTopicId]);

  const loadAllData = useCallback(async () => {
    await Promise.all([fetchDetail(), fetchClaims(), fetchMyClaims()]);
  }, [fetchDetail, fetchClaims, fetchMyClaims]);

  useEffect(() => {
    void loadAllData();
  }, [loadAllData]);

  const isOwner = Boolean(currentUserId && detail?.created_by === currentUserId);

  // 解析当前用户认领状态 (问题 2)
  const currentSubTopicItem = myClaims.find((item) => item.id === subTopicId);
  const myClaimRecord = currentSubTopicItem?.sub_topic_claims?.find(
    (c) => c.user_id === currentUserId && c.status !== "returned"
  );
  const isClaimedByMe = !!myClaimRecord;

  // 整理出所有 candidate 选项用于替换弹窗
  const activeCandidateItems = myClaims.filter((item) => {
    const claim = item.sub_topic_claims?.find((c) => c.user_id === currentUserId);
    return claim?.status === "candidate";
  });
  const isLimitReached = activeCandidateItems.length >= 5;

  // 全量撞车人数
  const totalInFlightCount = calculateTotalInFlight(claimsData);

  // 1. 触发认领
  const handleClaim = async () => {
    if (isClaiming || isClaimedByMe) return;

    if (isLimitReached) {
      setSelectedReturnId(activeCandidateItems[0]?.id || null);
      setReplaceDialogOpen(true);
      return;
    }

    setIsClaiming(true);
    try {
      const res = await fetch(`/api/topics/sub-topics/${subTopicId}/claim`, {
        method: "POST"
      });
      const data = await res.json();

      if (res.status === 409) {
        setSelectedReturnId(activeCandidateItems[0]?.id || null);
        setReplaceDialogOpen(true);
        return;
      }

      if (!res.ok) throw new Error(data.error || "认领失败");

      feedbackToast.success("认领选题成功！");
      await loadAllData();
    } catch (err) {
      feedbackToast.error("认领失败", {
        details: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setIsClaiming(false);
    }
  };

  // 2. 推进至「标记脚本中」(问题 2)
  const handleStartScripting = async () => {
    if (isUpdatingClaim) return;
    setIsUpdatingClaim(true);
    try {
      const res = await fetch(`/api/topics/sub-topics/${subTopicId}/start-scripting`, {
        method: "POST"
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "标记脚本中失败");
      }
      feedbackToast.success("已成功标记为「脚本写作中」！");
      await loadAllData();
    } catch (err) {
      feedbackToast.error("更新状态失败", {
        details: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setIsUpdatingClaim(false);
    }
  };

  // 3. 放回选题池/放弃认领 (问题 2)
  const handleReturnClaim = async () => {
    if (isUpdatingClaim) return;
    setIsUpdatingClaim(true);
    try {
      const request = getClaimToggleRequest(subTopicId, true);
      const res = await fetch(request.endpoint, {
        method: "POST"
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "放回选题池失败");
      }
      feedbackToast.success(request.successMessage);
      await loadAllData();
    } catch (err) {
      feedbackToast.error("放回失败", {
        details: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setIsUpdatingClaim(false);
    }
  };

  // 替换确认
  const handleConfirmReplace = async () => {
    if (!selectedReturnId || isReplacing) return;
    setIsReplacing(true);

    try {
      const returnRes = await fetch(`/api/topics/sub-topics/${selectedReturnId}/return`, {
        method: "POST"
      });
      if (!returnRes.ok) throw new Error("放回旧选题失败");

      const claimRes = await fetch(`/api/topics/sub-topics/${subTopicId}/claim`, {
        method: "POST"
      });
      if (!claimRes.ok) throw new Error("认领新选题失败");

      feedbackToast.success("已替换旧选题并成功认领！");
      setReplaceDialogOpen(false);
      await loadAllData();
    } catch (err) {
      feedbackToast.error("替换失败", {
        details: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setIsReplacing(false);
    }
  };

  // 编辑提交
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTitle.trim()) {
      feedbackToast.warning("选题标题不能为空");
      return;
    }
    setIsSubmittingEdit(true);
    try {
      const res = await fetch(`/api/topics/sub-topics/${subTopicId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle.trim(),
          hook: editHook.trim() || null,
          emotion_tag: editEmotionTag.trim() || null,
          audience: editAudience.trim() || null
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "修改失败");
      feedbackToast.success("选题更新成功");
      setEditDialogOpen(false);
      await loadAllData();
    } catch (err) {
      feedbackToast.error("修改失败", {
        details: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  // 删除提交
  const handleDeleteSubmit = async () => {
    setIsDeleting(true);
    setDeleteErrorMsg(null);
    try {
      const res = await fetch(`/api/topics/sub-topics/${subTopicId}`, {
        method: "DELETE"
      });
      const data = await res.json();
      if (res.status === 409) {
        const count = data.work_count ?? data.worksCount;
        setDeleteErrorMsg(
          count
            ? `该选题已有 ${count} 条作品关联，删除会切断数据回流。请先处理关联作品。`
            : `该选题已有关联作品，删除会切断数据回流。请先处理关联作品。`
        );
        return;
      }
      if (!res.ok) throw new Error(data.error || "删除失败");

      feedbackToast.success("选题已顺利删除");
      router.push("/topics");
    } catch (err) {
      feedbackToast.error("删除失败", {
        details: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // 分页与排序切换 (问题 3)
  const handleSortChange = (newSort: "best" | "recent") => {
    setWorksSort(newSort);
    void fetchWorks(1, newSort);
  };

  const handlePageChange = (newPage: number) => {
    void fetchWorks(newPage, worksSort);
  };

  if (loadingDetail) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-[#D97757]" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center space-y-3">
        <p className="text-[14px] text-stone-500">无法显示选题信息，该选题可能已被删除。</p>
        <Link href="/topics">
          <Button variant="outline" size="sm">
            返回选题池
          </Button>
        </Link>
      </div>
    );
  }

  const totalPages = Math.ceil(worksTotal / worksPageSize) || 1;

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* 顶栏与门控按钮 */}
      <div className="flex items-center justify-between border-b border-stone-200 pb-4">
        <Link href="/topics" className="inline-flex items-center gap-1 text-[13px] font-medium text-stone-500 hover:text-stone-900">
          <ChevronLeft className="size-4" />
          返回选题池
        </Link>

        {isOwner && (
          <div className="flex items-center gap-2">
            <Button
              size="xs"
              variant="outline"
              onClick={() => setEditDialogOpen(true)}
              className="h-8 rounded-lg border-stone-200 text-stone-700 hover:bg-stone-50 gap-1 text-[12px]"
            >
              <Edit2 className="size-3.5 text-stone-500" />
              <span>编辑选题</span>
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={() => setDeleteDialogOpen(true)}
              className="h-8 rounded-lg border-stone-200 text-[#C9604D] hover:bg-[#C9604D]/5 gap-1 text-[12px]"
            >
              <Trash2 className="size-3.5 text-[#C9604D]" />
              <span>删除选题</span>
            </Button>
          </div>
        )}
      </div>

      {/* 我的认领状态请求异常告警 (问题 5) */}
      {myClaimsError && (
        <div className="flex items-center justify-between rounded-xl border border-[#D99E55]/30 bg-[#D99E55]/5 px-4 py-3 text-[12.5px] text-stone-700">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-[#D99E55] shrink-0" />
            <span>我的认领状态加载失败：{myClaimsError}</span>
          </div>
          <Button size="xs" variant="outline" onClick={() => void fetchMyClaims()} className="h-7 text-[12px]">
            <RefreshCw className="size-3 mr-1" />
            重新加载认领状态
          </Button>
        </div>
      )}

      {/* 主信息卡 */}
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-xs space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5 flex-1">
            {detail.topics && (
              <span className="inline-flex items-center rounded-md bg-[#4F5E96]/10 px-2.5 py-0.5 text-[11.5px] font-semibold text-[#4F5E96]">
                {detail.topics.name}
              </span>
            )}
            <h1 className="text-[20px] font-bold text-stone-900 leading-snug">{detail.title}</h1>
          </div>

          {/* 认领流转按钮区 (问题 2) */}
          <div className="flex items-center gap-2">
            {isClaimedByMe ? (
              <div className="flex items-center gap-2">
                {myClaimRecord?.status === "candidate" ? (
                  <>
                    <Button
                      size="sm"
                      disabled={isUpdatingClaim}
                      onClick={() => void handleStartScripting()}
                      className="h-9 px-3.5 rounded-xl bg-[#5F82A8] hover:bg-[#5F82A8]/90 text-white text-[12.5px] font-medium"
                    >
                      {isUpdatingClaim ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <FileText className="size-3.5 mr-1" />}
                      标记脚本中
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isUpdatingClaim}
                      onClick={() => void handleReturnClaim()}
                      title="再次点击放回选题池"
                      className="h-9 px-3 rounded-xl border-[#6FAA7D]/25 bg-[#6FAA7D]/10 text-[#5B9668] hover:bg-[#6FAA7D]/20 text-[12.5px]"
                    >
                      {isUpdatingClaim ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <Check className="size-3.5 mr-1" />}
                      已认领
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#C9604D]/10 px-3.5 text-[12.5px] font-semibold text-[#C9604D]">
                      <FileText className="size-3.5" />
                      ⚠️ 脚本写作中
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isUpdatingClaim}
                      onClick={() => void handleReturnClaim()}
                      className="h-9 px-3 rounded-xl border-stone-200 text-stone-600 hover:bg-stone-50 text-[12.5px]"
                    >
                      {isUpdatingClaim ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <RotateCcw className="size-3.5 mr-1" />}
                      放回选题池
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <Button
                disabled={isClaiming}
                onClick={() => void handleClaim()}
                className={cn(
                  "h-9 px-5 rounded-xl font-medium text-[13px] text-white shadow-xs transition-all",
                  isLimitReached ? "bg-[#D97757]/80 hover:bg-[#D97757]" : "bg-[#D97757] hover:bg-[#D97757]/90"
                )}
              >
                {isClaiming ? <Loader2 className="size-4 animate-spin mr-1" /> : <Plus className="size-4 mr-1" />}
                {isLimitReached ? "认领此题 (选替换)" : "认领此选题"}
              </Button>
            )}
          </div>
        </div>

        {detail.hook && (
          <div className="rounded-xl bg-stone-50 p-4 border border-stone-150 text-[13px] text-stone-700 leading-relaxed">
            <span className="font-semibold text-stone-900 block mb-1">一句话钩子：</span>
            “{detail.hook}”
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4 text-[12px] text-stone-400 pt-2 border-t border-stone-100">
          {detail.emotion_tag && <span>情绪标签: <strong className="text-stone-700 font-medium">{detail.emotion_tag}</strong></span>}
          {detail.audience && <span>目标受众: <strong className="text-stone-700 font-medium">{detail.audience}</strong></span>}
          <span>录入时间: {new Date(detail.created_at).toLocaleDateString()}</span>
        </div>
      </div>

      {/* 撞车动态 */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <div className="flex items-center gap-2">
            <User className="size-4 text-[#D97757]" />
            <h2 className="text-[14px] font-bold text-stone-900">
              认领撞车动态
            </h2>
          </div>
          {!claimsError && (
            <span className="text-[12.5px] font-semibold text-stone-700">
              已有 <strong className="text-[#D97757] tabular-nums">{totalInFlightCount}</strong> 人在做
              {claimsData.scriptingCount > 0 && (
                <span className="text-[#C9604D] font-normal ml-1">
                  （含 {claimsData.scriptingCount} 人脚本中）
                </span>
              )}
            </span>
          )}
        </div>

        {claimsError ? (
          <div className="flex items-center justify-between rounded-xl bg-[#C9604D]/5 p-3.5 border border-[#C9604D]/20 text-[12.5px] text-[#C9604D]">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 shrink-0" />
              <span>撞车动态加载失败：{claimsError}</span>
            </div>
            <Button size="xs" variant="outline" onClick={() => void fetchClaims()} className="h-7 text-[12px]">
              <RefreshCw className="size-3 mr-1" />
              重新加载撞车动态
            </Button>
          </div>
        ) : claimsData.claims.length === 0 ? (
          <p className="text-[12.5px] text-stone-400 py-3 italic text-center">
            暂无其他人认领此选题，抢先创作成就爆款！
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {claimsData.claims.map((c, idx) => (
              <div
                key={c.userId || idx}
                className={cn(
                  "flex items-center justify-between p-3 rounded-xl border text-[12.5px]",
                  c.status === "scripting"
                    ? "border-[#C9604D]/30 bg-[#C9604D]/5 text-[#C9604D]"
                    : "border-stone-200 bg-stone-50/50 text-stone-700"
                )}
              >
                <div className="flex items-center gap-2 font-medium">
                  <User className="size-3.5 opacity-60" />
                  <span>{c.displayName || c.userId || "未知成员"}</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] opacity-80">
                  <span className="font-semibold">
                    {c.status === "scripting" ? "⚠️ 脚本写作中" : "候选思考中"}
                  </span>
                  <span>{new Date(c.claimedAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 作品回流记录 (含排序、真正 total、分页与同类参考视频 问题 3) */}
      <div id="associated-works-section" className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs space-y-4 scroll-mt-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-stone-100 pb-3">
          <div className="flex items-center gap-2">
            <Video className="size-4 text-[#5F82A8]" />
            <h2 className="text-[14px] font-bold text-stone-900">
              已关联创作作品 ({worksTotal})
            </h2>
          </div>

          {/* 排序切换 */}
          <div className="flex items-center gap-1 bg-stone-100 p-0.5 rounded-lg text-[12px]">
            <button
              onClick={() => handleSortChange("best")}
              className={cn(
                "px-2.5 py-1 rounded-md transition-all font-medium",
                worksSort === "best" ? "bg-white text-stone-900 shadow-2xs" : "text-stone-500 hover:text-stone-900"
              )}
            >
              爆款优先
            </button>
            <button
              onClick={() => handleSortChange("recent")}
              className={cn(
                "px-2.5 py-1 rounded-md transition-all font-medium",
                worksSort === "recent" ? "bg-white text-stone-900 shadow-2xs" : "text-stone-500 hover:text-stone-900"
              )}
            >
              最新发布
            </button>
          </div>
        </div>

        {loadingWorks ? (
          <div className="py-8 text-center text-stone-400 text-[12.5px] flex items-center justify-center gap-2">
            <Loader2 className="size-4 animate-spin text-[#5F82A8]" />
            <span>加载关联作品中...</span>
          </div>
        ) : works.length === 0 ? (
          <div className="py-8 text-center text-stone-400 text-[12.5px] italic">
            本选题暂无作品发布记录。
          </div>
        ) : (
          <div className="space-y-2.5">
            {works.map((w) => {
              const snap = w.video_metrics_snapshots?.[0];
              const playCount = snap?.play_count ?? 0;
              const likesCount = resolveWorkLikes(snap);

              return (
                <div key={w.id} className="flex items-center justify-between p-3.5 rounded-xl border border-stone-200 bg-stone-50/40 text-[12.5px] hover:border-stone-300 transition-all">
                  <div className="space-y-0.5">
                    <div className="font-semibold text-stone-900">{w.video_title}</div>
                    <div className="flex items-center gap-3 text-[11px] text-stone-400">
                      {w.account_name && <span>账号: {w.account_name}</span>}
                      {(w.uploadedAt || w.uploaded_at) && (
                        <span>发布时间: {new Date(w.uploadedAt || w.uploaded_at || "").toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                  {snap && (
                    <div className="text-right tabular-nums">
                      <div className="font-bold text-stone-900">
                        {playCount >= 10000 ? `${(playCount / 10000).toFixed(1)}w` : playCount.toLocaleString()} 播放
                      </div>
                      <div className="text-[11px] text-stone-400">{likesCount.toLocaleString()} 点赞</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 分页控制栏 */}
        {worksTotal > worksPageSize && (
          <div className="flex items-center justify-between pt-2 border-t border-stone-100 text-[12px] text-stone-500">
            <span>共 {worksTotal} 条作品 · 第 {worksPage} / {totalPages} 页</span>
            <div className="flex items-center gap-1.5">
              <Button
                size="xs"
                variant="outline"
                disabled={worksPage <= 1 || loadingWorks}
                onClick={() => handlePageChange(worksPage - 1)}
                className="h-7 text-[12px]"
              >
                上一页
              </Button>
              <Button
                size="xs"
                variant="outline"
                disabled={worksPage >= totalPages || loadingWorks}
                onClick={() => handlePageChange(worksPage + 1)}
                className="h-7 text-[12px]"
              >
                下一页
              </Button>
            </div>
          </div>
        )}

        {/* 同类参考作品 (问题 3) */}
        {similarReferences.length > 0 && (
          <div className="mt-4 pt-4 border-t border-stone-150 space-y-2">
            <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-stone-700">
              <Film className="size-3.5 text-[#4F5E96]" />
              <span>同类参考作品推荐 ({similarReferences.length})</span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {similarReferences.map((ref, idx) => (
                <div key={ref.id || idx} className="p-3 rounded-xl border border-stone-200 bg-stone-50/20 text-[12px] space-y-1">
                  <div className="font-medium text-stone-850 truncate">{ref.video_title || ref.title || "未命名参考"}</div>
                  <div className="flex items-center justify-between text-[11px] text-stone-400">
                    <span>{ref.account_name || "全库爆款参考"}</span>
                    {(() => {
                      const playCount = ref.play_count ?? ref.video_metrics_snapshots?.[0]?.play_count;
                      if (typeof playCount === "number") {
                        return (
                          <span className="font-semibold text-stone-700 tabular-nums">
                            {playCount >= 10000 ? `${(playCount / 10000).toFixed(1)}w` : playCount} 播放
                          </span>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 编辑 Modal */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-lg p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-stone-900 text-[16px] font-bold">编辑选题</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4 mt-2">
            <div className="space-y-1">
              <label className="text-[12px] font-medium text-stone-600">选题标题 (必填)</label>
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full h-9 rounded-xl border border-stone-200 px-3 text-[13px] outline-none focus:border-[#D97757]"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-[12px] font-medium text-stone-600">一句话钩子 (选填)</label>
              <textarea
                value={editHook}
                onChange={(e) => setEditHook(e.target.value)}
                className="w-full h-20 rounded-xl border border-stone-200 p-3 text-[13px] outline-none focus:border-[#D97757] resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[12px] font-medium text-stone-600">情绪标签</label>
                <input
                  value={editEmotionTag}
                  onChange={(e) => setEditEmotionTag(e.target.value)}
                  className="w-full h-9 rounded-xl border border-stone-200 px-3 text-[13px] outline-none focus:border-[#D97757]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[12px] font-medium text-stone-600">目标受众</label>
                <input
                  value={editAudience}
                  onChange={(e) => setEditAudience(e.target.value)}
                  className="w-full h-9 rounded-xl border border-stone-200 px-3 text-[13px] outline-none focus:border-[#D97757]"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditDialogOpen(false)}>取消</Button>
              <Button type="submit" size="sm" disabled={isSubmittingEdit} className="bg-[#D97757] text-white">
                {isSubmittingEdit ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}保存修改
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* 删除 Modal & 409 阻断 Dialog (对齐规格提供 取消 / 去看关联作品 问题 4) */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md p-5 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-stone-900 text-[15px] font-bold flex items-center gap-2">
              <AlertTriangle className="size-4 text-[#C9604D]" />
              <span>删除选题确认</span>
            </DialogTitle>
          </DialogHeader>

          {deleteErrorMsg ? (
            <div className="space-y-4 py-2">
              <div className="rounded-xl bg-[#C9604D]/10 p-3.5 border border-[#C9604D]/25 text-[12.5px] text-[#C9604D] leading-relaxed">
                {deleteErrorMsg}
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                  取消
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setDeleteDialogOpen(false);
                    document.getElementById("associated-works-section")?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="bg-[#5F82A8] text-white hover:bg-[#5F82A8]/90"
                >
                  去看关联作品
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <p className="text-[13px] text-stone-600">
                确认要删除此选题吗？若该选题已有作品关联，系统将拦截阻断。
              </p>
              <div className="flex items-center justify-end gap-2">
                <Button type="button" size="sm" variant="outline" disabled={isDeleting} onClick={() => setDeleteDialogOpen(false)}>
                  取消
                </Button>
                <Button type="button" size="sm" disabled={isDeleting} onClick={() => void handleDeleteSubmit()} className="bg-[#C9604D] text-white hover:bg-[#C9604D]/90">
                  {isDeleting ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
                  确认删除
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 5/5 替换弹窗 */}
      <Dialog open={replaceDialogOpen} onOpenChange={setReplaceDialogOpen}>
        <DialogContent className="sm:max-w-md p-5 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-stone-900 text-[15px] font-semibold flex items-center gap-2">
              <ArrowRightLeft className="size-4 text-[#D97757]" />
              <span>候选位已满 (5/5) · 请选择替换</span>
            </DialogTitle>
            <DialogDescription className="text-stone-500 text-[12.5px]">
              您的候选选题库已达 5 条上限。请选择一条放回选题池，以便腾出空间认领本题。
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 space-y-2 max-h-[220px] overflow-y-auto pr-1">
            {activeCandidateItems.map((item) => {
              const isSelected = selectedReturnId === item.id;
              const claimRecord = item.sub_topic_claims?.find((c) => c.user_id === currentUserId);
              const claimedAtText = claimRecord?.claimed_at
                ? new Date(claimRecord.claimed_at).toLocaleString()
                : "已认领";

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
                    <div className="text-[13px] font-medium text-stone-900 truncate">
                      {item.title || "未命名选题"}
                    </div>
                    <div className="text-[11px] text-stone-400">
                      认领时间: {claimedAtText}
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
