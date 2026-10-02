import { NextResponse } from "next/server";

import {
  UUID_PATTERN,
  isRecord,
  readJsonBody,
  requireCompanyOwnerActor,
} from "@/app/api/production/_shared";
import {
  clearPermanentExemptionAtomically,
  setPermanentExemptionAtomically,
} from "@/lib/exemption-review";
import { EXEMPTION_REASON_MAX_LENGTH, validateTextBoundary } from "@/lib/input-boundaries";

type PermanentDeps = {
  requireCompanyOwnerActor: typeof requireCompanyOwnerActor;
  setPermanentExemptionAtomically: typeof setPermanentExemptionAtomically;
  clearPermanentExemptionAtomically: typeof clearPermanentExemptionAtomically;
};

const defaultDeps: PermanentDeps = {
  requireCompanyOwnerActor,
  setPermanentExemptionAtomically,
  clearPermanentExemptionAtomically,
};

function parseUserId(input: unknown): { userId: string } | { response: NextResponse } {
  if (!isRecord(input)) {
    return { response: NextResponse.json({ error: "请求体必须是对象" }, { status: 400 }) };
  }
  const userId = typeof input.user_id === "string" ? input.user_id.trim() : "";
  if (!UUID_PATTERN.test(userId)) {
    return { response: NextResponse.json({ error: "user_id 必须是 uuid" }, { status: 400 }) };
  }
  return { userId };
}

function parseSetPayload(input: unknown): { data: { userId: string; reason: string } } | { response: NextResponse } {
  const user = parseUserId(input);
  if ("response" in user) return user;
  const reasonResult = validateTextBoundary({
    label: "豁免理由",
    value: isRecord(input) ? input.reason : null,
    maxLength: EXEMPTION_REASON_MAX_LENGTH,
  });
  if (!reasonResult.ok || !reasonResult.data) {
    return {
      response: NextResponse.json(
        { error: reasonResult.ok ? "永久豁免必须填写原因" : reasonResult.error },
        { status: 400 },
      ),
    };
  }
  return { data: { userId: user.userId, reason: reasonResult.data } };
}

export async function buildPermanentExemptionResponse(
  input: unknown,
  deps: Pick<PermanentDeps, "requireCompanyOwnerActor" | "setPermanentExemptionAtomically"> = defaultDeps,
) {
  const payload = parseSetPayload(input);
  if ("response" in payload) return payload.response;

  const auth = await deps.requireCompanyOwnerActor();
  if ("response" in auth) {
    return auth.response ?? NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const result = await deps.setPermanentExemptionAtomically({
    supabase: auth.supabase,
    userId: payload.data.userId,
    reason: payload.data.reason,
    groupModeTokenHash: auth.actor.groupModeTokenHash,
  });
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
  return NextResponse.json({ data: result.data });
}

export async function buildClearPermanentExemptionResponse(
  input: unknown,
  deps: Pick<PermanentDeps, "requireCompanyOwnerActor" | "clearPermanentExemptionAtomically"> = defaultDeps,
) {
  const payload = parseUserId(input);
  if ("response" in payload) return payload.response;

  const auth = await deps.requireCompanyOwnerActor();
  if ("response" in auth) {
    return auth.response ?? NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const result = await deps.clearPermanentExemptionAtomically({
    supabase: auth.supabase,
    userId: payload.userId,
    groupModeTokenHash: auth.actor.groupModeTokenHash,
  });
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
  return NextResponse.json({ data: result.data });
}

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if ("response" in body) return body.response;
  return buildPermanentExemptionResponse(body.data);
}

export async function DELETE(request: Request) {
  const body = await readJsonBody(request);
  if ("response" in body) return body.response;
  return buildClearPermanentExemptionResponse(body.data);
}
