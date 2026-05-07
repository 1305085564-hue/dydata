import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, dateSchema, parseJsonError, readDateParam, readGroupParam, uuidSchema } from "@/app/api/sop/_shared";
import { loadLeaderBoard } from "@/lib/sop/service";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const parsed = z.object({
    statusDate: dateSchema,
    groupId: uuidSchema.optional(),
  }).safeParse({
    statusDate: readDateParam(searchParams),
    groupId: readGroupParam(searchParams),
  });

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parseJsonError(parsed.error) }, { status: 422 });
  }

  try {
    const board = await loadLeaderBoard(parsed.data);
    return NextResponse.json({ ok: true, ...board });
  } catch (error) {
    return apiError(error);
  }
}
