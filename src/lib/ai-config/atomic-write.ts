import type { AiConfigSupabase } from "./batch-actions";

/** One RPC is one database transaction; never emulate it with compensating deletes. */
export async function runAiConfigWrite(supabase: AiConfigSupabase, name: string, parameters: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(name, parameters);
  if (error) {
    const missingMigration = error.code === "PGRST202" || /could not find the function|function .* does not exist/i.test(error.message);
    throw Object.assign(new Error(missingMigration ? "数据库尚未执行 AI 配置事务迁移，此操作暂不可用" : error.message), { status: missingMigration ? 409 : 400 });
  }
  return data;
}
