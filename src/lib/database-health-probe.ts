import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";

export type DatabaseProbeResult = {
  table: "profiles";
  rowCount: number;
  checkedAt: string;
};

export async function probeDatabaseHealth(
  client: Pick<SupabaseClient, "from"> = createAdminClient(),
): Promise<DatabaseProbeResult> {
  const { data, error } = await client.from("profiles").select("id").limit(1);

  if (error) {
    throw new Error(error.message);
  }

  return {
    table: "profiles",
    rowCount: Array.isArray(data) ? data.length : 0,
    checkedAt: new Date().toISOString(),
  };
}
