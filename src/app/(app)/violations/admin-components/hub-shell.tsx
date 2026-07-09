"use client";

import Link from "next/link";
import { FilePlus2, TrendingUp } from "lucide-react";

import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";

import type { InboxBucketEntry, InboxCounts, InboxData } from "./data";
import { TaskInboxShell } from "./components/task-inbox-shell";

/* ─── types (exported for data.ts) ─── */

export type HubTabKey = "inbox" | "scripts" | "violations" | "weekly" | "analytics" | "advice";

export interface HubShellProps {
  weekStart: string;
  inbox: InboxData;
  inboxCounts: InboxCounts;
  processed?: InboxBucketEntry[];
  /** 后端 RPC 未上线时显示「即将上线」 */
  processedPending?: boolean;
  basePath?: string;
  layoutVariant?: "page" | "embedded";
  eyebrow?: string;
  title?: string;
  description?: string;
  /** 是否 Owner — 透传给详情 Dialog 内嵌的审批面板 */
  isOwner?: boolean;
}

/* ─── shell ─── */

export function ConversionHubShell(props: HubShellProps) {
  const {
    inbox,
    inboxCounts,
    processed = [],
    processedPending = false,
    layoutVariant = "page",
    isOwner = false,
  } = props;

  const content = (
    <TaskInboxShell
      inbox={inbox}
      counts={inboxCounts}
      processed={processed}
      processedPending={processedPending}
      isOwner={isOwner}
    />
  );

  if (layoutVariant === "embedded") {
    return content;
  }

  return (
    <AdminWorkspaceLayout
      eyebrow={props.eyebrow ?? "导粉中心"}
      title={props.title ?? "管理工作台"}
      description={
        props.description ??
        "审核员工提交，把有价值的话术沉淀进知识库；高风险先处理，再补缺数据，已处理记录可在右侧查看。"
      }
      indexItems={[]}
      actions={
        <div className="flex flex-wrap gap-2">
          <Link
            href="/violations"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 text-[12px] font-medium text-stone-600 transition-colors hover:border-stone-300 hover:text-stone-800 active:translate-y-0"
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
