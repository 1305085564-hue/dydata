import { NextRequest, NextResponse } from "next/server";

import {
  createRewriteConversation,
  listUserConversations,
  requireRewriteActor,
  resolveRewriteSelections,
} from "@/lib/rewrite/shared";

import {
  parseJsonBody,
  toApiErrorResponse,
  toNullableString,
  toPositiveInt,
} from "../_shared";

type CreateConversationBody = {
  title?: string;
  autoModeEnabled?: boolean;
  fixedModeId?: string | null;
  fixedModeKey?: string | null;
  modelViewId?: string | null;
  modelViewKey?: string | null;
  modeId?: string | null;
  modeKey?: string | null;
  lengthPresetId?: string | null;
  lengthPresetKey?: string | null;
};

export async function GET(request: NextRequest) {
  const auth = await requireRewriteActor();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const limit = toPositiveInt(searchParams.get("limit"), 30, 100);
    const conversations = await listUserConversations(auth.serviceClient, {
      userId: auth.actor.userId,
      limit,
    });

    return NextResponse.json({ conversations });
  } catch (error) {
    return toApiErrorResponse(error, "会话列表加载失败");
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRewriteActor();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await parseJsonBody<CreateConversationBody>(request);
    const { selections } = await resolveRewriteSelections(auth.serviceClient, {
      autoModeEnabled: body.autoModeEnabled,
      fixedModeId: body.fixedModeId,
      fixedModeKey: body.fixedModeKey,
      modelViewId: body.modelViewId,
      modelViewKey: body.modelViewKey,
      modeId: body.modeId,
      modeKey: body.modeKey,
      lengthPresetId: body.lengthPresetId,
      lengthPresetKey: body.lengthPresetKey,
    });

    const conversation = await createRewriteConversation(auth.serviceClient, {
      userId: auth.actor.userId,
      title: toNullableString(body.title),
      autoModeEnabled: selections.autoModeEnabled,
      fixedModeId: selections.fixedMode?.id ?? null,
      modelViewId: selections.modelView.id,
      modeId: selections.mode?.id ?? null,
      lengthPresetId: selections.lengthPreset.id,
    });

    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, "创建会话失败");
  }
}
