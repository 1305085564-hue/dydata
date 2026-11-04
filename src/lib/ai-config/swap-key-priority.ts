import { compareChannelPriority, toPriority } from "@/lib/ai-config/priority";
import { toTrimmedString } from "@/lib/type-guards";

type KeyPrioritySupabase = {
  from: (table: string) => {
    select: (columns: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
    update: (payload: Record<string, unknown>) => {
      eq: (column: string, value: unknown) => MutationQuery;
    };
  };
};

type MutationQuery = {
  eq: (column: string, value: unknown) => MutationQuery;
  select: (columns: string) => {
    maybeSingle: () => PromiseLike<{ data: { id: string } | null; error: { message: string } | null }>;
  };
};

async function updatePriority(
  supabase: KeyPrioritySupabase,
  id: string,
  expectedPriority: number,
  nextPriority: number,
) {
  return supabase
    .from("ai_provider_keys")
    .update({ priority: nextPriority })
    .eq("id", id)
    .eq("priority", expectedPriority)
    .select("id")
    .maybeSingle();
}

export async function swapKeyPriority(supabase: KeyPrioritySupabase, data: Record<string, unknown>) {
  const keyId = toTrimmedString(data.key_id);
  const targetKeyId = toTrimmedString(data.target_key_id);
  const keyPriority = toPriority(data.key_priority, Number.NaN);
  const targetPriority = toPriority(data.target_priority, Number.NaN);
  if (!keyId || !targetKeyId || keyId === targetKeyId || !Number.isFinite(keyPriority) || !Number.isFinite(targetPriority)) {
    throw new Error("顺位交换参数不合法");
  }

  const { data: keys, error: keysError } = await supabase
    .from("ai_provider_keys")
    .select("id, priority");
  if (keysError) throw new Error(keysError.message);
  const rows = (keys ?? []) as Array<{ id: string; priority: number }>;
  const key = rows.find((row) => row.id === keyId);
  const target = rows.find((row) => row.id === targetKeyId);
  if (!key || !target) throw new Error("待交换的 API Key 不存在");
  const hasProvidedPriority = Number.isFinite(keyPriority) && Number.isFinite(targetPriority);
  if (hasProvidedPriority) {
    const matchesOriginal = key.priority === keyPriority && target.priority === targetPriority;
    const matchesOptimistic = key.priority === targetPriority && target.priority === keyPriority;
    if (!matchesOriginal && !matchesOptimistic) {
      throw new Error("顺位已变化，请刷新后重试");
    }
  }

  const currentKeyPriority = key.priority;
  const currentTargetPriority = target.priority;

  if (currentKeyPriority === currentTargetPriority) {
    // 相同数字不能直接交换。按页面的稳定顺序交换位置，再只展开冲突的顺位。
    const ordered = [...rows].sort(compareChannelPriority);
    const from = ordered.findIndex((row) => row.id === keyId);
    const to = ordered.findIndex((row) => row.id === targetKeyId);
    [ordered[from], ordered[to]] = [ordered[to], ordered[from]];
    const priorities = ordered.map((row) => row.priority);
    const start = ordered.findIndex((row) => row.priority === currentKeyPriority);
    let end = start;
    while (end + 1 < priorities.length && priorities[end + 1] <= priorities[end]) {
      priorities[end + 1] = priorities[end] + 1;
      end++;
    }
    priorities[end] = Math.min(priorities[end], 999);
    for (let i = end - 1; i >= 0 && priorities[i] >= priorities[i + 1]; i--) priorities[i] = priorities[i + 1] - 1;
    const applied: Array<{ id: string; before: number; after: number }> = [];
    try {
      for (let i = 0; i < ordered.length; i++) {
        const row = ordered[i];
        if (row.priority === priorities[i]) continue;
        const result = await updatePriority(supabase, row.id, row.priority, priorities[i]);
        if (result.error || !result.data) throw new Error(result.error?.message ?? "顺位已变化，请刷新后重试");
        applied.push({ id: row.id, before: row.priority, after: priorities[i] });
      }
    } catch (error) {
      for (const row of applied.reverse()) await updatePriority(supabase, row.id, row.after, row.before);
      throw error;
    }
    return;
  }

  const firstResult = await updatePriority(supabase, keyId, currentKeyPriority, currentTargetPriority);
  if (firstResult.error) throw new Error(firstResult.error.message);
  if (!firstResult.data) throw new Error("顺位已变化，请刷新后重试");

  const secondResult = await updatePriority(supabase, targetKeyId, currentTargetPriority, currentKeyPriority);
  if (secondResult.error || !secondResult.data) {
    await updatePriority(supabase, keyId, targetPriority, keyPriority);
    throw new Error(secondResult.error?.message ?? "顺位已变化，请刷新后重试");
  }
}
