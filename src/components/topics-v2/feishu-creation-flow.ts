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

export async function runFeishuCreationFlow(input: {
  topic: FeishuTopic;
  workspaceUrl: string | null | undefined;
  isWriting: boolean;
  copy: (content: string) => Promise<void>;
  markWriting: (subTopicId: string) => Promise<boolean>;
  open: (url: string) => boolean;
}): Promise<FeishuCreationFlowResult> {
  const validatedWorkspace = validateFeishuWorkspaceUrl(input.workspaceUrl);
  const content = formatFeishuTopicContent(input.topic);

  try {
    await input.copy(content);
  } catch {
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
    if (!marked) return { status: "mark_failed", content };
  }

  if (!input.open(validatedWorkspace.url)) {
    return { status: "popup_blocked", url: validatedWorkspace.url, content };
  }
  return { status: "success", url: validatedWorkspace.url };
}
