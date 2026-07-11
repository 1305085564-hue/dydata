import { createClient } from "@/lib/supabase/server";
import { loadGrowthPageContract } from "@/lib/loaders/growth-page";
import { GrowthClient } from "./growth-client";

interface GrowthDataContainerProps {
  userId: string;
  userEmail: string | undefined;
}

export async function GrowthDataContainer({ userId, userEmail }: GrowthDataContainerProps) {
  const supabase = await createClient();
  const contract = await loadGrowthPageContract({
    supabase,
    userId,
    userEmail,
  });

  return <GrowthClient contract={contract} />;
}
