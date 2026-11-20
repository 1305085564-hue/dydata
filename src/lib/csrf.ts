/**
 * 写请求来源校验 —— 全站唯一实现（中间件、接口层、路由内手写校验都必须调这里）。
 *
 * 为什么不能信请求自身的主机字段（2026-11-14 迁移验证实测）：
 * - 腾讯云托管网关会改写 Host / X-Forwarded-Host，两者都是请求方可控的头；
 * - Next 独立产物用 process.env.HOSTNAME 拼 request.url，容器里恒为
 *   http://0.0.0.0:3000，即使把 Host 与 X-Forwarded-Host 都设成公网域名也不变。
 * 因此唯一可信来源是部署时显式配置的站点地址，且必须整串比对（协议+主机+端口）。
 *
 * Edge 兼容：只用 URL / Set / process.env，不引 node: 内置模块。
 */

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** 外部服务（飞书事件回调）不带浏览器 Origin，单独豁免。 */
const CSRF_EXEMPT_PATHS = new Set(["/api/feishu/event"]);

/** 归一化为 `协议://主机[:端口]`；非法值返回 null。 */
export function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    // URL.origin 会小写主机、去掉默认端口与路径，正好是整串比对所需的形式
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * 站点地址的唯一读取点。未配置时返回 null，调用方须按「不可信」处理。
 *
 * 必须逐个静态写出 process.env.X：Next 只对静态成员访问做构建期内联，
 * 写成 process.env[key] 的话，NEXT_PUBLIC_* 在容器运行时读不到（构建产物里只有字面量），
 * 会导致 getSiteOrigin() 恒为 null、所有带 Origin 的写请求 403。
 */
export function getSiteOrigin(): string | null {
  const candidates: Array<string | undefined> = [
    process.env.SITE_ORIGIN,
    process.env.NEXT_PUBLIC_SITE_ORIGIN,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.APP_URL,
  ];
  for (const value of candidates) {
    const normalized = normalizeOrigin(value);
    if (normalized) return normalized;
  }
  return null;
}

export function isWriteMethod(method: string): boolean {
  return WRITE_METHODS.has(method.toUpperCase());
}

export function isCsrfExemptPath(pathname: string): boolean {
  return CSRF_EXEMPT_PATHS.has(pathname);
}

/**
 * 判断写请求来源是否可信。
 * - 非写方法、豁免路径：直接可信；
 * - Sec-Fetch-Site 只作拒绝信号（cross-site 必拒），same-origin 不足以单独放行；
 * - Origin 必须与配置站点地址完整一致（协议、主机、端口全比）；
 * - 无 Origin：放行，见下方注释。
 */
export function isTrustedWrite(request: Request): boolean {
  if (!isWriteMethod(request.method)) return true;

  let pathname: string;
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    return false;
  }
  if (isCsrfExemptPath(pathname)) return true;

  if (request.headers.get("sec-fetch-site")?.toLowerCase() === "cross-site") return false;

  const origin = request.headers.get("origin");

  // 无 Origin 的请求维持放行。这条只防浏览器冒充：浏览器发起跨站写请求一定会带
  // Origin，不带 Origin 的写请求来自服务端（定时任务、飞书回调、运维脚本），
  // 不存在被第三方页面借用用户 Cookie 的路径。
  if (origin === null) return true;

  const siteOrigin = getSiteOrigin();
  // 未配置站点地址时一律拒绝（fail closed），避免漏配变量导致校验静默失效。
  if (!siteOrigin) return false;

  return normalizeOrigin(origin) === siteOrigin;
}
