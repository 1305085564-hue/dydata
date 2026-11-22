import { cookies } from "next/headers";

import { createServerClient } from "@supabase/ssr";
import { createCloudBaseServerAuth } from "@/lib/cloudbase/auth-client";
import { createCloudBaseDataClient } from "@/lib/cloudbase/data-client";
import { CLOUD_BASE_SESSION_COOKIE, isCloudBaseBackend, parseCloudBaseSession } from "@/lib/cloudbase/core";

import {
  applyAuthCookieLifetime,
  isKeepLoggedInCookieValue,
  KEEP_LOGGED_IN_COOKIE_NAME,
} from "./session-cookie";

type CreateClientOptions = {
  keepLoggedIn?: boolean;
};

export async function createClient(options: CreateClientOptions = {}) {
  const cookieStore = await cookies();
  const keepLoggedIn =
    options.keepLoggedIn ??
    isKeepLoggedInCookieValue(cookieStore.get(KEEP_LOGGED_IN_COOKIE_NAME)?.value);

  if (isCloudBaseBackend()) {
    const auth = createCloudBaseServerAuth(cookieStore, keepLoggedIn);
    return createCloudBaseDataClient({
      role: "user",
      userToken: () => parseCloudBaseSession(cookieStore.get(CLOUD_BASE_SESSION_COOKIE)?.value)?.accessToken ?? null,
      auth,
    });
  }

  // 双路径：非 CloudBase 分支只给本机 Supabase 测试库用，线上不走。不要照抄，新代码只写 CloudBase 分支。待阿禅定本机测试环境后删除（见 docs/plans/待办清单.md）。
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, applyAuthCookieLifetime(options, keepLoggedIn));
            });
          } catch {
            // Server Components cannot write cookies during render.
          }
        },
      },
    },
  );
}
