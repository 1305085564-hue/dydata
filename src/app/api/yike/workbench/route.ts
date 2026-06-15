import type { NextRequest } from "next/server";

import { loadYikeWorkbench } from "@/lib/yike/read-model";
import { rolloverYikeItems } from "@/lib/yike/service";

import { jsonBadRequest, jsonInternalError, parseYikeDate, requireYikeActor } from "../_shared";

export async function GET(request: NextRequest) {
  const auth = await requireYikeActor();
  if (!auth.ok) return auth.response;

  const today = parseYikeDate(request);
  if (!today) return jsonBadRequest("date 必须是 YYYY-MM-DD");

  try {
    // 懒触发时间桶顺延：打开行动台时把当前用户昨日的明天/计划顺延到今天。
    // 只对需要顺延的事项做 UPDATE，无需 cron，自动按 RLS 隔离到本人。
    await rolloverYikeItems(auth.actor, today).catch(() => undefined);
    return Response.json(await loadYikeWorkbench(auth.actor, { today }));
  } catch (error) {
    return jsonInternalError(error, "读取此刻工作台失败");
  }
}
