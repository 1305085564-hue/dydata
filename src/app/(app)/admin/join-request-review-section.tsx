import { listPendingRequestsForAdmin } from "@/lib/team-join/service";

import { JoinRequestReviewList } from "./join-request-review-list";

export async function JoinRequestReviewSection() {
  const result = await listPendingRequestsForAdmin();

  if (!result.ok) {
    return (
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-[18px] font-medium tracking-tight text-zinc-800">入团申请审核</h2>
        <p className="mt-3 text-[13px] text-[#C9604D]">加载失败，请刷新重试</p>
      </section>
    );
  }

  const rows = result.data;
  const count = rows.length;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex items-baseline gap-3">
        <h2 className="text-[18px] font-medium tracking-tight text-zinc-800">入团申请审核</h2>
        {count > 0 ? (
          <span className="inline-flex items-center rounded-full bg-[#D99E55]/15 px-2 py-0.5 text-[12px] font-medium text-[#9B6B2E]">
            {count} 待审
          </span>
        ) : null}
      </div>
      <div className="mt-4">
        <JoinRequestReviewList rows={rows} />
      </div>
    </section>
  );
}
