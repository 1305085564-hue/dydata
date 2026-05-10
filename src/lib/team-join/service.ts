import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getViewableTeamIds } from "@/lib/team-scope";

export type Result<T, E = string> = { ok: true; data: T } | { ok: false; error: E };

export type PendingRequest = { id: string; targetTeamId: string; targetTeamName: string; createdAt: string };

export type AdminRequestRow = {
  id: string;
  applicantUserId: string;
  applicantName: string;
  applicantEmail: string;
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
  profiles?: { name: string | null } | null;
};

type RpcReviewResponse = { ok: boolean; reason?: string; status?: "approved" | "rejected" };

type UserEmailRow = { id: string; email?: string };

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
    };
  };
};

type AdminSelectBuilder = {
  select(columns: string): {
    eq(column: string, value: string): {
      order(column: string, options: { ascending: boolean }): QueryResult<TeamJoinRow[]>;
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
  from(table: "team_join_requests"): AdminSelectBuilder;
  auth: { admin: { listUsers(options: { perPage: number }): Promise<{ data: { users: UserEmailRow[] }; error: unknown }> } };
};

type ClientFactories = {
  createServerClient: () => Promise<ServerClient>;
  createServiceClient: () => AdminClient;
};

const defaultFactories: ClientFactories = {
  createServerClient: async () => (await createClient()) as unknown as ServerClient,
  createServiceClient: () => createAdminClient() as unknown as AdminClient,
};

let clientFactories = defaultFactories;

export const getTeamJoinViewableTeamIds = getViewableTeamIds;

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
    .select("id, target_team_id, created_at, teams:target_team_id(name)")
    .eq("applicant_user_id", applicantUserId)
    .eq("status", "pending")
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message ?? "SELECT_FAILED" };
  }

  if (!data) {
    return { ok: true, data: null };
  }

  return {
    ok: true,
    data: {
      id: data.id,
      targetTeamId: data.target_team_id,
      targetTeamName: data.teams?.name ?? "",
      createdAt: data.created_at,
    },
  };
}

export async function listPendingRequestsForAdmin(): Promise<Result<AdminRequestRow[]>> {
  const supabase = clientFactories.createServiceClient();
  const { data, error } = await supabase
    .from("team_join_requests")
    .select("id, applicant_user_id, target_team_id, created_at, teams:target_team_id(name), profiles:applicant_user_id(name)")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    return { ok: false, error: error.message ?? "SELECT_FAILED" };
  }

  const emailByUserId = new Map<string, string>();
  const usersResult = await supabase.auth.admin.listUsers({ perPage: 200 });

  if (!usersResult.error) {
    for (const user of usersResult.data.users) {
      emailByUserId.set(user.id, user.email ?? "");
    }
  }

  return {
    ok: true,
    data: (data ?? []).map((row) => ({
      id: row.id,
      applicantUserId: row.applicant_user_id,
      applicantName: row.profiles?.name ?? "",
      applicantEmail: emailByUserId.get(row.applicant_user_id) ?? "",
      targetTeamId: row.target_team_id,
      targetTeamName: row.teams?.name ?? "",
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
