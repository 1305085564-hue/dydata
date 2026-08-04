import { buildAdminModuleMemberEmailsResponse } from "./response";

export async function GET() {
  return buildAdminModuleMemberEmailsResponse();
}
