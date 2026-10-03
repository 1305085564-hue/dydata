import type { TopicTimeRange } from "./types";

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isOneOf<T extends readonly string[]>(values: T, value: string): value is T[number] {
  return values.includes(value);
}

export function normalizePositiveInteger(value: string | null, fallback: number, max: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

export function normalizeText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

export function daysForTimeRange(range: TopicTimeRange) {
  if (range === "3d") return 3;
  if (range === "1w") return 7;
  if (range === "1m") return 30;
  if (range === "3m") return 90;
  if (range === "all") return null;
  return 90;
}

export function timeRangeStartIso(range: TopicTimeRange, now = Date.now()) {
  const days = daysForTimeRange(range);
  return days === null ? null : new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
}

export function tokenize(value: string) {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .split(/\s+/)
        .flatMap((part) => {
          if (!part) return [];
          if (/[\u4e00-\u9fff]/.test(part)) {
            const grams: string[] = [part];
            for (let index = 0; index < part.length - 1; index += 1) {
              grams.push(part.slice(index, index + 2));
            }
            return grams;
          }
          return [part];
        })
        .filter(Boolean),
    ),
  );
}
