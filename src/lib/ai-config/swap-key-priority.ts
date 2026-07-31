import { toPriority, toTrimmedString } from "@/app/api/admin/ai-channels/_shared";

type KeyPrioritySupabase = {
  from: (table: string) => {
    select: (columns: string) => {
      in: (column: string, values: string[]) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
    };
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
    .select("id, priority")
    .in("id", [keyId, targetKeyId]);
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

  const firstResult = await updatePriority(supabase, keyId, currentKeyPriority, currentTargetPriority);
  if (firstResult.error) throw new Error(firstResult.error.message);
  if (!firstResult.data) throw new Error("顺位已变化，请刷新后重试");

  const secondResult = await updatePriority(supabase, targetKeyId, currentTargetPriority, currentKeyPriority);
  if (secondResult.error || !secondResult.data) {
    await updatePriority(supabase, keyId, targetPriority, keyPriority);
    throw new Error(secondResult.error?.message ?? "顺位已变化，请刷新后重试");
  }
}
