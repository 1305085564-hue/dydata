import { UserPlus } from "lucide-react";

import { listPendingRequestsForAdmin } from "@/lib/team-join/service";

import { JoinRequestReviewList } from "./join-request-review-list";

export async function JoinRequestReviewSection() {
  const result = await listPendingRequestsForAdmin();

  if (!result.ok) {
    return (
      <section className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white px-5 py-3">
        <div className="flex items-center gap-2">
          <UserPlus className="size-4 text-zinc-400" strokeWidth={1.5} />
          <span className="text-[13px] font-medium text-zinc-800">入团申请审核</span>
        </div>
        <span className="text-[12px] text-[#C9604D]">加载失败，请刷新重试</span>
      </section>
    );
  }

  const rows = result.data;
  const count = rows.length;

  if (count === 0) {
    return (
      <section className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white px-5 py-3">
        <div className="flex items-center gap-2">
          <UserPlus className="size-4 text-zinc-400" strokeWidth={1.5} />
          <span className="text-[13px] font-medium text-zinc-800">入团申请审核</span>
        </div>
        <span className="text-[12px] text-zinc-400">暂无待审申请</span>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6">
      <div className="flex items-baseline gap-3">
        <h2 className="text-[18px] font-medium tracking-tight text-zinc-800">入团申请审核</h2>
        <span className="inline-flex items-center rounded-full bg-[#D99E55]/15 px-2 py-0.5 text-[12px] font-medium text-[#9B6B2E]">
          {count} 待审
        </span>
      </div>
      <div className="mt-4">
        <JoinRequestReviewList rows={rows} />
      </div>
    </section>
  );
}
