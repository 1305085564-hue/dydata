import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { cloudBaseRestUrl } from "./core";

export type CloudBaseDataRole = "user" | "admin" | "browser";
type AuthShape = Record<string, unknown> & { admin?: Record<string, unknown> };
type CloudBaseRpcResult = { data: unknown; error: { message?: string; code?: string } | null };
type CloudBaseRpcClient = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<CloudBaseRpcResult> };

async function normalizeDatabaseErrorResponse(response: Response): Promise<Response> {
  if (response.ok || !/json/i.test(response.headers.get("content-type") ?? "")) return response;

  let payload: unknown;
  try {
    payload = await response.clone().json();
  } catch {
    return response;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return response;

  const body = payload as Record<string, unknown>;
  const code = body.code;
  if (typeof code !== "string" || !/^DATABASE_[0-9A-Z]{5}$/.test(code)) return response;

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  return new Response(JSON.stringify({ ...body, code: code.slice("DATABASE_".length) }), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function createCloudBaseFetch(options: {
  role: CloudBaseDataRole;
  userToken?: string | null | (() => string | null);
  fetcher?: typeof fetch;
}) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const sourceRequest = input instanceof Request ? new Request(input, init) : new Request(input, init);
    const target = cloudBaseRestUrl(sourceRequest.url, options.role === "browser");
    const headers = new Headers(sourceRequest.headers);
    headers.delete("apikey");
    headers.delete("authorization");
    const preferences = (headers.get("prefer") ?? "").split(",")
      .map((item) => item.trim()).filter((item) => item && !/^timezone=/i.test(item));
    headers.set("prefer", [...preferences, "timezone=UTC"].join(", "));

    if (options.role === "admin") {
      const serviceKey = process.env.CLOUDBASE_SERVICE_API_KEY;
      if (!serviceKey) throw new Error("缺少 CloudBase 服务端 API Key");
      headers.set("authorization", `Bearer ${serviceKey}`);
    } else if (options.role === "user") {
      const userToken = typeof options.userToken === "function" ? options.userToken() : options.userToken;
      if (!userToken) throw new Error("未登录，无法访问 CloudBase 数据");
      headers.set("authorization", `Bearer ${userToken}`);
    }

    if (options.role === "browser") {
      const response = await (options.fetcher ?? fetch)(target, {
        method: sourceRequest.method,
        headers,
        body: ["GET", "HEAD"].includes(sourceRequest.method) ? undefined : sourceRequest.body,
        cache: sourceRequest.cache,
        credentials: "same-origin",
        duplex: "half",
        signal: AbortSignal.timeout(20_000),
      } as RequestInit);
      return normalizeDatabaseErrorResponse(response);
    }

    const request = new Request(target, {
      method: sourceRequest.method,
      headers,
      body: ["GET", "HEAD"].includes(sourceRequest.method) ? undefined : sourceRequest.body,
      redirect: sourceRequest.redirect,
      cache: sourceRequest.cache,
      credentials: "omit",
      duplex: "half",
      signal: AbortSignal.timeout(20_000),
    } as RequestInit);
    return normalizeDatabaseErrorResponse(await (options.fetcher ?? fetch)(request));
  };
}

function unsupportedAuthOperation(operation: string) {
  return {
    data: operation === "getSession" ? { session: null } : null,
    error: Object.assign(new Error(`CloudBase 暂不支持 ${operation}`), { code: "unsupported_operation" }),
  };
}

function defaultCloudBaseAuth(): AuthShape {
  return {
    getUser: async () => unsupportedAuthOperation("auth.getUser"),
    getSession: async () => unsupportedAuthOperation("auth.getSession"),
    signInWithPassword: async () => unsupportedAuthOperation("auth.signInWithPassword"),
    signOut: async () => unsupportedAuthOperation("auth.signOut"),
    refreshSession: async () => unsupportedAuthOperation("auth.refreshSession"),
    signUp: async () => unsupportedAuthOperation("auth.signUp"),
    updateUser: async () => unsupportedAuthOperation("auth.updateUser"),
    resetPasswordForEmail: async () => unsupportedAuthOperation("auth.resetPasswordForEmail"),
    exchangeCodeForSession: async () => unsupportedAuthOperation("auth.exchangeCodeForSession"),
    verifyOtp: async () => unsupportedAuthOperation("auth.verifyOtp"),
  };
}

export function createCloudBaseAdminAuth(client: CloudBaseRpcClient) {
  return {
    async getUserById(subject: string) {
      const { data, error } = await client.rpc("cloudbase_auth_user_by_subject", { p_subject: subject });
      if (error) return { data: { user: null }, error };
      return { data: { user: data ?? null }, error: null };
    },
    async listUsers(options: { page?: number; perPage?: number } = {}) {
      const { data, error } = await client.rpc("cloudbase_auth_users_page", {
        p_page: options.page ?? 1,
        p_per_page: options.perPage ?? 50,
      });
      if (error) return { data: { users: [], total: 0, nextPage: null, lastPage: 0 }, error };
      const result = (data ?? {}) as { users?: unknown[]; total?: number; page?: number; per_page?: number };
      const page = result.page ?? options.page ?? 1;
      const perPage = result.per_page ?? options.perPage ?? 50;
      const total = result.total ?? 0;
      const lastPage = Math.ceil(total / Math.max(1, perPage));
      return {
        data: {
          users: Array.isArray(result.users) ? result.users : [],
          total,
          nextPage: page < lastPage ? page + 1 : null,
          lastPage,
        },
        error: null,
      };
    },
    async updateUserById() {
      return unsupportedAuthOperation("auth.admin.updateUserById");
    },
    async deleteUser() {
      return unsupportedAuthOperation("auth.admin.deleteUser");
    },
  };
}

export function createCloudBaseDataClient(options: {
  role: CloudBaseDataRole;
  userToken?: string | null | (() => string | null);
  fetcher?: typeof fetch;
  auth?: AuthShape;
}) {
  const client = createSupabaseClient("https://cloudbase-adapter.invalid", "cloudbase-adapter-public-key", {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { fetch: createCloudBaseFetch(options) },
    db: { schema: "public" },
  });

  const auth = options.auth ?? defaultCloudBaseAuth();
  if (options.role === "admin") auth.admin = createCloudBaseAdminAuth(client as unknown as CloudBaseRpcClient) as unknown as Record<string, unknown>;
  return new Proxy(client, {
    get(target, property, receiver) {
      if (property === "auth") return auth;
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
