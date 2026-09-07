import type { NextRequest } from "next/server";
import { buildWorkVideoResponse } from "./route-core";

export async function GET(request: NextRequest) {
  return buildWorkVideoResponse(request);
}
