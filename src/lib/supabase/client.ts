import { createBrowserClient } from "@supabase/ssr";
import { createCloudBaseBrowserAuth } from "@/lib/cloudbase/auth-client";
import { createCloudBaseDataClient } from "@/lib/cloudbase/data-client";
import { isCloudBaseBackend } from "@/lib/cloudbase/core";

export function createClient() {
  if (isCloudBaseBackend()) {
    return createCloudBaseDataClient({ role: "browser", auth: createCloudBaseBrowserAuth() });
  }

  // 双路径：非 CloudBase 分支只给本机 Supabase 测试库用，线上不走。不要照抄，新代码只写 CloudBase 分支。待阿禅定本机测试环境后删除（见 docs/plans/待办清单.md）。
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
