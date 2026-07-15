import { NextResponse } from "next/server";

export function archivedFeatureResponse(message = "该功能已归档，不再接受新的写入") {
  return NextResponse.json(
    {
      error: {
        code: "ARCHIVED_FEATURE",
        message,
      },
    },
    { status: 410 },
  );
}

export function isArchivedWriteEnabled() {
  return true;
}
