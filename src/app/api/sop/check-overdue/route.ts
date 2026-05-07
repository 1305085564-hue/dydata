import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, dateSchema, parseJsonError, readDateParam } from "@/app/api/sop/_shared";
import { isCronAuthorized } from "@/lib/cron-auth";
import { checkAndMarkOverdue } from "@/lib/sop/service";

export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = z.object({ statusDate: dateSchema }).safeParse({
    statusDate: readDateParam(searchParams),
  });

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parseJsonError(parsed.error) }, { status: 422 });
  }

  try {
    const result = await checkAndMarkOverdue(parsed.data.statusDate);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return apiError(error);
  }
}
