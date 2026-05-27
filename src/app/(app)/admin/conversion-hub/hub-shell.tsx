"use client";

import Link from "next/link";
import { FilePlus2, TrendingUp } from "lucide-react";

import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";

import type { InboxCounts, InboxData, ScriptsTabData } from "./data";
import { CommandBar } from "./components/command-bar";
import { ScriptsPanel } from "./components/scripts-panel";
import { TaskInbox } from "./components/task-inbox-v2";

/* ─── types (exported for data.ts) ─── */

export type HubTabKey = "inbox" | "scripts" | "violations" | "weekly" | "analytics" | "advice";

export interface HubShellProps {
  weekStart: string;
  inbox: InboxData;
  inboxCounts: InboxCounts;
  scripts: ScriptsTabData | null;
  basePath?: string;
  layoutVariant?: "page" | "embedded";
  eyebrow?: string;
  title?: string;
  description?: string;
}

/* ─── embedded layout (used inside /violations page) ─── */

function EmbeddedShell({
  inbox,
  inboxCounts,
  scripts,
}: {
  inbox: InboxData;
  inboxCounts: InboxCounts;
  scripts: ScriptsTabData | null;
}) {
  return (
    <div className="space-y-5">
      <CommandBar counts={inboxCounts} />
      <TaskInbox inbox={inbox} counts={inboxCounts} />
      {scripts ? <ScriptsPanel scripts={scripts} /> : null}
    </div>
  );
}

/* ─── page layout (full admin workspace) ─── */

function PageShell({
  inbox,
  inboxCounts,
  scripts,
}: {
  inbox: InboxData;
  inboxCounts: InboxCounts;
  scripts: ScriptsTabData | null;
}) {
  return (
    <div className="space-y-5">
      <CommandBar counts={inboxCounts} />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_360px]">
        <TaskInbox inbox={inbox} counts={inboxCounts} />
        {scripts ? <ScriptsPanel scripts={scripts} /> : null}
      </div>
    </div>
  );
}

/* ─── shell ─── */

export function ConversionHubShell(props: HubShellProps) {
  const { inbox, inboxCounts, scripts } = props;
  const layoutVariant = props.layoutVariant ?? "page";

  const content =
    layoutVariant === "embedded" ? (
      <EmbeddedShell inbox={inbox} inboxCounts={inboxCounts} scripts={scripts} />
    ) : (
      <PageShell inbox={inbox} inboxCounts={inboxCounts} scripts={scripts} />
    );

  if (layoutVariant === "embedded") {
    return content;
  }

  return (
    <AdminWorkspaceLayout
      eyebrow={props.eyebrow ?? "话术案例库"}
      title={props.title ?? "管理工作台"}
      description={
        props.description ??
        "审核员工提交，把有价值的话术沉淀进知识库；高风险先处理，再补缺数据，最后看推广候选。"
      }
      indexItems={[]}
      actions={
        <div className="flex flex-wrap gap-2">
          <Link
            href="/violations"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-[12px] font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-800 active:translate-y-0"
          >
            <TrendingUp className="size-3.5 stroke-[1.5]" />
            员工视角
          </Link>
          <Link
            href="/violations/submit"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#D97757] px-3 text-[12px] font-medium text-white transition-colors hover:bg-[#C96442] active:translate-y-0"
          >
            <FilePlus2 className="size-3.5 stroke-[1.5]" />
            替员工提交
          </Link>
        </div>
      }
    >
      {content}
    </AdminWorkspaceLayout>
  );
}
