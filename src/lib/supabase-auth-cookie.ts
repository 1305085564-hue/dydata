type CookieLike = {
  name: string;
  value?: string;
};

function getSupabaseProjectRef(supabaseUrl?: string) {
  if (!supabaseUrl) return null;

  try {
    const hostname = new URL(supabaseUrl).hostname;
    return hostname.split(".")[0] || null;
  } catch {
    return null;
  }
}

export function hasSupabaseAuthCookie(cookies: CookieLike[], supabaseUrl?: string) {
  const projectRef = getSupabaseProjectRef(supabaseUrl);
  const expectedPrefix = projectRef ? `sb-${projectRef}-auth-token` : null;

  return cookies.some((cookie) => {
    if (!cookie.value) return false;
    if (expectedPrefix) {
      return cookie.name === expectedPrefix || cookie.name.startsWith(`${expectedPrefix}.`);
    }

    return /^sb-[^-]+-auth-token(?:\.\d+)?$/.test(cookie.name);
  });
}
