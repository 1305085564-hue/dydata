import { createBrowserClient } from "@supabase/ssr";
import { createCloudBaseBrowserAuth } from "@/lib/cloudbase/auth-client";
import { createCloudBaseDataClient } from "@/lib/cloudbase/data-client";
import { isCloudBaseBackend } from "@/lib/cloudbase/core";

export function createClient() {
  if (isCloudBaseBackend()) {
    return createCloudBaseDataClient({ role: "browser", auth: createCloudBaseBrowserAuth() });
  }

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
