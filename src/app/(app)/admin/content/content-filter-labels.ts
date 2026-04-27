type NamedOption = { id: string; name: string };

type ContentFilterLabelInput =
  | { type: "profile" | "account"; value: string; options: NamedOption[] }
  | { type: "status" | "hasSnapshot" | "reviewed" | "rankScope"; value: string; options?: NamedOption[] };

const FALLBACK_LABELS = {
  profile: "全部人员",
  account: "全部账号",
  status: "全部状态",
  hasSnapshot: "全部快照",
  reviewed: "全部",
  rankScope: "全部播放排名",
} as const;

const STATIC_LABELS = {
  hasSnapshot: {
    yes: "已有24h快照",
    no: "暂无快照",
  },
  reviewed: {
    yes: "已复盘",
    no: "未复盘",
  },
  rankScope: {
    all: "全部播放排名",
    day: "日播放排名",
    month: "月播放排名",
  },
} as const;

export function getContentFilterLabel(input: ContentFilterLabelInput) {
  if (input.value === "all") {
    return FALLBACK_LABELS[input.type];
  }

  if (input.type === "profile" || input.type === "account") {
    return input.options.find((option) => option.id === input.value)?.name ?? FALLBACK_LABELS[input.type];
  }

  if (input.type === "status") {
    return input.value || FALLBACK_LABELS.status;
  }

  if (input.type === "rankScope") {
    return STATIC_LABELS.rankScope[input.value as "all" | "day" | "month"] ?? FALLBACK_LABELS.rankScope;
  }

  return STATIC_LABELS[input.type][input.value as "yes" | "no"] ?? FALLBACK_LABELS[input.type];
}
