import { useCallback, useEffect } from "react";
import type React from "react";
import {
  fetchTopicJson,
  parseClaimsResponse,
  parseSubTopicDetailResponse,
  isTeamMembershipRequiredError,
  DETAIL_PAGE_SIZE,
} from "@/lib/topics/v2-client-contract";
import { feedbackToast } from "@/components/ui/feedback-toast";
import type { SubTopicItem } from "@/components/topics-v2/types";
import {
  mapRawWorksToResponse,
  type TopicWorkBreakdownState,
  worksCacheKey,
  type WorksSort,
} from "@/lib/topics/domain/work-breakdown";

/* eslint-disable react-hooks/exhaustive-deps */

export function useTopicWorkBreakdownData({
  subTopicId,
  initialSubTopic,
  onSubTopicUpdated,
  onSubTopicRemoved,
  state,
}: {
  subTopicId: string | null;
  initialSubTopic?: SubTopicItem | null;
  onSubTopicUpdated?: (subTopic: SubTopicItem) => void;
  onSubTopicRemoved?: (subTopicId: string) => void;
  state: TopicWorkBreakdownState;
}) {
  const {
    setIsLoading,
    setSubTopicInfo,
    setWorksData,
    setClaimsData,
    setDetailError,
    setClaimsError,
    setMembershipRequired,
    loadRequestId,
    worksCache,
    setWorksCache,
    setWorksQuery,
    setWorksLoading,
    setWorksError,
    worksRequestId,
    setEditTitle,
    setEditHook,
    setEditEmotionTag,
    setEditAudience,
    setEditTitleError,
    setIsSubmittingEdit,
    setDrawerMode,
    setIsDeleting,
    setDeleteErrorMsg,
    handleClose,
    subTopicInfo,
    editTitle,
    editHook,
    editEmotionTag,
    editAudience,
  } = state;

  const loadWorksPage = useCallback(
    async (page: number, sort: WorksSort) => {
      if (!subTopicId) return;
      const key = worksCacheKey(sort, page);
      setWorksQuery({ page, sort });
      setWorksError(null);
      if (worksCache[key]) return;

      const requestId = ++worksRequestId.current;
      setWorksLoading(true);
      try {
        const data = await fetchTopicJson(
          `/api/topics/sub-topics/${subTopicId}/works?page=${page}&page_size=${DETAIL_PAGE_SIZE}&sort=${sort}`,
        );
        if (requestId !== worksRequestId.current) return;
        const mapped = mapRawWorksToResponse(data);
        setWorksCache((prev) => ({ ...prev, [key]: mapped }));
      } catch (error) {
        if (requestId !== worksRequestId.current) return;
        setWorksError(error instanceof Error ? error.message : "作品加载失败");
      } finally {
        if (requestId === worksRequestId.current) setWorksLoading(false);
      }
    },
    [subTopicId, worksCache],
  );

  const loadData = useCallback(async () => {
    if (!subTopicId) return;
    const requestId = ++loadRequestId.current;
    setIsLoading(true);
    setSubTopicInfo((prev) => prev?.id === subTopicId ? prev : (initialSubTopic?.id === subTopicId ? initialSubTopic : null));
    setWorksData(null);
    setClaimsData(null);
    setDetailError(null);
    setClaimsError(null);
    setMembershipRequired(false);
    setWorksCache({});
    setWorksQuery({ page: 1, sort: "best" });
    setWorksError(null);

    // detail 接口内部已用相同参数（sort=best, page=1, pageSize=20）查询 works 并随详情返回，
    // 不再单独请求 /works，避免同一份作品查两次
    const [detailResult, claimsResult] = await Promise.allSettled([
      fetchTopicJson(`/api/topics/sub-topics/${subTopicId}`),
      fetchTopicJson(`/api/topics/sub-topics/${subTopicId}/claims`),
    ]);

    if (requestId !== loadRequestId.current) return;

    if ([detailResult, claimsResult].some(
      (result) => result.status === "rejected" && isTeamMembershipRequiredError(result.reason),
    )) {
      setMembershipRequired(true);
      setIsLoading(false);
      return;
    }

    if (detailResult.status === "fulfilled") {
      try {
        const parsedDetail = parseSubTopicDetailResponse(detailResult.value);
        setSubTopicInfo(parsedDetail.subTopic as SubTopicItem);
        setWorksData(parsedDetail.works);
        setWorksCache({ [worksCacheKey("best", 1)]: parsedDetail.works });
      } catch (error) {
        setDetailError(error instanceof Error ? error.message : "详情结构无效");
      }
    } else {
      setDetailError(
        detailResult.reason instanceof Error
          ? detailResult.reason.message
          : "详情加载失败",
      );
    }

    if (claimsResult.status === "fulfilled") {
      try {
        const parsed = parseClaimsResponse(claimsResult.value);
        setClaimsData({
          candidateCount: parsed.candidateCount,
          scriptingCount: parsed.scriptingCount,
          inProgressCount: parsed.inProgressCount,
          claims: parsed.claims.map((claim) => ({
            id: claim.id ?? `${claim.userId}:${claim.status}`,
            userId: claim.userId,
            displayName: claim.displayName,
            status: claim.status,
            claimedAt: claim.claimedAt,
          })),
          recent7dSummary: parsed.recent7dSummary,
        });
      } catch (error) {
        setClaimsError(
          error instanceof Error ? error.message : "参与动态结构无效",
        );
      }
    } else {
      setClaimsError(
        claimsResult.reason instanceof Error
          ? claimsResult.reason.message
          : "参与动态加载失败",
      );
    }
    setIsLoading(false);
  }, [initialSubTopic, subTopicId]);

  useEffect(() => {
    if (subTopicId) void loadData();
  }, [loadData, subTopicId]);

  const openEditDialog = useCallback(() => {
    if (!subTopicInfo) return;
    setEditTitle(subTopicInfo.title ?? "");
    setEditHook(subTopicInfo.hook ?? "");
    setEditEmotionTag(subTopicInfo.emotion_tag ?? "");
    setEditAudience(subTopicInfo.audience ?? "");
    setEditTitleError("");
    setDrawerMode("edit");
  }, [subTopicInfo]);

  const handleEditSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!subTopicId) return;
      if (!editTitle.trim()) {
        setEditTitleError("标题不能为空");
        return;
      }
      setEditTitleError("");
      setIsSubmittingEdit(true);
      try {
        const data = await fetchTopicJson(`/api/topics/sub-topics/${subTopicId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: editTitle.trim(),
            hook: editHook.trim() || null,
            emotion_tag: editEmotionTag.trim() || null,
            audience: editAudience.trim() || null,
          }),
        });
        const payload = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
        const updatedRaw = (payload.value ?? payload) as Record<string, unknown>;
        setSubTopicInfo((prev) =>
          prev
            ? {
                ...prev,
                title: typeof updatedRaw.title === "string" ? updatedRaw.title : prev.title,
                hook: typeof updatedRaw.hook === "string" || updatedRaw.hook === null ? updatedRaw.hook as string | null : prev.hook,
                emotion_tag: typeof updatedRaw.emotion_tag === "string" || updatedRaw.emotion_tag === null ? updatedRaw.emotion_tag as string | null : prev.emotion_tag,
                audience: typeof updatedRaw.audience === "string" || updatedRaw.audience === null ? updatedRaw.audience as string | null : prev.audience,
              }
            : prev,
        );
        setDrawerMode("detail");
        feedbackToast.success("修改成功");
        if (onSubTopicUpdated && subTopicInfo) {
          onSubTopicUpdated({
            ...subTopicInfo,
            title: editTitle.trim(),
            hook: editHook.trim() || null,
            emotion_tag: editEmotionTag.trim() || null,
            audience: editAudience.trim() || null,
          });
        }
      } catch (error) {
        if (isTeamMembershipRequiredError(error)) setMembershipRequired(true);
        feedbackToast.error("修改失败", {
          details: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setIsSubmittingEdit(false);
      }
    },
    [editAudience, editEmotionTag, editHook, editTitle, onSubTopicUpdated, subTopicId, subTopicInfo],
  );

  const handleDeleteSubmit = useCallback(async () => {
    if (!subTopicId) return;
    setIsDeleting(true);
    setDeleteErrorMsg(null);
    try {
      await fetchTopicJson(`/api/topics/sub-topics/${subTopicId}`, { method: "DELETE" });
      setDrawerMode("detail");
      feedbackToast.success("已移出题库，历史作品数据完整保留");
      onSubTopicRemoved?.(subTopicId);
      handleClose();
    } catch (error) {
      if (isTeamMembershipRequiredError(error)) {
        setMembershipRequired(true);
        setDrawerMode("detail");
        return;
      }
      const status = (error as { status?: number }).status;
      if (status === 409) {
        setDeleteErrorMsg("该选题已有关联作品，移出将保留历史数据。");
        return;
      }
      feedbackToast.error("移出失败", {
        details: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsDeleting(false);
    }
  }, [handleClose, onSubTopicRemoved, subTopicId]);

  return {
    loadWorksPage,
    openEditDialog,
    handleEditSubmit,
    handleDeleteSubmit,
  };
}

/* eslint-enable react-hooks/exhaustive-deps */
