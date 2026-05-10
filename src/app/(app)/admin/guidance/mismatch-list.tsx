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
import type { MismatchItem } from "./guidance-utils";

export function MismatchList({ items }: { items: MismatchItem[] }) {
  if (items.length === 0) {
    return (
      <Card className="border-dashed border-zinc-200 bg-white">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          近期未发现明显的方向错配账号
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
              <TableHead>当前模式</TableHead>
              <TableHead>实际表现</TableHead>
              <TableHead>错配判断</TableHead>
              <TableHead>建议调整</TableHead>
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
                <TableCell className="align-top">
                  <Badge variant="outline">{item.currentMode}</Badge>
                </TableCell>
                <TableCell className="align-top text-sm text-muted-foreground">{item.actualPerformance}</TableCell>
                <TableCell className="align-top">
                  <div className="space-y-2">
                    <Badge variant="outline" className="border-zinc-200 bg-[#D99E55]/10 text-[#D99E55]">
                      {item.mismatchType}
                    </Badge>
                    <p className="text-xs text-muted-foreground">可信度：{item.confidenceLabel}</p>
                  </div>
                </TableCell>
                <TableCell className="max-w-xs whitespace-normal text-sm text-muted-foreground">{item.suggestion}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3 md:hidden">
        {items.map((item) => (
          <Card key={item.accountId} className="border-zinc-200 bg-white">
            <CardContent className="space-y-4 pt-5">
              <div className="space-y-1">
                <div className="font-medium text-foreground">{item.ownerName}</div>
                <div className="text-sm text-muted-foreground">{item.accountName}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{item.currentMode}</Badge>
                <Badge variant="outline" className="border-zinc-200 bg-[#D99E55]/10 text-[#D99E55]">
                  {item.mismatchType}
                </Badge>
              </div>
              <div className="space-y-3 rounded-2xl bg-muted/50 px-3 py-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">实际表现</p>
                  <p className="mt-1 text-foreground">{item.actualPerformance}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">建议调整</p>
                  <p className="mt-1 text-foreground">{item.suggestion}</p>
                </div>
                <p className="text-xs text-muted-foreground">可信度：{item.confidenceLabel}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
