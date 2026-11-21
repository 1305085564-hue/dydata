import { errorCodeForStatus, toStringErrorResponse } from "@/lib/errors";

export function videoSubmitErrorResponse(
  request: Request,
  requestId: string | undefined,
  operation: string,
  error: unknown,
  status = 500,
  message?: string,
) {
  return toStringErrorResponse({
    code: errorCodeForStatus(status), route: "/api/video-submit", operation,
    request, requestId, status, message: status >= 500 ? undefined : message, error,
  });
}
