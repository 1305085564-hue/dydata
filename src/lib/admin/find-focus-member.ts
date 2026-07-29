export interface FocusableProfile {
  id: string;
}

export function findFocusMember<T extends FocusableProfile>(
  profiles: T[],
  focusMemberId: string | null | undefined
): T | null {
  if (!focusMemberId) return null;
  return profiles.find((p) => p.id === focusMemberId) ?? null;
}
