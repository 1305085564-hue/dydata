export type ComparisonMemberOption = {
  id: string;
  name: string;
};

type ProfileLike = {
  id?: string | null;
  name?: string | null;
};

type VideoProfileLike =
  | { name?: string | null }
  | Array<{ name?: string | null }>
  | null
  | undefined;

type VideoLike = {
  user_id?: string | null;
  profiles?: VideoProfileLike;
};

function normalizeName(name: string | null | undefined) {
  const trimmed = name?.trim();
  return trimmed ? trimmed : "未命名成员";
}

function readVideoProfileName(value: VideoProfileLike) {
  const profile = Array.isArray(value) ? value[0] : value;
  return normalizeName(profile?.name);
}

export function buildComparisonMemberOptions({
  profiles = [],
  videos = [],
  fallbackProfiles = [],
}: {
  profiles?: readonly ProfileLike[];
  videos?: readonly VideoLike[];
  fallbackProfiles?: readonly ProfileLike[];
}): ComparisonMemberOption[] {
  const members = new Map<string, ComparisonMemberOption>();

  const addProfile = (profile: ProfileLike) => {
    const id = profile.id?.trim();
    if (!id || members.has(id)) return;
    members.set(id, { id, name: normalizeName(profile.name) });
  };

  for (const profile of profiles) {
    addProfile(profile);
  }

  for (const video of videos) {
    const id = video.user_id?.trim();
    if (!id || members.has(id)) continue;
    members.set(id, { id, name: readVideoProfileName(video.profiles) });
  }

  for (const profile of fallbackProfiles) {
    addProfile(profile);
  }

  return Array.from(members.values());
}
