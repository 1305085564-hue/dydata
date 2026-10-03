import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type {
  TopicClaimsDetailResponse,
  TopicWorksResponse,
  SubTopicItem,
} from "@/components/topics-v2/types";
import { parseTopicWorksResponse } from "@/lib/topics/v2-client-contract";

const emptySubscribe = () => () => {};

export type WorksSort = "best" | "recent";

export function worksCacheKey(sort: WorksSort, page: number) {
  return `${sort}:${page}`;
}

/** /works 接口原始行 → 抽屉统一卡片模型 */
export function mapRawWorksToResponse(data: unknown): TopicWorksResponse {
  const parsed = parseTopicWorksResponse(data);
  return {
    items: parsed.items,
    similarReferences: parsed.similarReferences,
    summary: parsed.summary,
    pagination: parsed.pagination,
  };
}

export function useTopicWorkBreakdownState({
  initialSubTopic,
  subTopicId,
  onClose,
  onNavigateTopic,
  hasPrevTopic,
  hasNextTopic,
}: {
  initialSubTopic?: SubTopicItem | null;
  subTopicId: string | null;
  onClose: () => void;
  onNavigateTopic?: (direction: "prev" | "next") => void;
  hasPrevTopic: boolean;
  hasNextTopic: boolean;
}) {
  const isMounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [subTopicInfo, setSubTopicInfo] = useState<SubTopicItem | null>(() => initialSubTopic ?? null);
  const [worksData, setWorksData] = useState<TopicWorksResponse | null>(null);
  const [claimsData, setClaimsData] = useState<TopicClaimsDetailResponse | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [claimsError, setClaimsError] = useState<string | null>(null);
  const [membershipRequired, setMembershipRequired] = useState(false);
  const loadRequestId = useRef(0);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  // 作品分页 + 排序：详情自带的首页（最高播放）作为缓存种子，翻页/切排序才发请求
  const [worksCache, setWorksCache] = useState<Record<string, TopicWorksResponse>>({});
  const [worksQuery, setWorksQuery] = useState<{ page: number; sort: WorksSort }>({ page: 1, sort: "best" });
  const [worksLoading, setWorksLoading] = useState(false);
  const [worksError, setWorksError] = useState<string | null>(null);
  const worksRequestId = useRef(0);

  // 编辑表单字段（仅选题作者可见）
  const [editTitle, setEditTitle] = useState("");
  const [editHook, setEditHook] = useState("");
  const [editEmotionTag, setEditEmotionTag] = useState("");
  const [editAudience, setEditAudience] = useState("");
  const [editTitleError, setEditTitleError] = useState("");
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // 抽屉内模式切换（detail | edit | confirm_delete · 彻底消除抽屉套弹窗）
  const [drawerMode, setDrawerMode] = useState<"detail" | "edit" | "confirm_delete">("detail");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteErrorMsg, setDeleteErrorMsg] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    const targetEl = previousActiveElement.current;
    onClose();
    if (targetEl && typeof targetEl.focus === "function") {
      window.setTimeout(() => {
        try {
          targetEl.focus();
        } catch {
          // ignore
        }
      }, 50);
    }
  }, [onClose]);

  // Focus Management & Esc Key Support
  useEffect(() => {
    if (subTopicId) {
      previousActiveElement.current =
        document.activeElement as HTMLElement | null;
      try {
        closeBtnRef.current?.focus();
      } catch {
        // ignore
      }
    }
    return () => {
      if (
        previousActiveElement.current &&
        typeof previousActiveElement.current.focus === "function"
      ) {
        try {
          previousActiveElement.current.focus();
        } catch {
          // ignore
        }
      }
    };
  }, [initialSubTopic, subTopicId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && subTopicId) {
        handleClose();
        return;
      }
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (drawerMode !== "detail") return;

      if ((e.key === "j" || e.key === "J" || e.key === "ArrowDown") && hasNextTopic) {
        e.preventDefault();
        onNavigateTopic?.("next");
      } else if ((e.key === "k" || e.key === "K" || e.key === "ArrowUp") && hasPrevTopic) {
        e.preventDefault();
        onNavigateTopic?.("prev");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [subTopicId, drawerMode, handleClose, hasNextTopic, hasPrevTopic, onNavigateTopic]);

  return {
    isMounted,
    isLoading,
    setIsLoading,
    subTopicInfo,
    setSubTopicInfo,
    worksData,
    setWorksData,
    claimsData,
    setClaimsData,
    detailError,
    setDetailError,
    claimsError,
    setClaimsError,
    membershipRequired,
    setMembershipRequired,
    loadRequestId,
    closeBtnRef,
    worksCache,
    setWorksCache,
    worksQuery,
    setWorksQuery,
    worksLoading,
    setWorksLoading,
    worksError,
    setWorksError,
    worksRequestId,
    editTitle,
    setEditTitle,
    editHook,
    setEditHook,
    editEmotionTag,
    setEditEmotionTag,
    editAudience,
    setEditAudience,
    editTitleError,
    setEditTitleError,
    isSubmittingEdit,
    setIsSubmittingEdit,
    drawerMode,
    setDrawerMode,
    isDeleting,
    setIsDeleting,
    deleteErrorMsg,
    setDeleteErrorMsg,
    handleClose,
  };
}

export type TopicWorkBreakdownState = ReturnType<typeof useTopicWorkBreakdownState>;
