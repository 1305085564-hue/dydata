import { NextResponse } from "next/server";
import { buildWriterCertificationResponse } from "./route-core";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }
  return buildWriterCertificationResponse(body);
}
