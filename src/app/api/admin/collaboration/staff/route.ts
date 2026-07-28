import type { NextRequest } from "next/server";

import { buildStaffResponse } from "../handlers";

export async function GET(request: NextRequest) {
  return buildStaffResponse(request);
}
