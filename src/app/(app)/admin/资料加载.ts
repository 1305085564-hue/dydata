export interface QueryErrorLike {
  message: string;
}

import type { UserStatus, ExemptType, ExemptionCategory } from "@/types";

export interface TeamRelation {
  name: string | null;
}

export interface ProfileWithExemptionFields {
  id: string;
  name: string;
  email?: string | null;
  role: string;
  status: UserStatus;
  exempt_type: ExemptType | null;
  exempt_start_date: string | null;
  exempt_end_date: string | null;
  exempt_reason: string | null;
  exemption_category: ExemptionCategory | null;
  permissions?: unknown;
  created_at?: string;
  team_id?: string | null;
  group_id?: string | null;
  teams?: TeamRelation | TeamRelation[] | null;
}

export interface ProfileWithoutExemptionFields {
  id: string;
  name: string;
  email?: string | null;
  role: string;
  status: UserStatus;
  permissions?: unknown;
  created_at?: string;
  team_id?: string | null;
  group_id?: string | null;
  teams?: TeamRelation | TeamRelation[] | null;
}

interface QueryResult<T> {
  data: T[] | null;
  error: QueryErrorLike | null;
}

interface LoadProfilesWithExemptionFallbackArgs {
  loadWithExemption: () => Promise<QueryResult<ProfileWithExemptionFields>>;
  loadWithoutExemption: () => Promise<QueryResult<ProfileWithoutExemptionFields>>;
}

interface LoadProfilesWithExemptionFallbackResult {
  data: ProfileWithExemptionFields[] | null;
  error: QueryErrorLike | null;
  usedFallback: boolean;
}

function isMissingExemptionColumnError(error: QueryErrorLike | null) {
  if (!error) return false;

  return [
    "profiles.exempt_type",
    "profiles.exempt_start_date",
    "profiles.exempt_end_date",
    "profiles.exempt_reason",
    "profiles.exemption_category",
    "profiles.team_id",
    "profiles.group_id",
  ].some((column) => error.message.includes(column));
}

function normalizeProfile(profile: ProfileWithoutExemptionFields): ProfileWithExemptionFields {
  return {
    ...profile,
    status: profile.status ?? ("active" as UserStatus),
    exempt_type: null,
    exempt_start_date: null,
    exempt_end_date: null,
    exempt_reason: null,
    exemption_category: null,
  };
}

export async function loadProfilesWithExemptionFallback({
  loadWithExemption,
  loadWithoutExemption,
}: LoadProfilesWithExemptionFallbackArgs): Promise<LoadProfilesWithExemptionFallbackResult> {
  const primaryResult = await loadWithExemption();

  if (!isMissingExemptionColumnError(primaryResult.error)) {
    return {
      data: primaryResult.data,
      error: primaryResult.error,
      usedFallback: false,
    };
  }

  const fallbackResult = await loadWithoutExemption();

  return {
    data: fallbackResult.data?.map(normalizeProfile) ?? null,
    error: fallbackResult.error,
    usedFallback: true,
  };
}
