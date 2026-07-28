import type { NextRequest } from "next/server";

import { buildPersonResponse } from "../handlers";

export async function GET(request: NextRequest) {
  return buildPersonResponse(request);
}
