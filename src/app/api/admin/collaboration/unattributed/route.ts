import type { NextRequest } from "next/server";
import { buildUnattributedResponse } from "../handlers";

export async function GET(request: NextRequest) {
  return buildUnattributedResponse(request);
}
