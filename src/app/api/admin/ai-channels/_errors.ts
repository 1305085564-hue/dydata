import { NextResponse } from "next/server";

export function aiChannelDatabaseFailure(message: string, error: unknown, status = 500) {
  console.error(`[ai-channels] ${message}`, error);
  return NextResponse.json({ error: message }, { status });
}

export function isMissingRowError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "PGRST116");
}
