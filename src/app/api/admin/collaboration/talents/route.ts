import type { NextRequest } from "next/server";

import { buildTalentsResponse } from "../handlers";

export async function GET(request: NextRequest) {
  return buildTalentsResponse(request);
}
