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
    <main className="min-h-full bg-stone-50 px-4 py-6 sm:px-6 lg:px-8">
      {/* ⚠️ 一次性验证前端，Antigravity 重写时整块删除，禁止参考此处任何结构/样式/命名。 */}
      <div className="mx-auto max-w-6xl">
        <h1 className="text-[24px] font-medium leading-[1.6] text-stone-900">⚠️ 一次性验证前端，Antigravity 重写时整块删除，禁止参考此处任何结构/样式/命名。</h1>
        <pre className="mt-6 overflow-x-auto rounded-2xl border border-stone-200 bg-white p-5 text-[13px] leading-[1.6] text-stone-700 tabular-nums">{JSON.stringify(data, null, 2)}</pre>
      </div>
    </main>
  );
}
