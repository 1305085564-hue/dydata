import type { NextRequest } from "next/server";

import { buildSummaryResponse } from "../handlers";

export async function GET(request: NextRequest) {
  return buildSummaryResponse(request);
}
