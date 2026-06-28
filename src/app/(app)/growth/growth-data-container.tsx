import { createClient } from "@/lib/supabase/server";
import { loadGrowthPageData } from "@/lib/loaders/growth-page";
import { GrowthClientShell } from "./growth-client";

interface GrowthDataContainerProps {
  userId: string;
  userEmail: string | undefined;
}

export async function GrowthDataContainer({ userId, userEmail }: GrowthDataContainerProps) {
  const supabase = await createClient();
  const data = await loadGrowthPageData({
    supabase,
    userId,
    userEmail,
    mode: "initial",
  });

  return <GrowthClientShell {...data} />;
}
