// 实际连接腾讯云 CloudBase，目录名是历史遗留。
import { createCloudBaseBrowserAuth } from "@/lib/cloudbase/auth-client";
import { createCloudBaseDataClient } from "@/lib/cloudbase/data-client";

export function createClient() {
  return createCloudBaseDataClient({ role: "browser", auth: createCloudBaseBrowserAuth() });
}
