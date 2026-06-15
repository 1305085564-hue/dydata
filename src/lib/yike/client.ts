"use client";

import type {
  YikeAreaInput,
  YikeAreaUpdateInput,
  YikeCreateItemInput,
  YikeFocusCompleteInput,
  YikeFocusReplaceInput,
  YikeMemoSplitInput,
  YikePersonInput,
  YikeProjectInput,
  YikeProjectTaskInput,
  YikeProjectUpdateInput,
  YikeQuickCreateInput,
  YikeSetProjectNextTaskInput,
  YikeTransitionInput,
  YikeUpdateItemInput,
  YikeWorkbenchCard,
  YikeWorkbenchPayload,
} from "./types";

export type { YikeWorkbenchPayload };

async function parseError(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => ({}));
  throw new Error(body?.error?.message || `${fallback} (${res.status})`);
}

async function postJson<T>(url: string, payload: unknown, fallback: string): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseError(res, fallback);
  return res.json();
}

async function patchJson<T>(url: string, payload: unknown, fallback: string): Promise<T> {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseError(res, fallback);
  return res.json();
}

// ── 工作台 ──────────────────────────────────────────

export async function fetchYikeWorkbench(date?: string): Promise<YikeWorkbenchPayload> {
  const url = new URL("/api/yike/workbench", window.location.origin);
  if (date) url.searchParams.set("date", date);
  const res = await fetch(url.toString());
  if (!res.ok) await parseError(res, "读取工作台失败");
  return res.json();
}

// ── 事项 ──────────────────────────────────────────

export async function quickCreateYikeItem(
  input: YikeQuickCreateInput,
): Promise<{ item: YikeWorkbenchCard; workbench: YikeWorkbenchPayload }> {
  return postJson("/api/yike/items/quick", input, "创建失败");
}

export async function createYikeItem(
  input: Partial<YikeCreateItemInput> & { rawText?: string | null; title?: string },
): Promise<{ item: YikeWorkbenchCard; workbench: YikeWorkbenchPayload }> {
  return postJson("/api/yike/items", input, "创建事项失败");
}

export async function updateYikeItem(
  itemId: string,
  input: YikeUpdateItemInput,
): Promise<{ item: YikeWorkbenchCard; workbench: YikeWorkbenchPayload }> {
  return patchJson(`/api/yike/items/${itemId}`, input, "更新事项失败");
}

export async function deleteYikeItem(
  itemId: string,
): Promise<{ deleted: { id: string }; workbench: YikeWorkbenchPayload }> {
  const res = await fetch(`/api/yike/items/${itemId}`, { method: "DELETE" });
  if (!res.ok) await parseError(res, "删除事项失败");
  return res.json();
}

export async function transitionYikeItem(
  itemId: string,
  input: YikeTransitionInput,
): Promise<YikeWorkbenchCard> {
  return postJson(`/api/yike/items/${itemId}/transition`, input, "状态流转失败");
}

export async function convertYikeMemoToTask(
  itemId: string,
): Promise<{ item: YikeWorkbenchCard; workbench: YikeWorkbenchPayload }> {
  return postJson(`/api/yike/items/${itemId}/convert-to-task`, {}, "备忘转任务失败");
}

export async function splitYikeMemo(
  itemId: string,
  input: YikeMemoSplitInput,
): Promise<{ items: YikeWorkbenchCard[]; workbench: YikeWorkbenchPayload }> {
  return postJson(`/api/yike/items/${itemId}/split`, input, "拆分备忘失败");
}

// ── 执行槽 ──────────────────────────────────────────

export async function completeYikeFocus(input: YikeFocusCompleteInput): Promise<YikeWorkbenchPayload> {
  return postJson("/api/yike/focus/complete", input, "完成任务失败");
}

export async function replaceYikeFocusSlot(input: YikeFocusReplaceInput): Promise<YikeWorkbenchPayload> {
  return postJson("/api/yike/focus/replace", input, "替换执行槽失败");
}

// ── 领域 ──────────────────────────────────────────

export async function createYikeArea(input: YikeAreaInput) {
  return postJson("/api/yike/areas", input, "创建领域失败");
}

export async function updateYikeArea(areaId: string, input: YikeAreaUpdateInput) {
  return patchJson(`/api/yike/areas/${areaId}`, input, "更新领域失败");
}

export async function reorderYikeAreas(areas: Array<{ id: string; sortOrder: number }>) {
  return postJson("/api/yike/areas/reorder", { areas }, "领域排序失败");
}

// ── 项目 ──────────────────────────────────────────

export async function createYikeProject(input: YikeProjectInput) {
  return postJson("/api/yike/projects", input, "创建项目失败");
}

export async function updateYikeProject(projectId: string, input: YikeProjectUpdateInput) {
  return patchJson(`/api/yike/projects/${projectId}`, input, "更新项目失败");
}

export async function addYikeProjectTask(projectId: string, input: YikeProjectTaskInput) {
  return postJson(`/api/yike/projects/${projectId}/tasks`, input, "创建项目任务失败");
}

export async function setYikeProjectNextTask(projectId: string, input: YikeSetProjectNextTaskInput) {
  return postJson(`/api/yike/projects/${projectId}/next-task`, input, "设置项目下一步失败");
}

// ── 负责人 ──────────────────────────────────────────

export async function createYikePerson(input: YikePersonInput) {
  return postJson("/api/yike/people", input, "创建负责人失败");
}
