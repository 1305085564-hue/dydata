import { NextResponse } from "next/server";

import { getTeamOptions } from "@/lib/teams";

export const dynamic = "force-dynamic";

const TEAM_LOAD_TIMEOUT_MS = 8000;

async function loadTeamsWithTimeout() {
  return Promise.race([
    getTeamOptions(),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("team list timeout")), TEAM_LOAD_TIMEOUT_MS);
    }),
  ]);
}

export async function GET() {
  try {
    const teams = await loadTeamsWithTimeout();
    return NextResponse.json({ teams });
  } catch {
    return NextResponse.json({ teams: [] }, { status: 503 });
  }
}
