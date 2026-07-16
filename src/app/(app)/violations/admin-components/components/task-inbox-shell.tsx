"use client";

import { useState } from "react";
import type { InboxBucketEntry, InboxCounts, InboxData } from "../data";
import { TaskInbox } from "./task-inbox-v2";
import { ProcessedList } from "./processed-list";

interface TaskInboxShellProps {
  inbox: InboxData;
  counts: InboxCounts;
  processed: InboxBucketEntry[];
  /** 后端 RPC 未上线时显示「即将上线」 */
  processedPending?: boolean;
  isOwner?: boolean;
}

export function TaskInboxShell({
  inbox,
  counts,
  processed,
  processedPending = false,
  isOwner = false,
}: TaskInboxShellProps) {
  const processedCount = processedPending ? null : processed.length;
  const [detailCaseId, setDetailCaseId] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* 左侧主舞台：高风险待确认 + 日常待审核 (占 2/3) */}
      <div className="space-y-6 lg:col-span-2">
        <TaskInbox
          inbox={inbox}
          counts={counts}
          isOwner={isOwner}
          viewType="main"
          detailCaseId={detailCaseId}
          onOpenDetail={setDetailCaseId}
        />
      </div>

      {/* 右侧辅助侧栏：缺数据催办 + 近期已处理记录 (占 1/3) */}
      <div className="space-y-6">
        <TaskInbox
          inbox={inbox}
          counts={counts}
          isOwner={isOwner}
          viewType="sidebar"
          detailCaseId={detailCaseId}
          onOpenDetail={setDetailCaseId}
        />

        {/* 已处理记录卡片 */}
        <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
          <div className="border-b border-stone-100 px-5 py-4">
            <h2 className="text-[15px] font-medium text-stone-900 flex items-center gap-2">
              <span>已处理记录</span>
              {processedCount !== null ? (
                <span className="inline-flex h-5 items-center rounded-md bg-stone-100 px-1.5 text-[12px] tabular-nums font-medium text-stone-600">
                  {processedCount}
                </span>
              ) : null}
            </h2>
            <p className="text-[12px] text-stone-500 mt-0.5">近 30 天审批记录</p>
          </div>
          <div className="px-4 py-3 sm:px-5">
            <ProcessedList
              items={processed}
              pendingBackend={processedPending}
              onOpenDetail={setDetailCaseId}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
