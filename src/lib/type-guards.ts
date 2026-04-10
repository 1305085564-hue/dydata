export function toTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function toBoolean(value: unknown, defaultValue = false) {
  if (typeof value === "boolean") return value;
  return defaultValue;
}

export function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}
