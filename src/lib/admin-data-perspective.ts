export type AdminDataPerspective = "company" | "team";

interface ResolveAdminDataPerspectiveInput {
  requestedPerspective?: string | null;
  requestedTeamId?: string | null;
  canUseCompanyPerspective: boolean;
  availableTeamIds: string[];
  fallbackTeamId?: string | null;
}

export function resolveAdminDataPerspective(input: ResolveAdminDataPerspectiveInput) {
  const normalizedTeamIds = input.availableTeamIds.filter(Boolean);
  const fallbackTeamId =
    input.fallbackTeamId && normalizedTeamIds.includes(input.fallbackTeamId)
      ? input.fallbackTeamId
      : normalizedTeamIds[0] ?? null;

  if (!input.canUseCompanyPerspective) {
    return {
      perspective: "team" as const,
      teamId: fallbackTeamId,
    };
  }

  if (input.requestedPerspective === "team") {
    const teamId =
      input.requestedTeamId && normalizedTeamIds.includes(input.requestedTeamId)
        ? input.requestedTeamId
        : fallbackTeamId;

    if (teamId) {
      return {
        perspective: "team" as const,
        teamId,
      };
    }
  }

  return {
    perspective: "company" as const,
    teamId: null,
  };
}
