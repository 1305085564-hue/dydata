import { createClient } from "@supabase/supabase-js";
import { createCloudBaseDataClient } from "@/lib/cloudbase/data-client";
import { isCloudBaseBackend } from "@/lib/cloudbase/core";
import { createCloudBaseManagerClient, createCloudBaseUserManagement } from "@/lib/cloudbase/management";

export function createAdminClient() {
  if (isCloudBaseBackend()) {
    if (!process.env.CLOUDBASE_SERVICE_API_KEY) {
      throw new Error("Missing CLOUDBASE_SERVICE_API_KEY");
    }
    const client = createCloudBaseDataClient({ role: "admin" });
    const authAdmin = client.auth.admin as unknown as {
      getUserById: (subject: string) => Promise<{ data: { user: unknown | null }; error: unknown | null }>;
      updateUserById: (subject: string, attributes: unknown) => Promise<unknown>;
    };
    const management = createCloudBaseUserManagement({
      createManager: createCloudBaseManagerClient,
      async getUserById(subject) {
        const { data, error } = await authAdmin.getUserById(subject);
        return { user: data.user, error };
      },
    });
    authAdmin.updateUserById = management.updateUserById;
    return client;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
