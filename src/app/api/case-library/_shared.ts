import { NextResponse } from "next/server";

import { requireAdminActor } from "@/app/api/admin/ai-assistant/_shared";
import { createAdminClient } from "@/lib/supabase/admin";

type RpcResult<T> = {
  data: T | null;
  error: { message?: string } | null;
};

export async function requireCaseLibraryServiceClient() {
  const auth = await requireAdminActor({ requiredPermission: "manage_violations" });
  if ("error" in auth) {
    return { response: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  }

  return {
    actor: auth.actor,
    supabase: createAdminClient(),
  };
}

export function unwrapCaseLibraryRpc<T>(result: RpcResult<T>, fallbackMessage: string) {
  if (result.error) {
    return {
      response: NextResponse.json(
        { error: result.error.message || fallbackMessage },
        { status: 500 },
      ),
    };
  }

  return { data: result.data as T };
}
