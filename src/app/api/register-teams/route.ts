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
    return NextResponse.json(
      { teams },
      {
        headers: {
          // This endpoint only contains the public team picker used before login.
          // Keep the browser cache short and let the CDN reuse it a little longer.
          "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
          "CDN-Cache-Control": "public, max-age=300, stale-while-revalidate=600",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { teams: [] },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}

export async function GET() {
  return buildRegisterTeamsResponse();
}
