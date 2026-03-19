import type {
  ContentToolsAction,
  TemplateCategory,
  TemplateItem,
  TopicSuggestionItem,
  TopicSuggestionReference,
} from "@/app/(app)/content-tools/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isContentToolsAction(value: unknown): value is ContentToolsAction {
  return value === "topic_suggest" || value === "template_library" || value === "publish_recommend";
}

export function extractJsonString(content: string) {
  const trimmed = content.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    const candidate = fencedMatch[1].trim();
    if (candidate.startsWith("{") && candidate.endsWith("}")) return candidate;
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return trimmed.slice(start, end + 1);
}

function mapReferenceVideos(value: unknown): TopicSuggestionReference[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isRecord)
    .map((item) => ({
      videoId: isNonEmptyString(item.videoId) ? item.videoId.trim() : "",
      title: isNonEmptyString(item.title) ? item.title.trim() : null,
      accountName: isNonEmptyString(item.accountName) ? item.accountName.trim() : null,
      playCount24h: isFiniteNumber(item.playCount24h) ? item.playCount24h : null,
      breakoutCoefficient: isFiniteNumber(item.breakoutCoefficient) ? item.breakoutCoefficient : null,
    }))
    .filter((item) => item.videoId);
}

export function parseTopicSuggestions(content: string): TopicSuggestionItem[] | null {
  const jsonString = extractJsonString(content);
  if (!jsonString) return null;

  try {
    const parsed = JSON.parse(jsonString) as { suggestions?: unknown };
    if (!Array.isArray(parsed.suggestions) || parsed.suggestions.length === 0) return null;

    const suggestions = parsed.suggestions
      .filter(isRecord)
      .map((item) => ({
        title: isNonEmptyString(item.title) ? item.title.trim() : "",
        category: isNonEmptyString(item.category) ? item.category.trim() : "",
        angle: isNonEmptyString(item.angle) ? item.angle.trim() : "",
        expectedPerformance: isNonEmptyString(item.expectedPerformance)
          ? item.expectedPerformance.trim()
          : "",
        evidence: isNonEmptyString(item.evidence) ? item.evidence.trim() : "",
        referenceVideos: mapReferenceVideos(item.referenceVideos),
      }))
      .filter(
        (item) => item.title && item.category && item.angle && item.expectedPerformance && item.evidence,
      );

    return suggestions.length > 0 ? suggestions : null;
  } catch {
    return null;
  }
}

export function parseTemplateCategories(content: string): TemplateCategory[] | null {
  const jsonString = extractJsonString(content);
  if (!jsonString) return null;

  try {
    const parsed = JSON.parse(jsonString) as { categories?: unknown };
    if (!Array.isArray(parsed.categories)) return null;

    const categories = parsed.categories
      .filter(isRecord)
      .map((category) => {
        const templates = Array.isArray(category.templates)
          ? category.templates
              .filter(isRecord)
              .map((template): TemplateItem | null => {
                const structure = Array.isArray(template.structure)
                  ? template.structure.filter(isNonEmptyString).map((item) => item.trim())
                  : [];
                const suitableFor = Array.isArray(template.suitableFor)
                  ? template.suitableFor.filter(isNonEmptyString).map((item) => item.trim())
                  : [];
                const referenceVideos = Array.isArray(template.referenceVideos)
                  ? template.referenceVideos
                      .filter(isRecord)
                      .map((video) => ({
                        videoId: isNonEmptyString(video.videoId) ? video.videoId.trim() : "",
                        title: isNonEmptyString(video.title) ? video.title.trim() : null,
                        accountName: isNonEmptyString(video.accountName) ? video.accountName.trim() : null,
                      }))
                      .filter((video) => video.videoId)
                  : [];

                if (
                  !isNonEmptyString(template.name) ||
                  !isNonEmptyString(template.evidence) ||
                  structure.length === 0
                ) {
                  return null;
                }

                return {
                  name: template.name.trim(),
                  structure,
                  referenceVideos,
                  suitableFor,
                  evidence: template.evidence.trim(),
                  sampleCount: isFiniteNumber(template.sampleCount) ? template.sampleCount : 0,
                };
              })
              .filter((item): item is TemplateItem => item !== null)
          : [];

        if (!isNonEmptyString(category.category) || templates.length === 0) return null;
        return {
          category: category.category.trim(),
          templates,
        } satisfies TemplateCategory;
      })
      .filter((item): item is TemplateCategory => item !== null);

    return categories.length > 0 ? categories : null;
  } catch {
    return null;
  }
}
