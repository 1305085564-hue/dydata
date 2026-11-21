import { logApiError } from "./api-logger";
import { createRequestContext } from "./request-context";

// 这些操作依赖 auth.uid()。管理员连接没有本人身份，不能用它替代员工连接。
const USER_IDENTITY_RPCS = new Set([
  "review_exemption_request_dates_atomically",
  "reopen_exemption_request_atomically",
  "set_permanent_exemption_owner_atomically",
  "clear_permanent_exemption_owner_atomically",
  "mark_fulfillment_status",
  "mark_fulfillment_status_batch",
  "remove_fulfillment_mark",
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
          if (USER_IDENTITY_RPCS.has(name)) {
            const context = createRequestContext({ route: "database/rpc", operation: name });
            const error = new Error(`${name} 必须使用本人身份连接`);
            logApiError({ requestId: context.requestId, route: context.route, outcome: "rejected", detail: { rpc: name, backend } }, error);
            throw error;
          }
          return Reflect.apply(target.rpc, target, [name, ...args]);
        };
      }
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
