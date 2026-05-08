import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VIOLATION_CATEGORIES } from "./format";

export function CaseFilters({
  status,
  category,
  query,
}: {
  status: string;
  category: string;
  query: string;
}) {
  return (
    <form className="grid gap-3 rounded-[1.5rem] border border-zinc-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_180px_180px]">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
        <Input
          name="q"
          defaultValue={query}
          placeholder="搜索话术内容"
          className="h-11 rounded-2xl border-zinc-200 bg-zinc-50 pl-9"
        />
      </label>
      <Select name="status" defaultValue={status || "all"}>
        <SelectTrigger className="h-11 w-full rounded-2xl border-zinc-200 bg-zinc-50">
          <SelectValue placeholder="全部状态" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部状态</SelectItem>
          <SelectItem value="verified_violation">已确认违规</SelectItem>
          <SelectItem value="verified_safe">已确认可用</SelectItem>
          <SelectItem value="submitted">待验证</SelectItem>
          <SelectItem value="rejected">已驳回</SelectItem>
        </SelectContent>
      </Select>
      <Select name="category" defaultValue={category || "all"}>
        <SelectTrigger className="h-11 w-full rounded-2xl border-zinc-200 bg-zinc-50">
          <SelectValue placeholder="全部分类" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部分类</SelectItem>
          {VIOLATION_CATEGORIES.map((item) => (
            <SelectItem key={item} value={item}>
              {item}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </form>
  );
}

