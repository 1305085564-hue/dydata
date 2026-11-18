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
