import { NextRequest, NextResponse } from "next/server";
import { requireSystemActor, toTrimmedString } from "../../ai-channels/_shared";
import { checkKeyDependencies } from "@/lib/ai-config/key-dependencies";
import { observeMutation } from "@/lib/observed-mutation";

export async function POST(req: NextRequest) {
  return observeMutation("/api/admin/ai-config/check-dependencies", async (observation) => {
    observation.mark("validate");
    observation.setDetail?.({
      businessSucceeded: false,
      auditStatus: "skipped",
      employeeNotificationStatus: "skipped",
      todoStatus: "skipped",
      compensationRequired: false,
      events: [],
    });

    const auth = await requireSystemActor();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const supabase = auth.supabase;

    const body = await req.json().catch(() => ({}));
    const keyId = toTrimmedString(body.keyId);

    if (!keyId) {
      return NextResponse.json({ error: "缺少 keyId" }, { status: 400 });
    }

    try {
      const result = await checkKeyDependencies(supabase, keyId);
      const response = NextResponse.json(result);
      observation.setDetail?.({ businessSucceeded: response.ok });
      if (response.ok) observation.mark("finalize");
      return response;
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "检查依赖失败" },
        { status: 500 }
      );
    }
  });
}
