import type { VideoReviewThresholds } from "@/lib/video-review-thresholds";

export interface AdminSettingsQuotaRule {
  id: string;
  effective_date: string;
  daily_target: number;
  created_by: string;
  note: string | null;
  created_at: string;
  profiles?: { name: string | null } | null;
}

type RawQuotaRule = Omit<AdminSettingsQuotaRule, "profiles"> & {
  profiles?: { name: string | null } | { name: string | null }[] | null;
};

export async function loadAdminSettingsPageData(input: {
  today: string;
  loadThresholds: () => Promise<VideoReviewThresholds>;
  loadCurrentQuota: (today: string) => Promise<number | null>;
  loadRules: () => Promise<RawQuotaRule[]>;
}) {
  const [thresholds, currentQuota, rawRules] = await Promise.all([
    input.loadThresholds(),
    input.loadCurrentQuota(input.today),
    input.loadRules(),
  ]);

  return {
    thresholds,
    currentDailyTarget: currentQuota ?? 4,
    rules: rawRules.map((rule) => ({
      ...rule,
      profiles: Array.isArray(rule.profiles) ? (rule.profiles[0] ?? null) : (rule.profiles ?? null),
    })),
  };
}
