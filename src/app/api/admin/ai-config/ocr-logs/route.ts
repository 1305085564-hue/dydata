import { buildOcrLogsResponse } from "./route-core";

export async function GET(request: Request) {
  return buildOcrLogsResponse(request);
}
