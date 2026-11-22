import { logApiError } from "./api-logger";
import { createRequestContext } from "./request-context";

// 这些操作依赖 auth.uid()。管理员连接没有本人身份，不能用它替代员工连接。
// 三个履约标记函数仅允许 service_role；路由先校验角色/成员范围，再显式传入操作者。
const USER_IDENTITY_RPCS = new Set([
  "review_exemption_request_dates_atomically",
  "reopen_exemption_request_atomically",
  "set_permanent_exemption_owner_atomically",
  "clear_permanent_exemption_owner_atomically",
  "apply_exemption_grant_atomically",
  "clear_exemption_grant_atomically",
  "handle_fulfillment_appeal",
  "reopen_fulfillment_appeal_atomically",
  "review_team_join_request",
  "get_leaderboard_rows",
  "count_remind_logs_for_user",
]);

export function guardAdminRpc<T extends { rpc: (...args: never[]) => unknown }>(client: T, backend: "supabase" | "cloudbase"): T {
  return new Proxy(client, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (property === "rpc") {
        return (name: string, ...args: unknown[]) => {
          const normalizedName = name.trim().toLowerCase().replace(/^[^.]+\./, "");
          if (USER_IDENTITY_RPCS.has(normalizedName)) {
            const context = createRequestContext({ route: "database/rpc", operation: normalizedName });
            const error = new Error(`${normalizedName} 必须使用本人身份连接`);
            logApiError({ requestId: context.requestId, route: context.route, outcome: "rejected", detail: { rpc: normalizedName, backend } }, error);
            throw error;
          }
          return Reflect.apply(target.rpc, target, [name, ...args]);
        };
      }
      if (property === "schema" && typeof value === "function") {
        return (...args: unknown[]) => guardAdminRpc(Reflect.apply(value, target, args), backend);
      }
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
