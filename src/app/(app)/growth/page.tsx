import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import GrowthLoading from "./loading";
import { GrowthDataContainer } from "./growth-data-container";

export default async function GrowthPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <Suspense fallback={<GrowthLoading />}>
      <GrowthDataContainer userId={user.id} userEmail={user.email} />
    </Suspense>
  );
}
