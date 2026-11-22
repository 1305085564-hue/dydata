// 实际连接腾讯云 CloudBase，目录名是历史遗留。
import { createCloudBaseDataClient } from "@/lib/cloudbase/data-client";
import { cloudBaseEnvironmentId } from "@/lib/cloudbase/core";
import { createCloudBaseUserManagement } from "@/lib/cloudbase/management";

export function createAdminClient() {
  if (!process.env.CLOUDBASE_SERVICE_API_KEY) {
    throw new Error("Missing CLOUDBASE_SERVICE_API_KEY");
  }
  const client = createCloudBaseDataClient({ role: "admin" });
  const authAdmin = client.auth.admin as unknown as {
    getUserById: (subject: string) => Promise<{ data: { user: unknown | null }; error: unknown | null }>;
    updateUserById: (subject: string, attributes: unknown) => Promise<unknown>;
  };
  const management = createCloudBaseUserManagement({
    async writeUserStatus(subject, status) {
      return client.rpc("cloudbase_set_auth_user_status", {
        p_subject: subject, p_status: status, p_project: cloudBaseEnvironmentId(),
      });
    },
    async getUserById(subject) {
      const { data, error } = await authAdmin.getUserById(subject);
      return { user: data.user, error };
    },
  });
  authAdmin.updateUserById = management.updateUserById;
  return client;
}
