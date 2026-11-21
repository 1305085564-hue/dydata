import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPermissionContext } from "@/lib/current-permission-context";
import { getActiveVisibleUserIds } from "@/lib/data-access-scope";
import { getTeamOptions } from "@/lib/teams";

export type Result<T, E = string> = { ok: true; data: T } | { ok: false; error: E };

export type PendingRequest = { id: string; targetTeamId: string; targetTeamName: string; createdAt: string };

export type AdminRequestRow = {
  id: string;
  applicantUserId: string;
  applicantName: string;
  applicantEmail: string | null;
  targetTeamId: string;
  targetTeamName: string;
  createdAt: string;
};

type PostgrestErrorLike = { code?: string; message?: string; details?: string; hint?: string };

type TeamJoinRow = {
  id: string;
  applicant_user_id: string;
  target_team_id: string;
  created_at: string;
  teams?: { name: string | null } | null;
};

type RpcReviewResponse = { ok: boolean; reason?: string; status?: "approved" | "rejected" };

type UserEmailRow = { id: string; email?: string };
type ProfileNameRow = { id: string; name: string | null };

type QueryResult<T> = Promise<{ data: T | null; error: PostgrestErrorLike | null; count?: number | null }>;

type InsertBuilder = {
  insert(value: { applicant_user_id: string; target_team_id: string }): {
    select(columns: string): { single(): QueryResult<{ id: string }> };
  };
};

type DeleteBuilder = {
  delete(options: { count: "exact" }): {
    eq(column: string, value: string): DeleteFilterBuilder;
  };
};

type DeleteFilterBuilder = {
  eq(column: string, value: string): DeleteFilterBuilder;
} & QueryResult<null>;

type PendingSelectBuilder = {
  select(columns: string): {
    eq(column: string, value: string): {
      eq(column: string, value: string): { maybeSingle(): QueryResult<TeamJoinRow> };
      order(column: string, options: { ascending: boolean }): QueryResult<TeamJoinRow[]>;
    };
  };
};

type ProfileSelectBuilder = {
  select(columns: string): {
    in(column: string, values: string[]): QueryResult<ProfileNameRow[]>;
  };
};

type PendingRequestQuery = {
  or(filters: string): PendingRequestQuery;
  eq(column: string, value: string): PendingRequestQuery;
  order(column: string, options: { ascending: boolean }): QueryResult<TeamJoinRow[]>;
};

type PendingRequestSelectBuilder = {
  select(columns: string): {
    eq(column: string, value: string): PendingRequestQuery;
  };
};

type TeamSelectBuilder = {
  select(columns: string): {
    eq(column: string, value: string): {
      maybeSingle(): QueryResult<{ id: string; name: string | null }>;
    };
  };
};

type RpcClient = {
  rpc(
    name: "review_team_join_request",
    params: { p_request_id: string; p_action: "approve" | "reject"; p_note: string | null },
  ): QueryResult<RpcReviewResponse>;
};

type ServerClient = RpcClient & {
  from(table: "team_join_requests"): InsertBuilder & DeleteBuilder & PendingSelectBuilder;
};

type AdminClient = {
  from(table: "profiles"): ProfileSelectBuilder;
  from(table: "team_join_requests"): PendingRequestSelectBuilder;
  from(table: "teams"): TeamSelectBuilder;
  auth: {
    admin: {
      getUserById(userId: string): Promise<{
        data: { user: UserEmailRow | null };
        error: unknown;
      }>;
    };
  };
};

type ClientFactories = {
  createServerClient: () => Promise<ServerClient>;
  createServiceClient: () => AdminClient;
  getCurrentPermissionContext: typeof getCurrentPermissionContext;
  getTeamOptions: typeof getTeamOptions;
};

const defaultFactories: ClientFactories = {
  createServerClient: async () => (await createClient()) as unknown as ServerClient,
  createServiceClient: () => createAdminClient() as unknown as AdminClient,
  getCurrentPermissionContext,
  getTeamOptions,
};

let clientFactories = defaultFactories;

const AUTH_LOOKUP_CONCURRENCY = 5;

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index]);
    }
  });

  await Promise.all(workers);
  return results;
}

export function setTeamJoinServiceClientsForTest(factories: ClientFactories): void {
  clientFactories = factories;
}

export function resetTeamJoinServiceClientsForTest(): void {
  clientFactories = defaultFactories;
}

export async function createJoinRequest(params: {
  applicantUserId: string;
  targetTeamId: string;
}): Promise<Result<{ id: string }>> {
  const supabase = await clientFactories.createServerClient();
  const { data, error } = await supabase
    .from("team_join_requests")
    .insert({ applicant_user_id: params.applicantUserId, target_team_id: params.targetTeamId })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "ALREADY_PENDING" };
    }

    console.error(error);
    return { ok: false, error: "INSERT_FAILED" };
  }

  return { ok: true, data: { id: data?.id ?? "" } };
}

export async function cancelJoinRequest(params: {
  requestId: string;
  applicantUserId: string;
}): Promise<Result<null>> {
  const supabase = await clientFactories.createServerClient();
  const { count, error } = await supabase
    .from("team_join_requests")
    .delete({ count: "exact" })
    .eq("id", params.requestId)
    .eq("applicant_user_id", params.applicantUserId)
    .eq("status", "pending");

  if (error) {
    return { ok: false, error: error.message ?? "DELETE_FAILED" };
  }

  if ((count ?? 0) === 0) {
    return { ok: false, error: "NOT_FOUND_OR_ALREADY_REVIEWED" };
  }

  return { ok: true, data: null };
}

export async function getMyPendingRequest(applicantUserId: string): Promise<Result<PendingRequest | null>> {
  const supabase = await clientFactories.createServerClient();
  const { data, error } = await supabase
    .from("team_join_requests")
    .select("id, target_team_id, created_at")
    .eq("applicant_user_id", applicantUserId)
    .eq("status", "pending")
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message ?? "SELECT_FAILED" };
  }

  if (!data) {
    return { ok: true, data: null };
  }

  const teams = await clientFactories.getTeamOptions();

  return {
    ok: true,
    data: {
      id: data.id,
      targetTeamId: data.target_team_id,
      targetTeamName: teams.find((team) => team.id === data.target_team_id)?.name ?? "",
      createdAt: data.created_at,
    },
  };
}

export async function listPendingRequestsForAdmin(): Promise<Result<AdminRequestRow[]>> {
  const permissionContext = await clientFactories.getCurrentPermissionContext();
  if (
    !permissionContext
    || permissionContext.permissionInfo.membershipStatus !== "active"
    || permissionContext.scope.userId !== permissionContext.permissionInfo.userId
    || !getActiveVisibleUserIds(permissionContext.scope).includes(permissionContext.permissionInfo.userId)
  ) {
    return { ok: false, error: "SCOPE_UNAVAILABLE" };
  }

  const { userId, teamId, permissions } = permissionContext.permissionInfo;
  const canReadTeamRequests = permissions.manage_members === true && teamId !== null;
  const adminClient = clientFactories.createServiceClient();
  let query = adminClient
    .from("team_join_requests")
    .select("id, applicant_user_id, target_team_id, created_at")
    .eq("status", "pending");
  query = canReadTeamRequests
    ? query.or(`applicant_user_id.eq.${userId},target_team_id.eq.${teamId}`)
    : query.eq("applicant_user_id", userId);
  const { data, error } = await query.order("created_at", { ascending: true });

  if (error) {
    return { ok: false, error: error.message ?? "SELECT_FAILED" };
  }

  const visibleRequests = (data ?? []).filter((row) =>
    row.applicant_user_id === userId
    || (canReadTeamRequests && row.target_team_id === teamId),
  );
  if (!visibleRequests.length) return { ok: true, data: [] };

  const applicantUserIds = Array.from(new Set(visibleRequests.map((row) => row.applicant_user_id)));
  const nameByUserId = new Map<string, string>();
  if (applicantUserIds.length > 0) {
    const { data: profiles, error: profilesError } = await adminClient.from("profiles").select("id, name").in("id", applicantUserIds);
    if (profilesError) {
      return { ok: false, error: profilesError.message ?? "SELECT_FAILED" };
    }
    for (const profile of profiles ?? []) {
      nameByUserId.set(profile.id, profile.name ?? "");
    }
  }

  let teamName = "";
  if (teamId) {
    const { data: team, error: teamError } = await adminClient
      .from("teams")
      .select("id, name")
      .eq("id", teamId)
      .maybeSingle();
    if (teamError) return { ok: false, error: teamError.message ?? "SELECT_FAILED" };
    teamName = team?.name ?? "";
  }

  const emailEntries = await mapWithConcurrency(
    applicantUserIds,
    AUTH_LOOKUP_CONCURRENCY,
    async (userId): Promise<readonly [string, string | null]> => {
      const { data: userResult, error: userError } = await adminClient.auth.admin.getUserById(userId);
      if (userError) {
        console.error("[team-join] failed to load applicant email", { userId, error: userError });
        return [userId, null];
      }
      return [userId, userResult.user?.email ?? null];
    },
  );
  const emailByUserId = new Map(emailEntries);

  return {
    ok: true,
    data: visibleRequests.map((row) => ({
      id: row.id,
      applicantUserId: row.applicant_user_id,
      applicantName: nameByUserId.get(row.applicant_user_id) ?? "",
      applicantEmail: emailByUserId.get(row.applicant_user_id) ?? null,
      targetTeamId: row.target_team_id,
      targetTeamName: row.target_team_id === teamId ? teamName : "",
      createdAt: row.created_at,
    })),
  };
}

export async function reviewRequest(params: {
  requestId: string;
  action: "approve" | "reject";
  note?: string | null;
}): Promise<Result<{ status: "approved" | "rejected" }>> {
  const supabase = await clientFactories.createServerClient();
  const { data, error } = await supabase.rpc("review_team_join_request", {
    p_request_id: params.requestId,
    p_action: params.action,
    p_note: params.note ?? null,
  });

  if (error) {
    return { ok: false, error: error.message ?? "RPC_FAILED" };
  }

  if (!data?.ok) {
    return { ok: false, error: data?.reason ?? "RPC_FAILED" };
  }

  if (data.status !== "approved" && data.status !== "rejected") {
    return { ok: false, error: "RPC_FAILED" };
  }

  return { ok: true, data: { status: data.status } };
}
