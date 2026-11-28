
export type TextContent = string;

export type MultimodalBlock =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type MessageContent = TextContent | MultimodalBlock[];

export type AiMessage = {
  role: "user" | "system" | "assistant";
  content: MessageContent;
};

export type AiRequestOptions = {
  onChunk?: (text: string) => void;
  messages: AiMessage[];
  maxTokens?: number;
  timeoutMs?: number;
  /** 整条顺位链的总耗时上界；不传则用 DEFAULT_TOTAL_TIMEOUT_MS */
  totalTimeoutMs?: number;
  jsonMode?: boolean;
  model?: string;
  providerKeyModelId?: string;
  featureKey?: string;
  databaseOnly?: boolean;
  /**
   * 正文契约校验：上游以 200 返回后，用它判断这次回答是否算数。
   * 返回 false 时按「该渠道不可用」处理——记一次渠道失败并顺位到下一个渠道，
   * 而不是把这段正文当成结果交给业务层。用于 JSON 契约类调用（截图识别），
   * 因为共享渠道里存在返回 200 但无视契约的渠道（看图请求被丢掉后只回文字说明）。
   */
  validateContent?: (content: string) => boolean;
};

export type AiResponse = {
  content: string;
  model: string;
  channelName: string;
  channelId?: string | null;
  providerKeyModelId?: string | null;
  providerKeyId?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  elapsedMs: number;
};

export type UpstreamResponseBody = {
  choices?: Array<{
    message?: {
      content?: unknown;
      text?: unknown;
      reasoning_content?: unknown;
      refusal?: unknown;
    };
    delta?: {
      content?: unknown;
      reasoning_content?: unknown;
      refusal?: unknown;
    };
    finish_reason?: unknown;
    native_finish_reason?: unknown;
  }>;
  model?: unknown;
  usage?: {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    total_tokens?: unknown;
  };
};

export type StreamedChatCompletionResult = {
  content: string;
  reasoningContent: string;
  model: string | null;
  usage: {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  };
  rawSnippet: string;
  diagnosticBody: UpstreamResponseBody;
};
