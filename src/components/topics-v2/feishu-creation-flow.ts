import { formatFeishuTopicContent } from "@/lib/topics/feishu-content";
import { validateFeishuWorkspaceUrl } from "@/lib/topics/feishu-workspace";

type FeishuTopic = Parameters<typeof formatFeishuTopicContent>[0] & { id: string };

export type FeishuCreationFlowResult =
  | { status: "success"; url: string }
  | { status: "workspace_missing"; content: string }
  | { status: "workspace_invalid"; content: string }
  | { status: "copy_failed" }
  | { status: "mark_failed"; content: string }
  | { status: "popup_blocked"; url: string; content: string };

type ReservedWindow = {
  navigate: (url: string) => void;
  close: () => void;
};

export async function runFeishuCreationFlow(input: {
  topic: FeishuTopic;
  workspaceUrl: string | null | undefined;
  isWriting: boolean;
  copy: (content: string) => Promise<void>;
  markWriting: (subTopicId: string) => Promise<boolean>;
  reserveWindow: () => ReservedWindow | null;
}): Promise<FeishuCreationFlowResult> {
  const validatedWorkspace = validateFeishuWorkspaceUrl(input.workspaceUrl);
  const content = formatFeishuTopicContent(input.topic);
  // 必须在第一个 await 之前同步预留标签页，否则浏览器会丢失本次点击授权。
  // 真正导航仍在复制和标记都成功之后发生。
  const reservedWindow = validatedWorkspace.ok ? input.reserveWindow() : null;

  try {
    await input.copy(content);
  } catch {
    reservedWindow?.close();
    return { status: "copy_failed" };
  }

  if (!validatedWorkspace.ok) {
    return {
      status: validatedWorkspace.reason === "empty" ? "workspace_missing" : "workspace_invalid",
      content,
    };
  }

  if (!input.isWriting) {
    let marked = false;
    try {
      marked = await input.markWriting(input.topic.id);
    } catch {
      marked = false;
    }
    if (!marked) {
      reservedWindow?.close();
      return { status: "mark_failed", content };
    }
  }

  if (!reservedWindow) {
    return { status: "popup_blocked", url: validatedWorkspace.url, content };
  }
  try {
    reservedWindow.navigate(validatedWorkspace.url);
  } catch {
    reservedWindow.close();
    return { status: "popup_blocked", url: validatedWorkspace.url, content };
  }
  return { status: "success", url: validatedWorkspace.url };
}
