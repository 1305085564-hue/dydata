import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MismatchItem } from "./guidance-utils";

export function MismatchList({ items }: { items: MismatchItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-200 bg-white py-10 text-center text-[13px] text-stone-500">
        近期未发现明显的方向错配账号
      </div>
    );
  }

  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border border-stone-200 md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-9 text-[12px] font-medium text-stone-500">成员 / 账号</TableHead>
              <TableHead className="h-9 text-[12px] font-medium text-stone-500">当前模式</TableHead>
              <TableHead className="h-9 text-[12px] font-medium text-stone-500">实际表现</TableHead>
              <TableHead className="h-9 text-[12px] font-medium text-stone-500">错配判断</TableHead>
              <TableHead className="h-9 text-[12px] font-medium text-stone-500">建议调整</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.accountId} className="h-11">
                <TableCell className="align-top">
                  <div className="space-y-0.5">
                    <div className="text-[13px] font-medium text-stone-800">{item.ownerName}</div>
                    <div className="text-[12px] text-stone-500">{item.accountName}</div>
                  </div>
                </TableCell>
                <TableCell className="align-top">
                  <Badge variant="outline" className="text-[12px]">{item.currentMode}</Badge>
                </TableCell>
                <TableCell className="align-top text-[13px] text-stone-600">{item.actualPerformance}</TableCell>
                <TableCell className="align-top">
                  <div className="space-y-1">
                    <Badge variant="outline" className="border-stone-200 bg-[#D99E55]/10 text-[12px] text-[#D99E55]">
                      {item.mismatchType}
                    </Badge>
                    <p className="text-[11px] text-stone-400">可信度：{item.confidenceLabel}</p>
                  </div>
                </TableCell>
                <TableCell className="max-w-xs whitespace-normal text-[13px] text-stone-600">{item.suggestion}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-2 md:hidden">
        {items.map((item) => (
          <div key={item.accountId} className="space-y-4 rounded-xl border border-stone-200 bg-white p-4">
            <div className="space-y-0.5">
              <div className="text-[14px] font-medium text-stone-800">{item.ownerName}</div>
              <div className="text-[12px] text-stone-500">{item.accountName}</div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[12px]">{item.currentMode}</Badge>
              <Badge variant="outline" className="border-stone-200 bg-[#D99E55]/10 text-[12px] text-[#D99E55]">
                {item.mismatchType}
              </Badge>
            </div>
            <div className="space-y-2 rounded-xl bg-stone-50 px-3 py-2 text-[13px]">
              <div>
                <p className="text-[11px] text-stone-400">实际表现</p>
                <p className="mt-1 text-stone-700">{item.actualPerformance}</p>
              </div>
              <div>
                <p className="text-[11px] text-stone-400">建议调整</p>
                <p className="mt-1 text-stone-700">{item.suggestion}</p>
              </div>
              <p className="text-[11px] text-stone-400">可信度：{item.confidenceLabel}</p>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
