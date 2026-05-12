import { createClient } from "@supabase/supabase-js";

const CACHE_TTL_MS = 5 * 60 * 1000;

const cache = new Map<string, { expiresAt: number; prompt: string | null }>();

function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) return null;

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function loadFeaturePrompt(featureKey: string, fallback: string) {
  const now = Date.now();
  const cached = cache.get(featureKey);
  if (cached && cached.expiresAt > now) {
    return cached.prompt?.trim() || fallback;
  }

  const supabase = getServiceClient();
  if (!supabase) {
    cache.set(featureKey, { expiresAt: now + CACHE_TTL_MS, prompt: null });
    return fallback;
  }

  const { data, error } = await supabase
    .from("ai_feature_config")
    .select("system_prompt")
    .eq("feature_key", featureKey)
    .maybeSingle();

  const prompt = !error && typeof data?.system_prompt === "string"
    ? data.system_prompt.trim() || null
    : null;

  cache.set(featureKey, { expiresAt: now + CACHE_TTL_MS, prompt });

  return prompt || fallback;
}

export function clearFeaturePromptCache(featureKey?: string) {
  if (featureKey) {
    cache.delete(featureKey);
    return;
  }

  cache.clear();
}
