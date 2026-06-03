"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { FulfillmentCalendarData, FulfillmentMemberSummary } from "@/types/fulfillment";
import { StatsBar } from "./components/stats-bar";
import { ExceptionQueue } from "./components/exception-queue";
import { MonthlyMatrix } from "./components/monthly-matrix";
import { MemberDrawer } from "./components/member-drawer";

type Source = "queue" | "matrix";

interface FulfillmentWorkbenchProps {
  data: FulfillmentCalendarData;
}

function formatTodayDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

export function FulfillmentWorkbench({ data }: FulfillmentWorkbenchProps) {
  const router = useRouter();
  const today = formatTodayDateOnly();

  const [selectedMember, setSelectedMember] = useState<FulfillmentMemberSummary | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [source, setSource] = useState<Source>("matrix");

  const queueRef = useRef<FulfillmentMemberSummary[]>([]);
  const queueIndexRef = useRef<number>(-1);

  const handleQueueMemberClick = useCallback((member: FulfillmentMemberSummary, index: number) => {
    queueRef.current = data.todayExceptions;
    queueIndexRef.current = index;
    setSelectedMember(member);
    setSelectedDate(today);
    setSource("queue");
    setSheetOpen(true);
  }, [data.todayExceptions, today]);

  const handleMatrixCellClick = useCallback((member: FulfillmentMemberSummary, date: string) => {
    setSelectedMember(member);
    setSelectedDate(date);
    setSource("matrix");
    setSheetOpen(true);
  }, []);

  const handleMonthChange = useCallback((year: number, month: number) => {
    router.push(`/admin/fulfillment?year=${year}&month=${month}`);
  }, [router]);

  const handleActionComplete = useCallback(() => {
    router.refresh();

    if (source === "queue") {
      const queue = queueRef.current;
      const nextIndex = queueIndexRef.current + 1;
      const nextMember = queue[nextIndex];

      if (nextMember) {
        queueIndexRef.current = nextIndex;
        // 延迟打开下一个人的 Sheet，让当前 Sheet 关闭动画完成
        setTimeout(() => {
          setSelectedMember(nextMember);
          setSelectedDate(today);
          setSource("queue");
          setSheetOpen(true);
        }, 200);
      }
    }
  }, [source, router, today]);

  return (
    <div className="space-y-6">
      {/* P0 — 异常处理队列 */}
      <section className="space-y-4">
        <StatsBar stats={data.stats} />
        <ExceptionQueue members={data.todayExceptions} onMemberClick={handleQueueMemberClick} />
      </section>

      {/* P2 — 月度矩阵 */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <MonthlyMatrix
          year={data.year}
          month={data.month}
          members={data.members}
          today={today}
          onCellClick={handleMatrixCellClick}
          onMonthChange={handleMonthChange}
        />
      </section>

      {/* P3 — 成员履约抽屉 */}
      <MemberDrawer
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        member={selectedMember}
        date={selectedDate}
        source={source}
        onActionComplete={handleActionComplete}
      />
    </div>
  );
}
