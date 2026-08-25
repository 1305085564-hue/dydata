/**
 * 百度 OCR 客户端（网络图片文字识别 webimage）
 * 独立模块：access_token 换取与缓存、前置校验、错误码五类分法。
 * 本模块不依赖任何现有业务代码；接口层接入在下一批完成。
 */

export type BaiduOcrErrorType =
  | "CONFIG"
  | "TOKEN_INVALID"
  | "QPS_LIMITED"
  | "QUOTA_EXCEEDED"
  | "IMAGE_REJECTED"
  | "SERVICE_ERROR"
  | "TIMEOUT";

export class BaiduOcrError extends Error {
  constructor(
    message: string,
    public readonly errorType: BaiduOcrErrorType,
    public readonly baiduErrorCode?: number,
  ) {
    super(message);
    this.name = "BaiduOcrError";
  }
}

const BAIDU_TOKEN_URL = "https://aip.baidubce.com/oauth/2.0/token";
const BAIDU_WEBIMAGE_URL = "https://aip.baidubce.com/rest/2.0/ocr/v1/webimage";

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TOKEN_REFRESH_MARGIN_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;

// 百度限制：base64 编码后不超过 4M
const MAX_BASE64_LENGTH = 4 * 1024 * 1024;
// 百度限制：最短边大于 15px，最长边小于 4096px
const MIN_IMAGE_SIDE_PX = 15;
const MAX_IMAGE_SIDE_PX = 4096;

type TokenCache = { accessToken: string; refreshAtMs: number };
let tokenCache: TokenCache | null = null;

/** 仅测试使用：清空 token 缓存 */
export function _resetBaiduOcrTokenCacheForTest() {
  tokenCache = null;
}

function getEnvValue(name: string): string {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function requireKeys(): { apiKey: string; secretKey: string } {
  const apiKey = getEnvValue("BAIDU_OCR_API_KEY");
  const secretKey = getEnvValue("BAIDU_OCR_SECRET_KEY");
  if (!apiKey || !secretKey) {
    throw new BaiduOcrError(
      "百度 OCR 未配置：缺少 BAIDU_OCR_API_KEY / BAIDU_OCR_SECRET_KEY 环境变量",
      "CONFIG",
    );
  }
  return { apiKey, secretKey };
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new BaiduOcrError(`百度 OCR 请求超时（${REQUEST_TIMEOUT_MS / 1000} 秒）`, "TIMEOUT");
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new BaiduOcrError(`百度 OCR 网络请求失败：${message}`, "SERVICE_ERROR");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 获取百度 access_token，模块级内存缓存。
 * token 有效期约 30 天，留 1 天安全余量提前刷新；Serverless 冷启动接受重新换取。
 */
export async function getBaiduOcrAccessToken(forceRefresh = false): Promise<string> {
  const now = Date.now();
  if (!forceRefresh && tokenCache && now < tokenCache.refreshAtMs) {
    return tokenCache.accessToken;
  }

  const { apiKey, secretKey } = requireKeys();
  const start = Date.now();
  console.log(`[baidu-ocr] access_token ${forceRefresh ? "强制刷新" : "换取"}开始`);

  const response = await fetchWithTimeout(BAIDU_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: apiKey,
      client_secret: secretKey,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { access_token?: unknown; expires_in?: unknown; error?: unknown }
    | null;

  if (
    !response.ok ||
    !payload ||
    typeof payload.access_token !== "string" ||
    !payload.access_token
  ) {
    console.error(
      `[baidu-ocr] access_token 换取失败 status=${response.status} http_error=${
        payload && typeof payload.error === "string" ? payload.error : "unknown"
      }`,
    );
    throw new BaiduOcrError(
      `百度 OCR access_token 换取失败（HTTP ${response.status}）`,
      "SERVICE_ERROR",
    );
  }

  const expiresInMs =
    typeof payload.expires_in === "number" && payload.expires_in > 0
      ? payload.expires_in * 1000
      : TOKEN_TTL_MS;
  tokenCache = {
    accessToken: payload.access_token,
    refreshAtMs: start + Math.min(expiresInMs, TOKEN_TTL_MS) - TOKEN_REFRESH_MARGIN_MS,
  };
  console.log(
    `[baidu-ocr] access_token 换取成功 耗时=${Date.now() - start}ms 有效期≈${Math.round(
      Math.min(expiresInMs, TOKEN_TTL_MS) / 86400000,
    )}天`,
  );
  return tokenCache.accessToken;
}

export type ImageDimensions = { width: number; height: number };

export type WebImageValidation =
  | { ok: true; base64: string; rawByteLength: number; dimensions: ImageDimensions | null }
  | { ok: false; reason: string };

/**
 * 前置校验：剥 data URL 头 → base64 大小 ≤ 4M → 图片边长符合百度限制。
 * 校验不通过时不发起任何网络请求。
 */
export function validateWebImage(imageBuffer: Buffer): WebImageValidation {
  let buffer = imageBuffer;

  // 剥掉可能存在的 data:image/...;base64, 头
  if (buffer.length > 5 && buffer.toString("ascii", 0, 5) === "data:") {
    const text = buffer.toString("utf8");
    const commaIndex = text.indexOf(",");
    if (commaIndex === -1) {
      return { ok: false, reason: "data URL 格式不正确" };
    }
    buffer = Buffer.from(text.slice(commaIndex + 1), "base64");
  }

  if (buffer.length === 0) {
    return { ok: false, reason: "图片内容为空" };
  }

  const base64 = buffer.toString("base64");
  if (base64.length > MAX_BASE64_LENGTH) {
    return {
      ok: false,
      reason: `base64 编码后 ${(base64.length / 1024 / 1024).toFixed(2)}M 超过百度 4M 上限`,
    };
  }

  const dimensions = getImageDimensions(buffer);
  if (dimensions) {
    const shortest = Math.min(dimensions.width, dimensions.height);
    const longest = Math.max(dimensions.width, dimensions.height);
    if (shortest <= MIN_IMAGE_SIDE_PX) {
      return { ok: false, reason: `图片最短边 ${shortest}px 需大于 ${MIN_IMAGE_SIDE_PX}px` };
    }
    if (longest >= MAX_IMAGE_SIDE_PX) {
      return { ok: false, reason: `图片最长边 ${longest}px 需小于 ${MAX_IMAGE_SIDE_PX}px` };
    }
  }

  return { ok: true, base64, rawByteLength: buffer.length, dimensions };
}

/** 百度错误码 → 分类。未知错误码归入 SERVICE_ERROR（通道级告警语义）。 */
export function classifyBaiduOcrErrorCode(code: number): BaiduOcrErrorType {
  if (code === 110 || code === 111) return "TOKEN_INVALID";
  if (code === 18) return "QPS_LIMITED";
  if (code === 17 || code === 19 || code === 216604) return "QUOTA_EXCEEDED";
  if (code === 216201 || code === 216202 || code === 216205 || code === 282100) {
    return "IMAGE_REJECTED";
  }
  return "SERVICE_ERROR";
}

const ERROR_TYPE_MESSAGES: Record<BaiduOcrErrorType, string> = {
  CONFIG: "截图识别未配置，请联系管理员",
  TOKEN_INVALID: "截图识别凭证失效，请稍后重试或联系管理员",
  QPS_LIMITED: "识别请求过于频繁，请稍后再试",
  QUOTA_EXCEEDED: "识别额度已用尽，请联系管理员开通付费",
  IMAGE_REJECTED: "图片不符合识别要求，请重新上传或手动填写",
  SERVICE_ERROR: "截图识别服务异常，请稍后重试或联系管理员",
  TIMEOUT: "识别超时，请稍后重试",
};

export function getBaiduOcrErrorMessage(type: BaiduOcrErrorType): string {
  return ERROR_TYPE_MESSAGES[type];
}

type BaiduWebimageResponse = {
  words_result?: Array<{ words?: unknown }>;
  words_result_num?: number;
  log_id?: number | string;
  error_code?: number;
  error_msg?: string;
};

/**
 * 网络图片文字识别。成功返回文字行数组；
 * 110/111 内部自动刷新 token 重试一次，仍失败才抛 TOKEN_INVALID。
 */
export async function recognizeWebImage(imageBuffer: Buffer): Promise<string[]> {
  const validation = validateWebImage(imageBuffer);
  if (!validation.ok) {
    console.warn(`[baidu-ocr] 前置校验未通过，未发起请求：${validation.reason}`);
    throw new BaiduOcrError(`图片不符合百度 OCR 要求：${validation.reason}`, "IMAGE_REJECTED");
  }

  console.log(
    `[baidu-ocr] webimage 识别开始 图片原始字节=${validation.rawByteLength} base64长度=${validation.base64.length}` +
      (validation.dimensions
        ? ` 尺寸=${validation.dimensions.width}x${validation.dimensions.height}`
        : ""),
  );

  // 固定一次识别内使用的 token；send 不自行换 token，保证重试路径行为可测。
  const send = async (accessToken: string): Promise<BaiduWebimageResponse> => {
    const start = Date.now();
    const response = await fetchWithTimeout(
      `${BAIDU_WEBIMAGE_URL}?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ image: validation.base64 }),
      },
    );
    const durationMs = Date.now() - start;
    const payload = (await response.json().catch(() => null)) as BaiduWebimageResponse | null;
    if (!payload) {
      console.error(
        `[baidu-ocr] webimage 响应解析失败 status=${response.status} 耗时=${durationMs}ms`,
      );
      throw new BaiduOcrError(`百度 OCR 返回无法解析（HTTP ${response.status}）`, "SERVICE_ERROR");
    }
    console.log(`[baidu-ocr] webimage 响应到达 status=${response.status} 耗时=${durationMs}ms`);
    return payload;
  };

  let payload = await send(await getBaiduOcrAccessToken());

  if (isTokenInvalidResponse(payload)) {
    console.warn("[baidu-ocr] token 失效（110/111），自动刷新后重试一次");
    payload = await send(await getBaiduOcrAccessToken(true));
    if (isTokenInvalidResponse(payload)) {
      console.error("[baidu-ocr] 刷新 token 后重试仍失败（110/111）");
      throw new BaiduOcrError("百度 OCR token 刷新后仍无效", "TOKEN_INVALID", payload.error_code);
    }
  }

  if (!payload.words_result || !Array.isArray(payload.words_result)) {
    classifyAndThrow(payload);
  }

  const lines = payload.words_result
    .map((item) => (typeof item?.words === "string" ? item.words.trim() : ""))
    .filter((line) => line.length > 0);

  console.log(
    `[baidu-ocr] webimage 识别成功 文字行=${lines.length} log_id=${payload.log_id ?? "unknown"}`,
  );
  return lines;
}

function isTokenInvalidResponse(payload: BaiduWebimageResponse): boolean {
  return !payload.words_result && (payload.error_code === 110 || payload.error_code === 111);
}

function classifyAndThrow(payload: BaiduWebimageResponse): never {
  const code = typeof payload.error_code === "number" ? payload.error_code : -1;
  const type = classifyBaiduOcrErrorCode(code);
  console.error(
    `[baidu-ocr] webimage 识别失败 error_code=${code} error_msg=${payload.error_msg ?? "unknown"} 分类=${type}`,
  );
  throw new BaiduOcrError(getBaiduOcrErrorMessage(type), type, code >= 0 ? code : undefined);
}

/** 最小化图片尺寸探测：支持 PNG / JPEG / WebP，识别不了返回 null 并跳过边长校验（降级不拦截）。 */
export function getImageDimensions(buffer: Buffer): ImageDimensions | null {
  try {
    if (
      buffer.length >= 24 &&
      buffer.readUInt32BE(0) === 0x89504e47 &&
      buffer.readUInt32BE(4) === 0x0d0a1a0a
    ) {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
      return getJpegDimensions(buffer);
    }
    if (
      buffer.length >= 30 &&
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP"
    ) {
      return getWebpDimensions(buffer);
    }
  } catch {
    return null;
  }
  return null;
}

function getJpegDimensions(buffer: Buffer): ImageDimensions | null {
  let offset = 2;
  while (offset + 9 <= buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (marker === 0xda) {
      break;
    }
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);
      return width > 0 && height > 0 ? { width, height } : null;
    }
    if (segmentLength < 2) {
      break;
    }
    offset += 2 + segmentLength;
  }
  return null;
}

function getWebpDimensions(buffer: Buffer): ImageDimensions | null {
  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    if (buffer.length < 30) return null;
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }
  if (chunk === "VP8L") {
    if (buffer.length < 25) return null;
    const bits = buffer.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  if (chunk === "VP8 ") {
    if (buffer.length < 30) return null;
    if (buffer[23] !== 0x9d || buffer[24] !== 0x01 || buffer[25] !== 0x2a) return null;
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }
  return null;
}
