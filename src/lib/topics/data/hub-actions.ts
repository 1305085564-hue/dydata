import type { SubTopicItem } from "@/components/topics-v2/types";
import {
  fetchTopicJson,
  isTeamMembershipRequiredError,
  TopicRequestError,
} from "@/lib/topics/v2-client-contract";
import { runFeishuCreationFlow } from "@/components/topics-v2/feishu-creation-flow";
import { isTopicWritingByCurrentUser } from "@/components/topics-v2/topic-writing-state";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { useTopicHubState } from "../domain/hub-state";

type TopicHubState = ReturnType<typeof useTopicHubState>;

export function useTopicHubActions({
  state,
  refreshAll,
  feishuWorkspaceUrl,
  showToast,
}: {
  state: TopicHubState;
  refreshAll: () => Promise<void>;
  feishuWorkspaceUrl: string | null;
  showToast: (text: string, type?: "success" | "error") => void;
}) {
  const {
    writingTopicIds,
    setWritingTopicIds,
    setMembershipRequired,
  } = state;

  // 兼容性保留与旧契约映射已废除：V3 不再有 replace-claim / 候选位 / 撞车阻断
  // 开始写作（幂等；等待结果，失败返回 false，不显示成功）
  const handleMarkWriting = async (subTopicId: string): Promise<boolean> => {
    try {
      await fetchTopicJson(
        `/api/topics/sub-topics/${subTopicId}/start-scripting`,
        { method: "POST" },
      );
      setWritingTopicIds((current) => {
        const next = new Set(current);
        next.add(subTopicId);
        return next;
      });
      void refreshAll();
      return true;
    } catch (err) {
      if (isTeamMembershipRequiredError(err)) setMembershipRequired(true);
      showToast(getErrorMessage(err, "更新写作状态失败"), "error");
      return false;
    }
  };

  // 飞书创作统一动线：安全地址 → 复制提纲 → 必要时静默标记在写 → 打开。
  const handleGoToFeishu = async (topic: SubTopicItem) => {
    const isWriting = isTopicWritingByCurrentUser(topic, writingTopicIds);
    const result = await runFeishuCreationFlow({
      topic: {
        id: topic.id,
        title: topic.title,
        hook: topic.hook,
        topicName: topic.topics?.name,
        audience: topic.audience,
        outline: topic.outline,
        sourceType: topic.source_type ?? null,
        summary: topic.summary ?? null,
      },
      workspaceUrl: feishuWorkspaceUrl,
      isWriting,
      copy: (content) => navigator.clipboard.writeText(content),
      markWriting: handleMarkWriting,
      reserveWindow: () => {
        const opened = window.open("about:blank", "_blank");
        if (!opened) return null;
        opened.opener = null;
        return {
          navigate: (url: string) => opened.location.assign(url),
          close: () => opened.close(),
        };
      },
    });

    if (result.status === "success") {
      showToast(
        isWriting ? "提纲已复制，正在前往飞书" : "提纲已复制，已标记在写，正在前往飞书",
        "success",
      );
    } else if (result.status === "copy_failed") {
      showToast("提纲复制失败，请检查浏览器剪贴板权限后重试", "error");
    } else if (result.status === "mark_failed") {
      showToast("提纲已复制，但未登记为在写；请重试后再打开飞书", "error");
    } else if (result.status === "popup_blocked") {
      feedbackToast.error("浏览器拦截了飞书页面", {
        description: isWriting ? "提纲已复制，写作状态已保留" : "提纲已复制并登记为在写",
        action: {
          label: "手动打开",
          onClick: () => window.location.assign(result.url),
        },
      });
    } else if (result.status === "workspace_invalid") {
      showToast("飞书空间地址不安全或格式有误；提纲已复制，请联系管理员修正", "error");
    } else {
      showToast("团队尚未配置飞书空间地址；提纲已复制，可先粘贴使用", "error");
    }
  };

  return { handleMarkWriting, handleGoToFeishu };
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof TopicRequestError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}
