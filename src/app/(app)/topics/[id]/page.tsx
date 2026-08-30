"use client";

import { useEffect, useState, useCallback, use, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  parseSubTopicDetailResponse,
  parseSubTopicWorksResponse,
  DETAIL_PAGE_SIZE,
  type SubTopicDetail,
  type WorkItem,
  type ReferenceWork,
  type TopicWorksSummary,
} from "../topic-helpers";
import {
  ChevronLeft,
  Loader2,
  AlertTriangle,
  Edit2,
  Trash2,
  RefreshCw,
  Sparkles,
  Flame,
  Trophy,
  FileText,
} from "lucide-react";
import { formatShanghaiDateOnly } from "@/lib/loaders/shared";
import {
  isTeamMembershipRequiredError,
  TopicRequestError,
} from "@/lib/topics/v2-client-contract";
import { FeishuCreationModal } from "@/components/topics-v2/FeishuCreationModal";
import { feedbackToast } from "@/components/ui/feedback-toast";

async function readTopicResponse(response: Response, fallback: string) {
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : fallback;
    const code =
      typeof payload === "object" &&
      payload !== null &&
      "code" in payload &&
      typeof payload.code === "string"
        ? payload.code
        : undefined;
    throw new TopicRequestError(message, response.status, code);
  }
  return payload;
}

interface ClaimsApiResponse {
  claims: Array<{
    id?: string;
    userId: string;
    displayName: string;
    status: "writing";
    claimedAt: string;
  }>;
  candidateCount: number;
  scriptingCount: number;
  recent7dSummary?: {
    participants: number;
    completedCount: number;
    inProgressCount: number;
  } | null;
}

interface MyClaimSubTopicItem {
  id: string;
  title: string;
  hook?: string | null;
  sub_topic_claims?: Array<{
    id: string;
    user_id: string;
    status: "writing";
    claimed_at: string;
  }>;
}

export default function SubTopicDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const subTopicId = resolvedParams.id;
  const router = useRouter();

  const [detail, setDetail] = useState<SubTopicDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [membershipRequired, setMembershipRequired] = useState(false);

  // 7 天参与动态
  const [claimsData, setClaimsData] = useState<ClaimsApiResponse>({
    claims: [],
    candidateCount: 0,
    scriptingCount: 0,
  });
  const [claimsError, setClaimsError] = useState<string | null>(null);

  // 团队固定飞书空间地址（服务端配置，非法地址不下发）
  const [feishuWorkspaceUrl, setFeishuWorkspaceUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/topics/feishu-workspace");
        if (!res.ok) return;
        const data = (await res.json()) as { url?: string | null };
        if (!cancelled) setFeishuWorkspaceUrl(typeof data.url === "string" && data.url ? data.url : null);
      } catch {
        // 未拿到配置时按未配置处理，不伪造地址
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 我的写作状态
  const [myClaims, setMyClaims] = useState<MyClaimSubTopicItem[]>([]);
  const [myClaimsError, setMyClaimsError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");

  // 飞书弹窗控制
  const [isFeishuModalOpen, setIsFeishuModalOpen] = useState(false);

  // 作品列表、排序与分页
  const [works, setWorks] = useState<WorkItem[]>([]);
  const [worksSummary, setWorksSummary] = useState<TopicWorksSummary | null>(null);
  const [, setSimilarReferences] = useState<ReferenceWork[]>([]);
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

  const markMembershipRequired = (error: unknown) => {
    if (isTeamMembershipRequiredError(error)) setMembershipRequired(true);
  };

  // 加载当前登录用户
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch("/api/dashboard/operator-members");
        if (res.ok) {
          const data = await res.json();
          if (data?.currentUserId) setCurrentUserId(data.currentUserId);
        }
      } catch {
        // ignore
      }
    };
    void fetchUser();
  }, []);

  // 加载“我的认领”状态列表
  const fetchMyClaims = useCallback(async () => {
    setMyClaimsError(null);
    try {
      const res = await fetch("/api/topics/pool?view=my_claims");
      const data = (await readTopicResponse(
        res,
        "获取我的写作状态失败",
      )) as { items?: unknown[] };
      setMyClaims((data.items ?? []) as MyClaimSubTopicItem[]);
    } catch (err) {
      markMembershipRequired(err);
      setMyClaimsError(
        err instanceof Error ? err.message : "获取我的写作状态失败",
      );
    }
  }, []);

  // 加载作品列表
  const fetchWorks = useCallback(
    async (page = 1, sort: "best" | "recent" = "best") => {
      setLoadingWorks(true);
      try {
        const res = await fetch(
          `/api/topics/sub-topics/${subTopicId}/works?page=${page}&page_size=${DETAIL_PAGE_SIZE}&sort=${sort}`,
        );
        const data = await readTopicResponse(res, "获取作品失败");
        const parsed = parseSubTopicWorksResponse(data);
        setWorks(parsed.items);
        setSimilarReferences(parsed.similarReferences);
        setWorksSummary(parsed.summary);
        setWorksTotal(parsed.total);
        setWorksPage(parsed.page);
        setWorksPageSize(parsed.pageSize);
      } catch (err) {
        markMembershipRequired(err);
        console.error("加载作品数据失败:", err);
      } finally {
        setLoadingWorks(false);
      }
    },
    [subTopicId],
  );

  // 加载详情接口
  const fetchDetail = useCallback(async () => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/topics/sub-topics/${subTopicId}`);
      const data = await readTopicResponse(res, "选题不存在或已被删除");

      const parsed = parseSubTopicDetailResponse(data);
      setDetail(parsed.subTopic);
      setEditTitle(parsed.subTopic?.title || "");
      setEditHook(parsed.subTopic?.hook || "");
      setEditEmotionTag(parsed.subTopic?.emotion_tag || "");
      setEditAudience(parsed.subTopic?.audience || "");
      setWorksSummary(parsed.worksSummary);

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
      markMembershipRequired(err);
      feedbackToast.error("加载详情失败", {
        details: err instanceof Error ? err.message : String(err),
      });
      setDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }, [subTopicId, fetchWorks]);

  // 加载参与动态
  const fetchClaims = useCallback(async () => {
    setClaimsError(null);
    try {
      const res = await fetch(`/api/topics/sub-topics/${subTopicId}/claims`);
      const data = (await readTopicResponse(
        res,
        "获取参与动态失败",
      )) as Partial<ClaimsApiResponse>;
      setClaimsData({
        claims: Array.isArray(data.claims) ? data.claims : [],
        candidateCount: data.candidateCount ?? 0,
        scriptingCount: data.scriptingCount ?? 0,
        recent7dSummary: data.recent7dSummary && typeof data.recent7dSummary.participants === "number"
          ? {
              participants: data.recent7dSummary.participants,
              completedCount: data.recent7dSummary.completedCount ?? 0,
              inProgressCount: data.recent7dSummary.inProgressCount ?? 0,
            }
          : null,
      });
    } catch (err) {
      markMembershipRequired(err);
      setClaimsError(err instanceof Error ? err.message : "获取参与动态失败");
    }
  }, [subTopicId]);

  const loadAllData = useCallback(async () => {
    await Promise.all([fetchDetail(), fetchClaims(), fetchMyClaims()]);
  }, [fetchDetail, fetchClaims, fetchMyClaims]);

  useEffect(() => {
    void loadAllData();
  }, [loadAllData]);

  const isOwner = Boolean(
    currentUserId && detail?.created_by === currentUserId,
  );

  // 解析当前用户写作状态
  const currentSubTopicItem = myClaims.find((item) => item.id === subTopicId);
  const myClaimRecord = currentSubTopicItem?.sub_topic_claims?.find(
    (c) => c.user_id === currentUserId && c.status === "writing",
  );
  const isWritingByMe = !!myClaimRecord;

  // V3：开始写作（幂等，允许多人同时写同一题），严格检查响应
  const handleMarkWriting = async (topicId: string) => {
    try {
      const res = await fetch(
        `/api/topics/sub-topics/${topicId}/start-scripting`,
        { method: "POST" },
      );
      if (!res.ok) {
        await readTopicResponse(res, `操作失败 (${res.status})`);
      }
      feedbackToast.success("已将选题加入在写清单");
      await loadAllData();
    } catch (err) {
      markMembershipRequired(err);
      feedbackToast.error("更新写作状态失败", {
        details: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // 取消写作
  const handleCancelWriting = async (topicId: string) => {
    try {
      const res = await fetch(`/api/topics/sub-topics/${topicId}/return`, {
        method: "POST",
      });
      if (!res.ok) {
        await readTopicResponse(res, `取消写作失败 (${res.status})`);
      }
      feedbackToast.success("已取消写作状态");
      await loadAllData();
    } catch (err) {
      markMembershipRequired(err);
      feedbackToast.error("取消写作失败", {
        details: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // 编辑提交
  const [editTitleError, setEditTitleError] = useState("");
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTitle.trim()) {
      setEditTitleError("标题不能为空");
      return;
    }
    setEditTitleError("");
    setIsSubmittingEdit(true);
    try {
      const res = await fetch(`/api/topics/sub-topics/${subTopicId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle.trim(),
          hook: editHook.trim() || null,
          emotion_tag: editEmotionTag.trim() || null,
          audience: editAudience.trim() || null,
        }),
      });
      await readTopicResponse(res, "修改失败");
      setEditDialogOpen(false);
      await loadAllData();
      feedbackToast.success("修改成功");
    } catch (err) {
      markMembershipRequired(err);
      feedbackToast.error("修改失败", {
        details: err instanceof Error ? err.message : String(err),
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
        method: "DELETE",
      });
      if (res.status === 409) {
        setDeleteErrorMsg("该选题已有关联作品，移出将保留历史数据。");
        return;
      }
      await readTopicResponse(res, "删除失败");
      router.push("/topics");
    } catch (err) {
      markMembershipRequired(err);
      feedbackToast.error("删除失败", {
        details: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // 分页与排序
  const handleSortChange = (newSort: "best" | "recent") => {
    setWorksSort(newSort);
    void fetchWorks(1, newSort);
  };

  const handlePageChange = (newPage: number) => {
    void fetchWorks(newPage, worksSort);
  };

  if (membershipRequired) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-12 text-center">
        <h1 className="text-lg font-medium text-[#1C1917]">请先申请加入团队</h1>
        <p className="max-w-md text-sm leading-relaxed text-[#78716C]">
          当前账号还没有有效团队归属，选题详情和创作协作暂不可用。
        </p>
        <Link href="/topics">
          <Button variant="outline" size="sm" className="min-h-[44px] sm:min-h-0">
            返回选题库申请加入
          </Button>
        </Link>
      </div>
    );
  }

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
        <p className="text-[14px] text-[#78716C]">
          无法显示选题信息，该选题可能已被移出或删除。
        </p>
        <Link href="/topics">
          <Button variant="outline" size="sm" className="min-h-[44px] sm:min-h-0">
            返回选题库
          </Button>
        </Link>
      </div>
    );
  }

  const totalPages = Math.ceil(worksTotal / worksPageSize) || 1;

  // 历史指标读取服务端对全部作品计算的摘要，不用当前分页的 20 条冒充全量结果。
  const bestPlay = worksSummary?.bestPlayCount ?? null;
  const avgPlay = worksSummary?.averagePlayCount ?? null;
  const qualifiedCount = worksSummary?.qualifiedWorkCount ?? null;

  // 近 7 天热度：只使用服务端唯一口径的三值，缺失显示未知态，绝不回退旧累计数据
  const total7dParticipants =
    typeof claimsData.recent7dSummary?.participants === "number"
      ? claimsData.recent7dSummary.participants
      : null;

  return (
    <div className="max-w-5xl mx-auto pb-16 px-4 sm:px-6 space-y-6">
      {/* 顶部返回与管理入口 */}
      <div className="flex items-center justify-between pb-1">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex min-h-[44px] items-center gap-1.5 text-[13px] font-medium text-[#78716C] hover:text-[#1C1917] transition-colors py-2 px-1 cursor-pointer"
        >
          <ChevronLeft className="size-4 text-[#78716C]" />
          <span>返回干货选题库</span>
        </button>

        {isOwner && (
          <div className="flex items-center gap-2">
            <Button
              size="xs"
              variant="outline"
              onClick={() => setEditDialogOpen(true)}
              className="h-auto min-h-[44px] sm:min-h-0 sm:h-8 px-3 rounded-xl border-[#E5E0D6] bg-white text-[#292524] hover:bg-[#FAF8F4] hover:text-[#1C1917] gap-1.5 text-[12px] font-medium transition-all cursor-pointer"
            >
              <Edit2 className="size-3.5 text-[#78716C]" />
              <span>编辑选题</span>
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={() => setDeleteDialogOpen(true)}
              className="h-auto min-h-[44px] sm:min-h-0 sm:h-8 px-3 rounded-xl border-[#E5E0D6] bg-white text-[#C9604D] hover:bg-[#C9604D]/5 gap-1.5 text-[12px] font-medium transition-all cursor-pointer"
            >
              <Trash2 className="size-3.5 text-[#C9604D]" />
              <span>移出题库</span>
            </Button>
          </div>
        )}
      </div>

      {/* 错误提示 */}
      {myClaimsError && (
        <div className="flex items-center justify-between rounded-xl border border-[#D99E55]/20 bg-[#D99E55]/5 px-4 py-3 text-[12.5px] text-[#292524]">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-[#D99E55] shrink-0" />
            <span>状态加载失败：{myClaimsError}</span>
          </div>
          <Button
            size="xs"
            variant="outline"
            onClick={() => void fetchMyClaims()}
            className="h-auto min-h-[44px] sm:min-h-0 sm:h-7 text-[12px] border-[#E5E0D6] bg-white"
          >
            <RefreshCw className="size-3 mr-1" />
            重试
          </Button>
        </div>
      )}

      {/* 主画布 L1 空间 */}
      <div className="space-y-8 pb-16">
        {/* 1. 选题基本描述与主行动 */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-5">
            <div className="space-y-2 flex-1 min-w-0">
              {detail.topics && (
                <span className="inline-flex items-center rounded-md bg-[#FAF8F4] border border-[#ECE7DE] px-2.5 py-0.5 text-[11.5px] font-medium text-[#57534E]">
                  {detail.topics.name}
                </span>
              )}
              <h1 className="text-2xl font-semibold text-[#1C1917] leading-[1.33] tracking-tight">
                {detail.title}
              </h1>
            </div>

            {/* 主行动按钮 (聚光灯原则：陶土橙 `#D97757`) */}
            <div className="flex items-center gap-2 shrink-0 pt-0.5">
              <Button
                onClick={() => setIsFeishuModalOpen(true)}
                className="h-11 sm:h-9.5 min-h-[44px] px-6 rounded-xl bg-[#D97757] hover:bg-[#C46A4D] active:scale-[0.985] active:duration-75 text-white font-semibold text-[13px] shadow-xs transition-all cursor-pointer"
              >
                {isWritingByMe ? "已在写 · 去飞书创作" : "去飞书创作"}
              </Button>

              {isWritingByMe && (
                <Button
                  variant="outline"
                  onClick={() => void handleCancelWriting(subTopicId)}
                  className="h-11 sm:h-9.5 min-h-[44px] px-3.5 rounded-xl border-[#E5E0D6] bg-white hover:bg-[#FAF8F4] text-[#78716C] hover:text-[#C9604D] text-[12.5px] transition-colors cursor-pointer"
                >
                  取消写作
                </Button>
              )}
            </div>
          </div>

          {/* 一句话 Hook (凹槽 Inset) */}
          {detail.hook && (
            <div className="rounded-2xl bg-[#FAF8F4] border border-[#ECE7DE] p-4 text-[13px] text-[#292524] leading-relaxed space-y-1 shadow-2xs">
              <div className="font-medium text-[#1C1917] text-[12.5px] flex items-center gap-1.5">
                <Sparkles className="size-3.5 text-[#D97757]" />
                <span>一句话立意 Hook</span>
              </div>
              <p className="text-[#292524]">“{detail.hook}”</p>
            </div>
          )}

          {/* 元属性横条 */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] text-[#78716C] pt-1">
            {detail.emotion_tag && (
              <span className="flex items-center gap-1.5">
                <span>情绪标签:</span>
                <strong className="text-[#292524] font-medium">
                  {detail.emotion_tag}
                </strong>
              </span>
            )}
            {detail.audience && (
              <span className="flex items-center gap-1.5">
                <span>目标受众:</span>
                <strong className="text-[#292524] font-medium">
                  {detail.audience}
                </strong>
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <span>录入时间:</span>
              <strong className="text-[#292524] font-normal">
                {formatShanghaiDateOnly(new Date(detail.created_at))}
              </strong>
            </span>
          </div>
        </div>

        {/* 2. 历史验证数据双轨 */}
        <section className="space-y-3 pt-6 border-t border-[#ECE7DE]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="size-4 text-[#D97757]" />
              <h2 className="text-base font-semibold text-[#1C1917]">
                历史数据验证
              </h2>
            </div>
            <span className="text-[12px] text-[#78716C]">
              真实跑出过的成绩证明
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-[#ECE7DE] bg-white p-4.5 space-y-1 shadow-2xs">
              <div className="text-xs text-[#78716C]">历史最高播放</div>
              <div className="text-2xl font-semibold text-[#D97757] tabular-nums">
                {bestPlay !== null
                  ? bestPlay >= 10000
                    ? `${(bestPlay / 10000).toFixed(1)}万`
                    : bestPlay.toLocaleString()
                  : "—"}
              </div>
              <p className="text-[11px] text-[#78716C]">
                作品中达到的最高播放峰值
              </p>
            </div>

            <div className="rounded-2xl border border-[#ECE7DE] bg-white p-4.5 space-y-1 shadow-2xs">
              <div className="text-xs text-[#78716C]">平均播放量</div>
              <div className="text-2xl font-semibold text-[#1C1917] tabular-nums">
                {avgPlay !== null
                  ? avgPlay >= 10000
                    ? `${(avgPlay / 10000).toFixed(1)}万`
                    : avgPlay.toLocaleString()
                  : "—"}
              </div>
              <p className="text-[11px] text-[#78716C]">多条复用作品均值表现</p>
            </div>

            <div className="rounded-2xl border border-[#ECE7DE] bg-white p-4.5 space-y-1 shadow-2xs">
              <div className="text-xs text-[#78716C]">达标优质作品</div>
              <div className="text-2xl font-semibold text-[#6FAA7D] tabular-nums">
                {qualifiedCount !== null ? `${qualifiedCount} 条` : "—"}
              </div>
              <p className="text-[11px] text-[#78716C]">
                24h 播放 ≥ 3 万的验证成片
              </p>
            </div>
          </div>
        </section>

        {/* 3. 近 7 天参与热度 */}
        <section className="space-y-3 pt-6 border-t border-[#ECE7DE]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Flame className="size-4 text-[#D97757]" />
              <h2 className="text-base font-semibold text-[#1C1917]">
                近 7 天参与热度
              </h2>
            </div>
            <span className="text-xs text-[#D97757] font-semibold tabular-nums">
              近 7 天 {total7dParticipants !== null ? `${total7dParticipants} 人参与` : "—"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 rounded-2xl border border-[#ECE7DE] bg-[#FAF8F4] p-4 text-center">
            <div>
              <div className="text-xs text-[#78716C]">近 7 天已写完</div>
              <div className="text-xl font-semibold text-[#6FAA7D] tabular-nums mt-0.5">
                {claimsData.recent7dSummary ? `${claimsData.recent7dSummary.completedCount} 人` : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-[#78716C]">近 7 天仍在写</div>
              <div className="text-xl font-semibold text-[#43718E] tabular-nums mt-0.5">
                {claimsData.recent7dSummary ? `${claimsData.recent7dSummary.inProgressCount} 人` : "—"}
              </div>
            </div>
          </div>

          {claimsError && (
            <div className="rounded-xl border border-[#C0685C]/20 bg-[#C0685C]/5 p-3 text-xs text-[#C0685C]">
              参与动态加载失败：{claimsError}
            </div>
          )}

          {claimsData.claims.length > 0 && (
            <div className="space-y-1.5">
              {claimsData.claims.map((claim, idx) => (
                <div
                  key={claim.id || idx}
                  className="flex items-center justify-between rounded-xl bg-white border border-[#ECE7DE] px-4 py-2.5 text-xs shadow-2xs"
                >
                  <span className="font-medium text-[#1C1917]">
                    {claim.displayName}
                  </span>
                  <span className="px-2 py-0.5 rounded font-medium text-[11px] bg-[#43718E]/10 text-[#43718E]">
                    正在写
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 4. 历史关联作品记录 (无视频播放器与封面) */}
        <section className="space-y-3 pt-6 border-t border-[#ECE7DE]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-[#78716C]" />
              <h2 className="text-base font-semibold text-[#1C1917]">
                历史关联作品
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg bg-[#F5F3EE] p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => handleSortChange("best")}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    worksSort === "best"
                      ? "bg-white text-[#1C1917] font-medium shadow-2xs"
                      : "text-[#78716C] hover:text-[#1C1917]"
                  }`}
                >
                  最高播放
                </button>
                <button
                  type="button"
                  onClick={() => handleSortChange("recent")}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    worksSort === "recent"
                      ? "bg-white text-[#1C1917] font-medium shadow-2xs"
                      : "text-[#78716C] hover:text-[#1C1917]"
                  }`}
                >
                  最新发布
                </button>
              </div>
            </div>
          </div>

          {loadingWorks ? (
            <div className="py-12 text-center text-xs text-[#78716C]">
              <Loader2 className="size-4 animate-spin mx-auto mb-2" />
              <span>作品加载中...</span>
            </div>
          ) : works.length === 0 ? (
            <div className="py-12 text-center border border-dashed border-[#E5E0D6] rounded-2xl text-xs text-[#78716C]">
              暂无已关联的成片作品
            </div>
          ) : (
            <div className="space-y-2">
              {works.map((work) => {
                const playCount =
                  work.video_metrics_snapshots?.[0]?.play_count ?? null;
                const pubDate = work.uploaded_at || work.uploadedAt;

                return (
                  <div
                    key={work.id}
                    className="flex items-center justify-between rounded-xl border border-[#ECE7DE] bg-white p-4 text-xs hover:bg-[#FAF8F4] transition-colors shadow-2xs"
                  >
                    <div className="space-y-1 min-w-0 flex-1 pr-4">
                      <h4 className="font-semibold text-[#1C1917] truncate text-[13.5px]">
                        《{work.video_title || "未命名作品"}》
                      </h4>
                      <div className="text-[11.5px] text-[#78716C] flex items-center gap-3">
                        {work.account_name && (
                          <span>账号: @{work.account_name}</span>
                        )}
                        {pubDate && (
                          <span>
                            发布于 {new Date(pubDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-base font-semibold text-[#1C1917] tabular-nums">
                        {playCount
                          ? playCount >= 10000
                            ? `${(playCount / 10000).toFixed(1)}万`
                            : playCount.toLocaleString()
                          : "—"}
                      </div>
                      <div className="text-[11px] text-[#78716C]">播放量</div>
                    </div>
                  </div>
                );
              })}

              {/* 分页 */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-3">
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={worksPage <= 1}
                    onClick={() => handlePageChange(worksPage - 1)}
                  >
                    上一页
                  </Button>
                  <span className="text-xs text-[#78716C] tabular-nums">
                    {worksPage} / {totalPages}
                  </span>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={worksPage >= totalPages}
                    onClick={() => handlePageChange(worksPage + 1)}
                  >
                    下一页
                  </Button>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* 飞书创作弹窗 */}
      <FeishuCreationModal
        isOpen={isFeishuModalOpen}
        topic={
          detail
            ? {
                id: detail.id,
                title: detail.title,
                hook: detail.hook,
                audience: detail.audience,
                topics: detail.topics,
                myClaim: null,
              }
            : null
        }
        onClose={() => setIsFeishuModalOpen(false)}
        onMarkWriting={handleMarkWriting}
        onCancelWriting={handleCancelWriting}
        isWriting={isWritingByMe}
        feishuWorkspaceUrl={feishuWorkspaceUrl}
      />

      {/* 编辑弹窗 */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden max-w-md">
          <form
            onSubmit={handleEditSubmit}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <DialogHeader className="mb-0 border-b border-[#ECE7DE] pb-3">
              <DialogTitle>编辑干货选题</DialogTitle>
            </DialogHeader>

            <DialogBody className="min-h-0 flex-1 space-y-3 overflow-y-auto py-2">
              <div>
                <label className="text-xs font-medium text-[#1C1917] block mb-1">
                  选题标题 *
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full text-xs rounded-lg border border-[#E5E0D6] p-2 bg-[#FAF8F4]/50 focus:bg-white"
                />
                {editTitleError && (
                  <p className="text-xs text-[#C0685C] mt-1">{editTitleError}</p>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-[#1C1917] block mb-1">
                  一句话 Hook
                </label>
                <textarea
                  value={editHook}
                  onChange={(e) => setEditHook(e.target.value)}
                  rows={3}
                  className="w-full text-xs rounded-lg border border-[#E5E0D6] p-2 bg-[#FAF8F4]/50 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[#1C1917] block mb-1">
                    情绪标签
                  </label>
                  <input
                    type="text"
                    value={editEmotionTag}
                    onChange={(e) => setEditEmotionTag(e.target.value)}
                    className="w-full text-xs rounded-lg border border-[#E5E0D6] p-2 bg-[#FAF8F4]/50 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#1C1917] block mb-1">
                    目标受众
                  </label>
                  <input
                    type="text"
                    value={editAudience}
                    onChange={(e) => setEditAudience(e.target.value)}
                    className="w-full text-xs rounded-lg border border-[#E5E0D6] p-2 bg-[#FAF8F4]/50 focus:bg-white"
                  />
                </div>
              </div>
            </DialogBody>

            <DialogFooter className="mt-0 border-t border-[#ECE7DE] pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditDialogOpen(false)}
              >
                取消
              </Button>
              <Button type="submit" disabled={isSubmittingEdit}>
                {isSubmittingEdit ? "保存中..." : "保存修改"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 移出题库弹窗 */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>移出干货选题库</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-2 text-xs text-[#78716C]">
            <p>
              移出后该选题将停止在员工选题库中展示，但历史作品数据与复盘关联完整保留。
            </p>
            {deleteErrorMsg && (
              <p className="text-[#C0685C] font-medium">{deleteErrorMsg}</p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isDeleting}
              onClick={handleDeleteSubmit}
            >
              {isDeleting ? "移出中..." : "确认移出"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
