export interface DashboardAccountProvisioningClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        limit(count: number): Promise<{ data: Array<{ id: string; name: string }> | null; error: { message: string } | null }>;
      };
    };
    insert(payload: { profile_id: string; name: string }): Promise<{ data: Array<{ id: string; name: string }> | null; error: { message: string } | null }>;
  };
}

export async function ensureDefaultDashboardAccount({
  adminSupabase,
  profileId,
  preferredName,
}: {
  adminSupabase: DashboardAccountProvisioningClient;
  profileId: string;
  preferredName: string;
}): Promise<{ created: boolean }> {
  const normalizedName = preferredName.trim() || "默认账号";
  const { data: existing, error } = await adminSupabase
    .from("accounts")
    .select("id, name")
    .eq("profile_id", profileId)
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  if ((existing?.length ?? 0) > 0) {
    return { created: false };
  }

  const { error: insertError } = await adminSupabase.from("accounts").insert({
    profile_id: profileId,
    name: normalizedName,
  });

  if (insertError) {
    throw new Error(insertError.message);
  }

  return { created: true };
}
