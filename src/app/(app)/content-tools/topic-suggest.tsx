"use client";

import type { ContentToolAccount } from "./types";

type TopicSuggestProps = {
  accounts: ContentToolAccount[];
};

export function TopicSuggest({ accounts }: TopicSuggestProps) {
  return (
    <div className="rounded-3xl border border-dashed border-border/70 bg-muted/20 p-6 text-sm text-muted-foreground">
      选题建议组件待接入，当前可用账号数：{accounts.length}
    </div>
  );
}
