export interface FeishuTopicContentSummary {
  bestPlayCount?: number | null;
  internalMetrics?: { qualifiedWorkCount?: number | null } | null;
  externalMetrics?: { bestPlayCount?: number | null } | null;
}

export interface FeishuTopicContent {
  title: string;
  hook?: string | null;
  topicName?: string | null;
  audience?: string | null;
  outline?: string | string[] | null;
  sourceType?: "internal" | "external" | null;
  summary?: FeishuTopicContentSummary | null;
}

/** 选题结构化内容 → 飞书创作粘贴文本；数据证明只用真实成绩，无数据不虚构。 */
export function formatFeishuTopicContent(topic: FeishuTopicContent): string {
  const proofLines: string[] = [];
  const summary = topic.summary;
  if (summary) {
    if (typeof summary.bestPlayCount === "number") {
      proofLines.push(`团队最高播放 ${summary.bestPlayCount.toLocaleString()}`);
    }
    if (summary.internalMetrics?.qualifiedWorkCount) {
      proofLines.push(`达标作品（≥3万播放）${summary.internalMetrics.qualifiedWorkCount} 条`);
    }
    if (typeof summary.externalMetrics?.bestPlayCount === "number") {
      proofLines.push(`外部历史播放 ${summary.externalMetrics.bestPlayCount.toLocaleString()}`);
    }
  }

  const lines: string[] = [
    `【选题名称】：${topic.title}`,
    topic.topicName ? `【所属母题】：${topic.topicName}` : "",
    topic.hook ? `【一句话钩子】：${topic.hook}` : "",
    topic.audience ? `【目标受众】：${topic.audience}` : "",
    topic.outline
      ? typeof topic.outline === "string"
        ? `【内容提纲】：\n${topic.outline}`
        : Array.isArray(topic.outline) && topic.outline.length
          ? `【内容提纲】：\n${topic.outline.map((p, i) => `${i + 1}. ${p}`).join("\n")}`
          : ""
      : "",
    proofLines.length ? `【数据证明】：\n${proofLines.map((line) => `- ${line}`).join("\n")}` : "",
    `【来源】：${topic.sourceType === "external" ? "外部收集干货" : "团队内部已验证"}`,
  ].filter(Boolean);

  return lines.join("\n\n");
}
