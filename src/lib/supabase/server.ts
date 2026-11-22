// 实际连接腾讯云 CloudBase，目录名是历史遗留。
import { cookies } from "next/headers";

import { createCloudBaseServerAuth } from "@/lib/cloudbase/auth-client";
import { createCloudBaseDataClient } from "@/lib/cloudbase/data-client";
import { CLOUD_BASE_SESSION_COOKIE, parseCloudBaseSession } from "@/lib/cloudbase/core";

import {
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

  const auth = createCloudBaseServerAuth(cookieStore, keepLoggedIn);
  return createCloudBaseDataClient({
    role: "user",
    userToken: () => parseCloudBaseSession(cookieStore.get(CLOUD_BASE_SESSION_COOKIE)?.value)?.accessToken ?? null,
    auth,
  });
}
