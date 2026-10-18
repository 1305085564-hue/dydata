import { createHash, createHmac } from "node:crypto";

export interface CosCredentials {
  secretId: string;
  secretKey: string;
}

export interface CosRequestParts {
  method: string;
  pathname: string;
  params?: Record<string, string>;
  headers?: Record<string, string>;
  expiresIn?: number;
  now?: number;
}

function sha1Hex(value: string) {
  return createHash("sha1").update(value, "utf8").digest("hex");
}

function hmacSha1Hex(key: string, value: string) {
  return createHmac("sha1", key).update(value, "utf8").digest("hex");
}

function encodeComponent(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function sortedEntries(record: Record<string, string>) {
  return Object.entries(record)
    .map(([key, value]) => [key.toLowerCase(), value] as const)
    .sort(([a], [b]) => a.localeCompare(b));
}

function canonicalParams(record: Record<string, string>) {
  return sortedEntries(record).map(([key, value]) => `${encodeComponent(key)}=${encodeComponent(value ?? "")}`).join("&");
}

function canonicalHeaders(record: Record<string, string>) {
  return sortedEntries(record).map(([key, value]) => `${key}=${encodeComponent(value ?? "")}`).join("&");
}

export function buildCosAuthorization(credentials: CosCredentials, request: CosRequestParts) {
  const method = request.method.toLowerCase();
  const pathname = request.pathname.startsWith("/") ? request.pathname : `/${request.pathname}`;
  const params = request.params ?? {};
  const headers = request.headers ?? {};
  const now = request.now ?? Math.floor(Date.now() / 1000);
  const keyTime = `${now - 60};${now + (request.expiresIn ?? 300)}`;
  const signKey = hmacSha1Hex(credentials.secretKey, keyTime);
  const httpString = `${method}\n${pathname}\n${canonicalParams(params)}\n${canonicalHeaders(headers)}\n`;
  const stringToSign = `sha1\n${keyTime}\n${sha1Hex(httpString)}\n`;
  const signature = hmacSha1Hex(signKey, stringToSign);
  return [
    "q-sign-algorithm=sha1",
    `q-ak=${credentials.secretId}`,
    `q-sign-time=${keyTime}`,
    `q-key-time=${keyTime}`,
    `q-header-list=${sortedEntries(headers).map(([key]) => key).join(";")}`,
    `q-url-param-list=${sortedEntries(params).map(([key]) => key).join(";")}`,
    `q-signature=${signature}`,
  ].join("&");
}

export function buildCosPathname(objectKey: string) {
  return `/${objectKey.replace(/^\/+/, "").split("/").map(encodeComponent).join("/")}`;
}

export const __signInternal = { sha1Hex, hmacSha1Hex, canonicalParams, canonicalHeaders };
