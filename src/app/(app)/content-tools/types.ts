export type ContentToolsAction = "topic_suggest" | "template_library" | "publish_recommend";

export type ContentToolAccount = {
  id: string;
  name: string;
  contentDirection: string | null;
};

export type TimeRangeOption = 7 | 14 | 30 | 60 | 90;

export type TopicSuggestionReference = {
  videoId: string;
  title: string | null;
  accountName: string | null;
  playCount24h: number | null;
  breakoutCoefficient: number | null;
};

export type TopicSuggestionItem = {
  title: string;
  category: string;
  angle: string;
  referenceVideos: TopicSuggestionReference[];
  expectedPerformance: string;
  evidence: string;
};

export type TemplateItem = {
  name: string;
  structure: string[];
  referenceVideos: Array<{
    videoId: string;
    title: string | null;
    accountName: string | null;
  }>;
  suitableFor: string[];
  evidence: string;
  sampleCount: number;
};

export type TemplateCategory = {
  category: string;
  templates: TemplateItem[];
};

export type RecommendationConfidence = "高" | "中" | "低";

export type PublishRecommendationSlot = {
  weekday: string | null;
  hourBlock: string;
  avgPlayCount: number;
  hitRate: number;
  sampleCount: number;
  confidence: RecommendationConfidence;
  reason: string;
};

export type PublishRecommendationItem = {
  dimensionLabel: string;
  recommendedSlots: PublishRecommendationSlot[];
};

export type TopicSuggestRequest = {
  action: "topic_suggest";
  accountId?: string | null;
  days?: 7 | 14 | 30;
  contentDirection?: string | null;
  limit?: number;
};

export type TemplateLibraryRequest = {
  action: "template_library";
  accountId?: string | null;
  days?: 14 | 30 | 60;
  contentDirection?: string | null;
  minBreakoutCoefficient?: number;
};

export type PublishRecommendRequest = {
  action: "publish_recommend";
  accountId?: string | null;
  contentDirection?: string | null;
  days?: 30 | 60 | 90;
};

export type ContentToolsRequest =
  | TopicSuggestRequest
  | TemplateLibraryRequest
  | PublishRecommendRequest;

export type TopicSuggestResponse = {
  action: "topic_suggest";
  data: {
    suggestions: TopicSuggestionItem[];
    evidenceSummary: string[];
    sampleCount: number;
    marketDate: string | null;
  };
};

export type TemplateLibraryResponse = {
  action: "template_library";
  data: {
    categories: TemplateCategory[];
    sampleCount: number;
    minBreakoutCoefficient: number;
  };
};

export type PublishRecommendResponse = {
  action: "publish_recommend";
  data: {
    recommendations: PublishRecommendationItem[];
    sampleCount: number;
    windowDays: number;
  };
};

export type ContentToolsResponse =
  | TopicSuggestResponse
  | TemplateLibraryResponse
  | PublishRecommendResponse
  | { error: string };
