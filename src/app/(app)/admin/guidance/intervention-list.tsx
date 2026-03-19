import { Card, CardContent } from "@/components/ui/card";
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
      <Card className="border-dashed border-white/60 bg-white/60 backdrop-blur-xl">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          近期未发现明显需要下滑干预的账号
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>成员 / 账号</TableHead>
              <TableHead>下滑幅度</TableHead>
              <TableHead>最近视频表现</TableHead>
              <TableHead>触发原因</TableHead>
              <TableHead>建议动作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.accountId}>
                <TableCell className="align-top">
                  <div className="space-y-1">
                    <div className="font-medium text-foreground">{item.ownerName}</div>
                    <div className="text-sm text-muted-foreground">{item.accountName}</div>
                  </div>
                </TableCell>
                <TableCell className="align-top font-medium text-rose-600">{item.metrics[0]?.value ?? "—"}</TableCell>
                <TableCell className="align-top text-sm text-muted-foreground">{item.latestPerformance}</TableCell>
                <TableCell className="align-top">
                  <div className="flex flex-wrap gap-1.5">
                    {item.reasons.map((reason) => (
                      <Badge key={reason} variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">
                        {reason}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="max-w-xs whitespace-normal text-sm text-muted-foreground">{item.action}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3 md:hidden">
        {items.map((item) => (
          <Card key={item.accountId} className="border-white/70 bg-white/85 backdrop-blur-xl">
            <CardContent className="space-y-4 pt-5">
              <div className="space-y-1">
                <div className="font-medium text-foreground">{item.ownerName}</div>
                <div className="text-sm text-muted-foreground">{item.accountName}</div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {item.reasons.map((reason) => (
                  <Badge key={reason} variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">
                    {reason}
                  </Badge>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {item.metrics.map((metric) => (
                  <div key={metric.label} className="rounded-2xl bg-muted/50 px-3 py-2">
                    <p className="text-xs text-muted-foreground">{metric.label}</p>
                    <p className="mt-1 font-medium text-foreground">{metric.value}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-2xl bg-rose-50/80 px-3 py-3 text-sm text-rose-700">{item.action}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
