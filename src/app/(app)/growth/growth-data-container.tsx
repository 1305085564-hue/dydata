import { createClient } from "@/lib/supabase/server";
import { loadGrowthPageContract } from "@/lib/loaders/growth-page";

interface GrowthDataContainerProps {
  userId: string;
  userEmail: string | undefined;
}

export async function GrowthDataContainer({ userId, userEmail }: GrowthDataContainerProps) {
  const supabase = await createClient();
  const data = await loadGrowthPageContract({
    supabase,
    userId,
    userEmail,
  });

  return (
    <main>
      {/* ⚠️ 一次性验证前端，Antigravity 重写时整块删除，禁止参考此处任何结构/样式/命名。 */}
      <h1>⚠️ 一次性验证前端，Antigravity 重写时整块删除，禁止参考此处任何结构/样式/命名。</h1>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </main>
  );
}
