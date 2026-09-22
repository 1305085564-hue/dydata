/**
 * 历史手稿编辑原子 RPC 的判定工具。
 *
 * 生产库执行 `20260922180000_history_report_edit_atomic.sql` 之前，新函数不存在；
 * 这时必须降级到旧的两次写入路径，而不是把用户的保存直接打死。
 * 只认「函数不存在」这一种错误，其余错误（含 RPC 内部 raise）一律如实抛出。
 */
export function isHistoryEditRpcMissing(
  error: { code?: string | null; message?: string | null } | null | undefined,
) {
  if (!error) return false;
  const code = error.code ?? "";
  // 42883 = undefined_function；PGRST202 = PostgREST 的 schema cache 里找不到该函数
  if (code === "42883" || code === "PGRST202") return true;
  const message = error.message ?? "";
  return (
    message.includes("update_history_report_edit_atomic") &&
    /does not exist|could not find/i.test(message)
  );
}

/**
 * RPC 内部用 raise 表达的、可以直接展示给用户的业务错误码：
 * 22023 = invalid_parameter_value，P0001 = raise_exception，P0002 = no_data_found。
 * 其余错误码（连接失败、权限、超时）不回显原始信息。
 */
export function resolveHistoryEditRpcErrorMessage(
  error: { code?: string | null; message?: string | null } | null | undefined,
  fallback = "保存失败，请重试",
) {
  if (!error) return fallback;
  const code = error.code ?? "";
  if (code === "22023" || code === "P0001" || code === "P0002") {
    const message = (error.message ?? "").trim();
    return message || fallback;
  }
  return fallback;
}
