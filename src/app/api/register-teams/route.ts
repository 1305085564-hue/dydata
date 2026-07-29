import { NextResponse } from "next/server";

import { getTeamOptions } from "@/lib/teams";

export const dynamic = "force-dynamic";

const TEAM_LOAD_TIMEOUT_MS = 8000;

async function loadTeamsWithTimeout(deps: { getTeamOptions: typeof getTeamOptions }) {
  return Promise.race([
    deps.getTeamOptions(),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("team list timeout")), TEAM_LOAD_TIMEOUT_MS);
    }),
  ]);
}

export async function buildRegisterTeamsResponse(
  deps: { getTeamOptions: typeof getTeamOptions } = { getTeamOptions },
) {
  try {
    const teams = await loadTeamsWithTimeout(deps);
    return NextResponse.json({ teams });
  } catch {
    return NextResponse.json({ teams: [] }, { status: 503 });
  }
}

export async function GET() {
  return buildRegisterTeamsResponse();
}
