import { NextResponse } from "next/server";
import type { ContentToolsAction, TopicSuggestionItem } from "@/app/(app)/content-tools/types";

export function isContentToolsAction(value: string): value is ContentToolsAction {
  return ["topic_suggest", "template_library", "publish_recommend"].includes(value);
}

export function extractJsonString(content: string) {
  const trimmed = content.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return trimmed.slice(start, end + 1);
}

function isReferenceVideo(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.videoId === "string";
}

function isTopicSuggestionItem(value: unknown): value is TopicSuggestionItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.title === "string" &&
    typeof item.category === "string" &&
    typeof item.angle === "string" &&
    typeof item.expectedPerformance === "string" &&
    typeof item.evidence === "string" &&
    Array.isArray(item.referenceVideos) &&
    item.referenceVideos.every(isReferenceVideo)
  );
}

export function parseTopicSuggestions(content: string) {
  const jsonString = extractJsonString(content);
  if (!jsonString) return null;

  try {
    const parsed = JSON.parse(jsonString) as { suggestions?: unknown[] };
    if (!Array.isArray(parsed.suggestions)) return null;
    const suggestions = parsed.suggestions.filter(isTopicSuggestionItem);
    return suggestions.length ? suggestions : null;
  } catch {
    return null;
  }
}

export async function POST() {
  return NextResponse.json({ error: "content-tools API 尚未实现" }, { status: 501 });
}
