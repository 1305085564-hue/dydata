export type ViolationStatus = "submitted" | "verified" | "rejected" | "archived";
export type ViolationCategory = "下粉" | "直播" | "短视频" | "其他";
export type RiskLevel = "high" | "medium" | "low";

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


