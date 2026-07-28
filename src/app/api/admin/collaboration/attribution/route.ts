import { buildAttributionResponse } from "../handlers";

export async function PATCH(request: Request) {
  return buildAttributionResponse(request);
}
