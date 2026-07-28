import type { NextRequest } from "next/server";

import { buildOperatorsResponse } from "../handlers";

export async function GET(request: NextRequest) {
  return buildOperatorsResponse(request);
}
