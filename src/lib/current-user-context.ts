import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const getCurrentUserContext = cache(async () => {
  const supabase = await createClient();
  const authResult = await supabase.auth.getUser();

  return {
    supabase,
    user: authResult.data.user,
    authError: authResult.error,
  };
});
