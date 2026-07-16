export type ViolationStatus = "submitted" | "verified" | "rejected" | "archived";
export type ViolationCategory = "下粉" | "直播" | "短视频" | "其他";
export type RiskLevel = "high" | "medium" | "low";

export type GuidanceMethod = "oral" | "visual" | "profile" | "comment" | "other";

export const GUIDANCE_METHOD_LABELS: Record<GuidanceMethod, string> = {
  oral: "口播引导",
  visual: "画面引导",
  profile: "简介暗示",
  comment: "评论区引导",
  other: "其他",
};

export type SortKey = "conversion_rate" | "pass_rate" | "usage_count" | "created_at";

export type SortOption = {
  key: SortKey;
  label: string;
  applicablePurposes: ("violation" | "conversion")[];
};

export const SORT_OPTIONS: SortOption[] = [
  { key: "conversion_rate", label: "转化率", applicablePurposes: ["conversion"] },
  { key: "pass_rate", label: "通过率", applicablePurposes: ["violation"] },
  { key: "usage_count", label: "使用次数", applicablePurposes: ["conversion", "violation"] },
  { key: "created_at", label: "最新提交", applicablePurposes: ["conversion", "violation"] },
];

export type ViolationAccount = {
  id: string;
  name: string;
  display_name?: string | null;
  content_direction?: string | null;
};

export type ViolationSubmitter = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
};

export type ViolationTeam = {
  id?: string | null;
  name?: string | null;
};

export type ViolationCase = {
  id: string;
  created_at: string;
  submitted_by?: string | null;
  script_text: string;
  is_violation: boolean;
  category: ViolationCategory | string;
  account_id?: string | null;
  account_name_snapshot?: string | null;
  team_id?: string | null;
  scene_description?: string | null;
  screenshot_paths?: string[] | null;
  result?: string | null;
  tags?: string[] | null;
  pass_count?: number | null;
  fail_count?: number | null;
  status: ViolationStatus | string;
  risk_level?: RiskLevel | string | null;
  admin_conclusion?: string | null;
  suggested_action?: string | null;
  reviewed_at?: string | null;
  submitter?: ViolationSubmitter | ViolationSubmitter[] | null;
  profiles?: ViolationSubmitter | ViolationSubmitter[] | null;
  team?: ViolationTeam | ViolationTeam[] | null;
  teams?: ViolationTeam | ViolationTeam[] | null;
  // conversion fields
  purpose?: "violation" | "conversion" | string | null;
  script_format?: string | null;
  total_views?: number | null;
  total_follows?: number | null;
  usage_count?: number | null;
  weighted_conversion_rate?: number | null;
  platforms?: string[] | null;
  // new fields (backend may not be ready yet)
  guidance_method?: GuidanceMethod | string | null;
  profile_screenshot_paths?: string[] | null;
  fixed_by_modification?: boolean | null;
  modification_count?: number | null;
  modification_note?: string | null;
  // visual tags
  visual_tags?: { id: string; name: string }[] | null;
  promotion_level?: string | null;
  usage_state?: string | null;
  highlighted_sections?: string[] | null;
};

export type ViolationTestRecord = {
  id: string;
  case_id: string;
  tested_by?: string | null;
  tested_at: string;
  account_id?: string | null;
  passed: boolean;
  note?: string | null;
  account_name_snapshot?: string | null;
  accounts?: { name?: string | null } | { name?: string | null }[] | null;
  tester?: ViolationSubmitter | ViolationSubmitter[] | null;
  profiles?: ViolationSubmitter | ViolationSubmitter[] | null;
};

export type ViolationDetail = ViolationCase & {
  test_records?: ViolationTestRecord[];
  violation_test_records?: ViolationTestRecord[];
};

export type ViolationListResponse = {
  cases?: ViolationCase[];
  items?: ViolationCase[];
  data?: ViolationCase[];
  total?: number;
  page?: number;
  pageSize?: number;
  error?: string;
  sort?: SortKey | null;
  order?: "asc" | "desc";
};

export type ViolationDetailResponse = {
  case?: ViolationDetail;
  data?: ViolationDetail;
  error?: string;
};

export type ScriptFormatLite = "oral" | "visual" | "mixed";

export type ConversionCase = {
  id: string;
  script_text: string;
  script_format: ScriptFormatLite | string | null;
  total_views: number | null;
  total_follows: number | null;
  usage_count: number | null;
  weighted_conversion_rate: number | null;
  created_at: string;
};

export type TopScriptEntry = {
  id: string;
  script_text: string;
  total_views: number | null;
  total_follows: number | null;
  usage_count: number | null;
  weighted_conversion_rate: number | null;
};

// --- 前端重构新增类型 ---

/** 排行榜单项数据 */
export type RankItem = {
  id: string;
  script_text: string;
  metricValue: string; // 格式化后的值，如 "3.21%" 或 "90%"
  metricRaw?: number | null;
  status?: string | null;
  guidance_method?: GuidanceMethod | string | null;
  pass_count?: number | null;
  fail_count?: number | null;
  usage_count?: number | null;
};

/** 紧凑列表行数据（由 ViolationCase 转换而来） */
export type CaseListItem = ViolationCase;

/** 分步向导步骤定义 */
export type WizardStep = {
  key: string;
  label: string;
  description?: string;
  validate?: () => boolean;
};

/** 分步向导表单数据 */
export type WizardFormData = {
  // Step 1
  submissionPath: "violation" | "conversion";
  /** 用户是否已经在「起步」步骤选择过类型 */
  typePicked: boolean;
  // Step 2
  script_text: string;
  screenshots: { path: string; name: string }[];
  // Step 3-A (violation)
  eventType: import("@/lib/conversion-hub/types").ViolationEventType;
  occurredAt: string;
  platformNotice: string;
  appealStatus: "未申诉" | "申诉成功" | "申诉失败";
  appealText: string;
  // Step 3-B (conversion)
  platforms: import("@/lib/case-library/confidence").Platform[];
  viewsInput: string;
  followsInput: string;
  // Common
  accountId: string;
};
