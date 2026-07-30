import {
  toBoolean,
  toPriority,
  toTrimmedString,
} from "@/app/api/admin/ai-channels/_shared";

export function buildAiKeyPatch(data: Record<string, unknown>, mode: "create" | "update") {
  const patch: Record<string, unknown> = {};
  if (mode === "create" || data.provider_id !== undefined) patch.provider_id = toTrimmedString(data.provider_id);
  if (mode === "create" || data.label !== undefined) patch.label = toTrimmedString(data.label);
  const apiKey = toTrimmedString(data.api_key);
  if (mode === "create" || apiKey) patch.api_key = apiKey;
  if (data.priority !== undefined) patch.priority = toPriority(data.priority, 100);
  if (data.is_enabled !== undefined) patch.is_enabled = toBoolean(data.is_enabled);
  if (mode === "create" && (!patch.provider_id || !patch.label || !patch.api_key)) {
    throw new Error("Key 缺少 provider_id/label/api_key");
  }
  return patch;
}
