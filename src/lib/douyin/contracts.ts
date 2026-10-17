export const DOUYIN_API_ORIGIN = "https://open.douyin.com";
export const DOUYIN_AUTHORIZE_URL = `${DOUYIN_API_ORIGIN}/platform/oauth/connect/`;
export const DOUYIN_TOKEN_URL = `${DOUYIN_API_ORIGIN}/oauth/access_token/`;
export const DOUYIN_REFRESH_TOKEN_URL = `${DOUYIN_API_ORIGIN}/oauth/refresh_token/`;
export const DOUYIN_RENEW_REFRESH_TOKEN_URL = `${DOUYIN_API_ORIGIN}/oauth/renew_refresh_token/`;
export const DOUYIN_USERINFO_URL = `${DOUYIN_API_ORIGIN}/oauth/userinfo/`;

export const DOUYIN_SCOPE = ["user_info", "video.list", "video.data"] as const;
export type DouyinScope = (typeof DOUYIN_SCOPE)[number] | "data.external.user";

export type DouyinToken = {
  accessToken: string;
  refreshToken: string;
  openId: string;
  expiresInSeconds: number;
  refreshExpiresInSeconds: number;
  scopes: string[];
};

export type DouyinVideoListItem = {
  platformVideoId: string;
  title: string | null;
  createdAt: string | null;
  shareUrl: string | null;
};

export type DouyinVideoListPage = {
  cursor: number;
  hasMore: boolean;
  items: DouyinVideoListItem[];
};

export type DouyinVideoData = {
  platformVideoId: string;
  playCount: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
};

export type DouyinUserMetricRow = {
  date: string;
  newFans: number | null;
  totalFans: number | null;
  newLikes: number | null;
  newPlay: number | null;
  profileUv: number | null;
  newIssue: number | null;
  totalIssue: number | null;
};

export class DouyinProviderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly providerCode: string | null = null,
  ) {
    super(`${code}: ${message}`);
    this.name = "DouyinProviderError";
  }
}

export function buildDouyinAuthorizationUrl(input: {
  clientKey: string;
  redirectUri: string;
  state: string;
  scope?: readonly string[];
}): string {
  if (!input.clientKey || !input.redirectUri || !input.state) {
    throw new DouyinProviderError("INVALID_AUTHORIZATION_CONFIG", "缺少抖音授权参数");
  }

  const url = new URL(DOUYIN_AUTHORIZE_URL);
  url.searchParams.set("client_key", input.clientKey);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", (input.scope ?? DOUYIN_SCOPE).join(","));
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  return url.toString();
}

export function parseDouyinTokenResponse(value: unknown): DouyinToken {
  const root = asRecord(value);
  const data = asRecord(root.data);
  const providerCode = codeOrNull(data.error_code ?? root.error_code);
  if (providerCode && providerCode !== "0") {
    throw new DouyinProviderError("DOUYIN_TOKEN_ERROR", stringOrFallback(data.description ?? root.description, "抖音授权失败"), providerCode);
  }

  const accessToken = requiredString(data.access_token, "access_token");
  const refreshToken = requiredString(data.refresh_token, "refresh_token");
  const openId = requiredString(data.open_id, "open_id");
  const expiresInSeconds = requiredNumber(data.expires_in, "expires_in");
  const refreshExpiresInSeconds = requiredNumber(data.refresh_expires_in, "refresh_expires_in");
  const scopes = stringOrFallback(data.scope, "")
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);

  return { accessToken, refreshToken, openId, expiresInSeconds, refreshExpiresInSeconds, scopes };
}

export function parseDouyinVideoListResponse(value: unknown): DouyinVideoListPage {
  const data = successData(value);
  const rawList = Array.isArray(data.list) ? data.list : [];
  const items = rawList.map((item, index) => {
    const row = asRecord(item);
    return {
      platformVideoId: requiredString(row.item_id, `list[${index}].item_id`),
      title: stringOrNull(row.title),
      createdAt: unixSecondsToIso(row.create_time),
      shareUrl: stringOrNull(row.share_url),
    } satisfies DouyinVideoListItem;
  });

  return {
    cursor: numberOrDefault(data.cursor, 0),
    hasMore: Boolean(data.has_more),
    items,
  };
}

export function parseDouyinVideoDataResponse(value: unknown): DouyinVideoData[] {
  const data = successData(value);
  const rawList = Array.isArray(data.list) ? data.list : [];
  return rawList.map((item, index) => {
    const row = asRecord(item);
    const statistics = asRecord(row.statistics);
    return {
      platformVideoId: requiredString(row.item_id, `list[${index}].item_id`),
      playCount: numberOrNull(statistics.play_count),
      likes: numberOrNull(statistics.digg_count),
      comments: numberOrNull(statistics.comment_count),
      shares: numberOrNull(statistics.share_count),
      favorites: numberOrNull(statistics.collect_count ?? statistics.favorite_count),
    } satisfies DouyinVideoData;
  });
}

export function parseDouyinUserMetricResponse(value: unknown): DouyinUserMetricRow[] {
  const data = successData(value);
  const rawList = Array.isArray(data.result_list) ? data.result_list : [];
  return rawList.map((item, index) => {
    const row = asRecord(item);
    const date = requiredString(row.date, `result_list[${index}].date`);
    return {
      date,
      newFans: numberOrNull(row.new_fans),
      totalFans: numberOrNull(row.total_fans),
      newLikes: numberOrNull(row.new_like),
      newPlay: numberOrNull(row.new_play),
      profileUv: numberOrNull(row.profile_uv),
      newIssue: numberOrNull(row.new_issue),
      totalIssue: numberOrNull(row.total_issue),
    } satisfies DouyinUserMetricRow;
  });
}

function successData(value: unknown): Record<string, unknown> {
  const root = asRecord(value);
  const data = asRecord(root.data);
  const providerCode = codeOrNull(data.error_code ?? root.error_code ?? root.code);
  if (providerCode && providerCode !== "0") {
    throw new DouyinProviderError("DOUYIN_API_ERROR", stringOrFallback(data.description ?? root.description, "抖音接口调用失败"), providerCode);
  }
  return data;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DouyinProviderError("DOUYIN_INVALID_RESPONSE", "抖音接口返回格式不正确");
  }
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

function codeOrNull(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return stringOrNull(value);
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function numberOrDefault(value: unknown, fallback: number): number {
  return numberOrNull(value) ?? fallback;
}

function unixSecondsToIso(value: unknown): string | null {
  const seconds = numberOrNull(value);
  return seconds === null ? null : new Date(seconds * 1000).toISOString();
}
