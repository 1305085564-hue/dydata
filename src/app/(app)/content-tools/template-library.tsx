"use client";

import type { ContentToolAccount } from "./types";

type TemplateLibraryProps = {
  accounts: ContentToolAccount[];
};

export function TemplateLibrary({ accounts }: TemplateLibraryProps) {
  return (
    <div className="rounded-3xl border border-dashed border-border/70 bg-muted/20 p-6 text-sm text-muted-foreground">
      模板库组件待接入，当前可用账号数：{accounts.length}
    </div>
  );
}
