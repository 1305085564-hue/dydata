import { loadViolationDashboardSummary } from "@/lib/violations/read-model";
import { createAdminClient } from "@/lib/supabase/admin";

export async function ViolationsHeaderStats() {
  const { data } = await loadViolationDashboardSummary({
    supabase: createAdminClient() as never,
  });
  const weeklyNewViolations = data?.weeklyStats?.newViolations ?? 0;
  const weeklyNewCases = data?.weeklyStats?.newCases ?? 0;

  return (
    <span>
      团队已沉淀 {weeklyNewCases} 条新案例 · {weeklyNewViolations} 条违规待规避
    </span>
  );
}
