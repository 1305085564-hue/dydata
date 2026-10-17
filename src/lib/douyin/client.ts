import {
  DOUYIN_API_ORIGIN,
  DOUYIN_REFRESH_TOKEN_URL,
  DOUYIN_RENEW_REFRESH_TOKEN_URL,
  DOUYIN_TOKEN_URL,
  DOUYIN_USERINFO_URL,
  DouyinProviderError,
  parseDouyinTokenResponse,
  parseDouyinUserMetricResponse,
  parseDouyinVideoDataResponse,
  parseDouyinVideoListResponse,
  type DouyinToken,
  type DouyinUserMetricRow,
  type DouyinVideoData,
  type DouyinVideoListItem,
} from "./contracts";

type FetchImpl = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type DouyinClientOptions = {
  clientKey: string;
  clientSecret: string;
  fetchImpl?: FetchImpl;
  timeoutMs?: number;
};

export class DouyinClient {
  private readonly fetchImpl: FetchImpl;
  private readonly timeoutMs: number;

  constructor(private readonly options: DouyinClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  async exchangeCode(code: string): Promise<DouyinToken> {
    return this.postForm(DOUYIN_TOKEN_URL, {
      client_secret: this.options.clientSecret,
      code,
      grant_type: "authorization_code",
      client_key: this.options.clientKey,
    }).then(parseDouyinTokenResponse);
  }

  async refreshAccessToken(refreshToken: string): Promise<DouyinToken> {
    return this.postForm(DOUYIN_REFRESH_TOKEN_URL, {
      client_key: this.options.clientKey,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }).then(parseDouyinTokenResponse);
  }

  async renewRefreshToken(refreshToken: string): Promise<Pick<DouyinToken, "refreshToken" | "refreshExpiresInSeconds">> {
    const payload = await this.postForm(DOUYIN_RENEW_REFRESH_TOKEN_URL, {
      client_key: this.options.clientKey,
      refresh_token: refreshToken,
    });
    const data = asRecord(asRecord(payload).data);
    const errorCode = codeOrNull(data.error_code);
    if (errorCode && errorCode !== "0") {
      throw new DouyinProviderError("DOUYIN_REFRESH_RENEW_ERROR", stringOrFallback(data.description, "抖音续期失败"), errorCode);
    }
    const nextRefreshToken = requiredString(data.refresh_token, "refresh_token");
    const refreshExpiresInSeconds = requiredNumber(data.expires_in, "expires_in");
    return { refreshToken: nextRefreshToken, refreshExpiresInSeconds };
  }

  async getUserInfo(input: { accessToken: string; openId: string }): Promise<{ openId: string; nickname: string | null; avatar: string | null }> {
    const payload = await this.postJson(DOUYIN_USERINFO_URL, input, input.accessToken);
    const data = asRecord(asRecord(payload).data);
    return {
      openId: requiredString(data.open_id ?? input.openId, "open_id"),
      nickname: stringOrNull(data.nickname),
      avatar: stringOrNull(data.avatar),
    };
  }

  async listVideos(input: { accessToken: string; openId: string }): Promise<DouyinVideoListItem[]> {
    const items: DouyinVideoListItem[] = [];
    let cursor = 0;
    for (let page = 0; page < 4; page += 1) {
      const url = new URL(`${DOUYIN_API_ORIGIN}/video/list/`);
      url.searchParams.set("open_id", input.openId);
      url.searchParams.set("cursor", String(cursor));
      url.searchParams.set("count", "10");
      const parsed = parseDouyinVideoListResponse(await this.getJson(url, input.accessToken));
      items.push(...parsed.items);
      if (!parsed.hasMore) break;
      cursor = parsed.cursor;
    }
    return items;
  }

  async getVideoData(input: { accessToken: string; openId: string; itemIds: string[] }): Promise<DouyinVideoData[]> {
    const results: DouyinVideoData[] = [];
    for (let index = 0; index < input.itemIds.length; index += 10) {
      const itemIds = input.itemIds.slice(index, index + 10);
      if (itemIds.length === 0) continue;
      const url = new URL(`${DOUYIN_API_ORIGIN}/video/data/`);
      url.searchParams.set("open_id", input.openId);
      const payload = await this.postJson(url, { item_ids: itemIds }, input.accessToken);
      results.push(...parseDouyinVideoDataResponse(payload));
    }
    return results;
  }

  async getUserMetrics(input: { accessToken: string; openId: string; dateType: 7 | 15 | 30 }): Promise<{
    fans: DouyinUserMetricRow[];
    likes: DouyinUserMetricRow[];
    videos: DouyinUserMetricRow[];
    profile: DouyinUserMetricRow[];
  }> {
    const endpoints = {
      fans: "/data/external/user/fans/",
      likes: "/data/external/user/like/",
      videos: "/data/external/user/item/",
      profile: "/data/external/user/profile/",
    } as const;
    const values = await Promise.all(Object.values(endpoints).map(async (path) => {
      const url = new URL(`${DOUYIN_API_ORIGIN}${path}`);
      url.searchParams.set("open_id", input.openId);
      url.searchParams.set("date_type", String(input.dateType));
      return parseDouyinUserMetricResponse(await this.getJson(url, input.accessToken));
    }));
    return { fans: values[0], likes: values[1], videos: values[2], profile: values[3] };
  }

  private async getJson(url: URL, accessToken: string): Promise<unknown> {
    return this.request(url, { headers: { "content-type": "application/json", "access-token": accessToken } });
  }

  private async postJson(url: URL | string, body: unknown, accessToken?: string): Promise<unknown> {
    return this.request(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(accessToken ? { "access-token": accessToken } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  private async postForm(url: string, values: Record<string, string>): Promise<unknown> {
    return this.request(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(values).toString(),
    });
  }

  private async request(url: URL | string, init: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, { ...init, signal: controller.signal });
      const text = await response.text();
      let payload: unknown;
      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        throw new DouyinProviderError("DOUYIN_INVALID_RESPONSE", "抖音接口返回非 JSON 内容");
      }
      if (!response.ok) {
        throw new DouyinProviderError("DOUYIN_HTTP_ERROR", `抖音接口 HTTP ${response.status}`);
      }
      return payload;
    } catch (error) {
      if (error instanceof DouyinProviderError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new DouyinProviderError("DOUYIN_TIMEOUT", "抖音接口请求超时");
      }
      throw new DouyinProviderError("DOUYIN_NETWORK_ERROR", "抖音接口网络请求失败");
    } finally {
      clearTimeout(timeout);
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new DouyinProviderError("DOUYIN_INVALID_RESPONSE", "抖音接口返回格式不正确");
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string): string {
  const result = stringOrNull(value);
  if (!result) throw new DouyinProviderError("DOUYIN_INVALID_RESPONSE", `抖音响应缺少 ${field}`);
  return result;
}

function requiredNumber(value: unknown, field: string): number {
  const result = numberOrNull(value);
  if (result === null) throw new DouyinProviderError("DOUYIN_INVALID_RESPONSE", `抖音响应缺少 ${field}`);
  return result;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringOrFallback(value: unknown, fallback: string): string {
  return stringOrNull(value) ?? fallback;
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function codeOrNull(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return stringOrNull(value);
}
