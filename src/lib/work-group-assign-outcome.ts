export type WorkGroupAssignEntry = "writer_peer" | "operator";

export type WorkGroupAssignActionResult =
  | { ok: true; value: { replacedGroupName: string | null } }
  | { ok: false; message: string };

export type WorkGroupAssignOutcome =
  | { kind: "success"; replacedGroupName: string | null }
  | { kind: "error"; title: string; description: string };

const FAILURE_TITLES: Record<WorkGroupAssignEntry, string> = {
  writer_peer: "分配小队失败",
  operator: "分配运营小队失败",
};

/**
 * 单人换组的统一结果解析：成功时把服务端返回的原小队名透传给调用方（用于「已从 A 移入 B」提示），
 * 失败时按入口给出标题与原因。两个单人入口（工种小队 / 运营小队）共用这一条判定。
 */
export function resolveWorkGroupAssignOutcome(
  entry: WorkGroupAssignEntry,
  result: WorkGroupAssignActionResult,
): WorkGroupAssignOutcome {
  if (!result.ok) {
    return { kind: "error", title: FAILURE_TITLES[entry], description: result.message };
  }
  return { kind: "success", replacedGroupName: result.value.replacedGroupName };
}
