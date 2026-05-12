import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { InterventionItem } from "./guidance-utils";

export function InterventionList({ items }: { items: InterventionItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-200 bg-white py-10 text-center text-[13px] text-zinc-500">
        近期未发现明显需要下滑干预的账号
      </div>
    );
  }

  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border border-zinc-200 md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-9 text-[12px] font-medium text-zinc-500">成员 / 账号</TableHead>
              <TableHead className="h-9 text-[12px] font-medium text-zinc-500">下滑幅度</TableHead>
              <TableHead className="h-9 text-[12px] font-medium text-zinc-500">最近视频表现</TableHead>
              <TableHead className="h-9 text-[12px] font-medium text-zinc-500">触发原因</TableHead>
              <TableHead className="h-9 text-[12px] font-medium text-zinc-500">建议动作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.accountId} className="h-11">
                <TableCell className="align-top">
                  <div className="space-y-0.5">
                    <div className="text-[13px] font-medium text-zinc-800">{item.ownerName}</div>
                    <div className="text-[12px] text-zinc-500">{item.accountName}</div>
                  </div>
                </TableCell>
                <TableCell className="align-top text-[13px] font-medium text-[#C9604D]">{item.metrics[0]?.value ?? "—"}</TableCell>
                <TableCell className="align-top text-[13px] text-zinc-600">{item.latestPerformance}</TableCell>
                <TableCell className="align-top">
                  <div className="flex flex-wrap gap-1.5">
                    {item.reasons.map((reason) => (
                      <Badge key={reason} variant="outline" className="border-zinc-200 bg-[#C9604D]/10 text-[12px] text-[#C9604D]">
                        {reason}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="max-w-xs whitespace-normal text-[13px] text-zinc-600">{item.action}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-2 md:hidden">
        {items.map((item) => (
          <div key={item.accountId} className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4">
            <div className="space-y-0.5">
              <div className="text-[14px] font-medium text-zinc-800">{item.ownerName}</div>
              <div className="text-[12px] text-zinc-500">{item.accountName}</div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {item.reasons.map((reason) => (
                <Badge key={reason} variant="outline" className="border-zinc-200 bg-[#C9604D]/10 text-[12px] text-[#C9604D]">
                  {reason}
                </Badge>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 text-[13px]">
              {item.metrics.map((metric) => (
                <div key={metric.label} className="rounded-xl bg-zinc-50 px-3 py-2">
                  <p className="text-[11px] text-zinc-400">{metric.label}</p>
                  <p className="mt-1 font-medium text-zinc-700">{metric.value}</p>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-[#C9604D]/15 bg-[#C9604D]/5 px-3 py-2 text-[13px] text-[#C9604D]">
              {item.action}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
