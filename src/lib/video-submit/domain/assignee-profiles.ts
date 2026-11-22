export type EditDetailAssigneeProfile = {
  userId: string;
  name: string | null;
  displayName: string | null;
  membershipStatus: string | null;
};

export function normalizeAssigneeProfiles(value: unknown): EditDetailAssigneeProfile[] {
  if (!Array.isArray(value)) return [];
  const profiles: EditDetailAssigneeProfile[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const profile = item as Record<string, unknown>;
    if (typeof profile.userId !== "string" || !profile.userId.trim()) continue;
    if (profiles.some((candidate) => candidate.userId === profile.userId)) continue;
    profiles.push({
      userId: profile.userId,
      name: typeof profile.name === "string" ? profile.name : null,
      displayName: typeof profile.displayName === "string" ? profile.displayName : null,
      membershipStatus: typeof profile.membershipStatus === "string" ? profile.membershipStatus : null,
    });
  }
  return profiles;
}
