import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveCompanyRole } from "@/lib/company-permissions";
import { assertSupabaseQuerySucceeded } from "@/lib/supabase/query-error";
import type { CompanyRole } from "@/types";

const WRITER_CERTIFICATION_FIELDS = "user_id, certified, certified_by, certified_by_name, updated_at";

type WriterCertificationRow = {
  user_id: string;
  certified: boolean;
  certified_by: string | null;
  certified_by_name: string | null;
  updated_at: string;
};

type WriterCandidateProfileRow = {
  id: string;
  name: string | null;
  membership_status: string | null;
  role?: string | null;
  company_role?: string | null;
};

type WriterCertificationTargetRow = {
  id: string;
  name: string | null;
  role: string | null;
  company_role: string | null;
  membership_status: string | null;
};

export type WriterCertification = {
  userId: string;
  certified: boolean;
  certifiedBy: string | null;
  certifiedByName: string | null;
  updatedAt: string;
};

export type WriterCandidate = {
  userId: string;
  name: string;
  certified: boolean;
  certifiedByName: string | null;
};

export type WriterCertificationTarget = {
  id: string;
  name: string | null;
  membershipStatus: string | null;
  companyRole: CompanyRole | null;
};

export function canCertifyWriter(
  actor: { userId: string; companyRole?: CompanyRole | null },
  target: { id: string; companyRole: CompanyRole | null },
) {
  if (actor.companyRole === "company_owner") return true;
  return actor.companyRole === "admin" && target.id !== actor.userId && target.companyRole === "member";
}

function uniqueUserIds(userIds: readonly string[]) {
  return Array.from(new Set(userIds.filter((userId) => typeof userId === "string" && userId.length > 0)));
}

function toWriterCertification(row: WriterCertificationRow): WriterCertification {
  return {
    userId: row.user_id,
    certified: row.certified === true,
    certifiedBy: row.certified_by ?? null,
    certifiedByName: row.certified_by_name ?? null,
    updatedAt: row.updated_at,
  };
}

export async function loadWriterCertifications(
  supabase: SupabaseClient,
  userIds: readonly string[],
): Promise<WriterCertification[]> {
  const ids = uniqueUserIds(userIds);
  if (ids.length === 0) return [];

  const result = await supabase
    .from("writer_certifications")
    .select(WRITER_CERTIFICATION_FIELDS)
    .in("user_id", ids);
  assertSupabaseQuerySucceeded(result.error, "加载文案认证状态失败");
  return ((result.data ?? []) as WriterCertificationRow[]).map(toWriterCertification);
}

export async function loadWriterCandidates(input: {
  supabase: SupabaseClient;
  activeVisibleUserIds: readonly string[];
  actor?: { userId: string; companyRole?: CompanyRole | null };
}): Promise<WriterCandidate[]> {
  const ids = uniqueUserIds(input.activeVisibleUserIds);
  if (ids.length === 0) return [];

  const profilesResult = await input.supabase
    .from("profiles")
    .select("id, name, membership_status, role, company_role")
    .in("id", ids);
  assertSupabaseQuerySucceeded(profilesResult.error, "加载文案认证候选失败");

  const certifications = await loadWriterCertifications(input.supabase, ids);
  const certificationByUserId = new Map(certifications.map((item) => [item.userId, item]));
  const activeSet = new Set(ids);

  return ((profilesResult.data ?? []) as WriterCandidateProfileRow[])
    .filter((profile) => activeSet.has(profile.id) && profile.membership_status === "active")
    .filter((profile) => !input.actor || canCertifyWriter(input.actor, {
      id: profile.id,
      companyRole: resolveCompanyRole(profile.company_role ?? profile.role),
    }))
    .map((profile) => {
      const certification = certificationByUserId.get(profile.id);
      return {
        userId: profile.id,
        name: profile.name?.trim() || "未命名成员",
        certified: certification?.certified === true,
        certifiedByName: certification?.certified === true ? certification.certifiedByName : null,
      };
    });
}

export async function loadWriterCertificationTarget(
  supabase: SupabaseClient,
  userId: string,
): Promise<WriterCertificationTarget | null> {
  const result = await supabase
    .from("profiles")
    .select("id, name, role, company_role, membership_status")
    .eq("id", userId)
    .maybeSingle();
  assertSupabaseQuerySucceeded(result.error, "加载文案认证成员失败");
  const row = result.data as WriterCertificationTargetRow | null;
  if (!row) return null;

  return {
    id: row.id,
    name: row.name ?? null,
    membershipStatus: row.membership_status ?? null,
    companyRole: resolveCompanyRole(row.company_role ?? row.role),
  };
}

export async function saveWriterCertification(input: {
  supabase: SupabaseClient;
  userId: string;
  certified: boolean;
  certifiedBy: string;
  certifiedByName: string;
}): Promise<WriterCertification> {
  const result = await input.supabase
    .from("writer_certifications")
    .upsert({
      user_id: input.userId,
      certified: input.certified,
      certified_by: input.certifiedBy,
      certified_by_name: input.certifiedByName,
    }, { onConflict: "user_id" })
    .select(WRITER_CERTIFICATION_FIELDS)
    .single();
  assertSupabaseQuerySucceeded(result.error, "保存文案认证失败");
  return toWriterCertification(result.data as WriterCertificationRow);
}
