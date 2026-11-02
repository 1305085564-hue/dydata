import { NextRequest, NextResponse } from "next/server";

import { cloudBaseGatewayUrl, hasCloudBaseSessionChanged } from "@/lib/cloudbase/core";
import { clearCloudBaseCookies, getCloudBaseCookieSession, rejectUntrustedCloudBaseWrite, requireVerifiedCloudBaseSession, setCloudBaseCookie } from "@/app/api/cloudbase/_shared";

type RouteContext = { params: Promise<{ segments: string[] }> };

async function forward(request: NextRequest, context: RouteContext) {
  const rejected = rejectUntrustedCloudBaseWrite(request);
  if (rejected) return rejected;
  const { segments } = await context.params;
  if (!segments.length || segments.length > 2 || segments.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) {
    return NextResponse.json({ message: "Invalid data path" }, { status: 400 });
  }
  const verified = await requireVerifiedCloudBaseSession(request);
  if (!verified.result) {
    const response = NextResponse.json({ message: verified.error === "unavailable" ? "Authentication unavailable" : "Authentication required" }, {
      status: verified.error === "unavailable" ? 503 : 401,
      headers: { "Cache-Control": "no-store" },
    });
    if (verified.error !== "unavailable") clearCloudBaseCookies(response);
    return response;
  }

  const upstreamUrl = `${cloudBaseGatewayUrl(`/v1/rdb/rest/${segments.join("/")}`)}${request.nextUrl.search}`;
  const headers = new Headers();
  for (const name of ["accept", "content-type", "prefer", "range", "if-match", "if-none-match", "accept-profile", "content-profile"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("authorization", `Bearer ${verified.result.session.accessToken}`);
  const method = request.method.toUpperCase();
  const init = {
    method,
    headers,
    ...(method === "GET" || method === "HEAD" ? {} : { body: request.body, duplex: "half" as const }),
    cache: "no-store" as const,
    signal: AbortSignal.timeout(20_000),
  };
  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, init as RequestInit);
  } catch {
    return NextResponse.json({ message: "Data service unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const responseHeaders = new Headers();
  for (const name of ["content-type", "content-range", "accept-ranges", "preference-applied", "etag", "location"]) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  responseHeaders.set("Cache-Control", "no-store");
  const response = new NextResponse(upstream.body, { status: upstream.status, headers: responseHeaders });
  const previousSession = getCloudBaseCookieSession(request);
  if (previousSession && hasCloudBaseSessionChanged(previousSession, verified.result.session)) {
    setCloudBaseCookie(response, request, verified.result.session);
  }
  return response;
}

export const GET = forward;
export const HEAD = forward;
export const POST = forward;
export const PATCH = forward;
export const DELETE = forward;
export const OPTIONS = forward;
