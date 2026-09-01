export function formatDateOnly(date: Date) {
  return date.toISOString().split("T")[0];
}

export function formatShanghaiDateOnly(date: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function getShanghaiYearMonth(date: Date = new Date()) {
  const dateOnly = formatShanghaiDateOnly(date);
  return {
    year: Number(dateOnly.slice(0, 4)),
    month: Number(dateOnly.slice(5, 7)),
  };
}

export function shiftDateOnly(date: Date, days: number) {
  // 以业务日（Asia/Shanghai）为基准做日历平移：先取当天的上海日期，
  // 再在 UTC 上做纯日历加减，避免用 toISOString()（UTC 切片）在 UTC+8 凌晨少一天。
  const reference = formatShanghaiDateOnly(date);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(reference);
  if (!match) return reference;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const value = new Date(Date.UTC(year, month - 1, day));
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function isUuidLike(value: string | null | undefined) {
  if (!value) return false;
  const val = value.trim();
  // Match UUIDs
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val)) return true;
  // Match MongoDB ObjectIds or hex hashes (e.g. 2513b448...)
  if (/^[0-9a-f]{20,}$/i.test(val)) return true;
  if (/^[0-9a-f]{8,}-[0-9a-f-]{4,}/i.test(val)) return true;
  return false;
}

export function getSafeAccountDisplayName(input: {
  rawName: string | null | undefined;
  userDisplayName: string;
  contentDirection: string | null | undefined;
  index: number;
  total: number;
  remark?: string | null | undefined;
}) {
  const remark = input.remark?.trim();
  if (remark) return remark;

  const rawName = input.rawName?.trim();
  const direction = input.contentDirection?.trim();
  const baseName = input.userDisplayName;
  
  const looksLikeCode = isUuidLike(rawName);
  
  if (rawName && !looksLikeCode) {
    if (!rawName.includes('抖音') && !rawName.includes('小红书') && !rawName.includes('视频号') && !rawName.includes('B站')) {
       // 如果本来就是正常的中文或英文名，但没带平台前缀，帮它加上
       if (rawName === baseName) {
         return `抖音-${rawName}`;
       }
       return rawName;
    }
    return rawName;
  }

  if (direction) return `抖音-${baseName}(${direction})`;
  if (input.total > 1) return `抖音-${baseName} ${input.index + 1}号`;
  return `抖音-${baseName}`;
}

export function uniqueNonEmpty(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}
