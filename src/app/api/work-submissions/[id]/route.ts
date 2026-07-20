import { NextRequest, NextResponse } from "next/server";


export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  void _request;
  void context;
  return NextResponse.json({ error: "历史产量凭证不可删除" }, { status: 403 });
}
