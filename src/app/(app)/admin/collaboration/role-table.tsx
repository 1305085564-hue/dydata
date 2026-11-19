"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { pinCurrentUserFirst } from "@/lib/collaboration/domain/workbench-state";
import { OneTip } from "./one-tip";
import { SelfMemberBadge } from "./member-self-hint";

/**
 * 协作管理所有表格共用的骨架（四张岗位表、小队列表、小队详情）：一行一个对象，点一行只有一个去处。
 * - 姓名格下方一行灰字放名下/经手账号，不再单独占列；
 * - 说明收进列头悬停，表下不压脚注；
 * - 当前排序列用定名墨，其余正文墨——焦点跟着排序走；
 * - 窄屏（< sm）改成每人一行的列表，不横向拖动。
 */
export interface RoleColumn<R> {
  key: string;
  label: string;
  /** 列头悬停说明（口径）；同一时刻全页只开一个。 */
  tip?: ReactNode;
  /** 列头标签右侧的附加入口（如评级规则）。 */
  headExtra?: ReactNode;
  /** 给出即可排序；返回 null 的行排在最后。 */
  sortValue?: (row: R) => number | null;
  /** 列宽（px），表格按列宽合计定最小宽度。 */
  width: number;
  align?: "left" | "right";
  render: (row: R) => ReactNode;
}

export interface RoleTableProps<R> {
  rows: R[];
  columns: RoleColumn<R>[];
  defaultSortKey: string;
  getId: (row: R) => string;
  getName: (row: R) => string;
  /** 姓名下方的灰字（账号名单），没有就不出第二行。 */
  getSub?: (row: R) => string | null;
  isZero?: (row: R) => boolean;
  /** 窄屏列表右侧：主数字 + 一行说明。 */
  getMobileSummary: (row: R) => { primary: string; secondary: string };
  currentUserId?: string | null;
  onSelectPerson: (userId: string) => void;
  onPrefetchPerson?: (userId: string) => void;
  /** 首列表头，默认「姓名」（小队列表用「小队」）。 */
  nameLabel?: string;
  /** 整行的读屏说明，默认「查看 X 的个人档案」。 */
  rowAriaLabel?: (row: R) => string;
  /** 表头下固定的一行合计（如小队「全队合计」），不参与排序、不可点。 */
  summary?: { name: string; sub?: string | null; row: R };
}

const NAME_COL_WIDTH = 200;

export function RoleTable<R>({
  rows,
  columns,
  defaultSortKey,
  getId,
  getName,
  getSub,
  isZero,
  getMobileSummary,
  currentUserId = null,
  onSelectPerson,
  onPrefetchPerson,
  nameLabel = "姓名",
  rowAriaLabel,
  summary,
}: RoleTableProps<R>) {
  const [sortKey, setSortKey] = useState(defaultSortKey);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const column = columns.find((c) => c.key === sortKey && c.sortValue);
    const list = [...rows];
    if (column?.sortValue) {
      const value = column.sortValue;
      list.sort((a, b) => {
        const left = value(a);
        const right = value(b);
        // 并列时保持传入顺序（排序是稳定的），如文案未认证候选人始终在已认证之后
        if (left === null && right === null) return 0;
        if (left === null) return 1;
        if (right === null) return -1;
        return sortOrder === "desc" ? right - left : left - right;
      });
    }
    return pinCurrentUserFirst(
      list.map((row) => ({ row, userId: getId(row) })),
      currentUserId,
    ).map((item) => item.row);
  }, [rows, columns, sortKey, sortOrder, currentUserId, getId]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortOrder("desc");
    }
  };

  const minWidth = NAME_COL_WIDTH + columns.reduce((sum, c) => sum + c.width, 0);

  return (
    <>
      {/* 宽屏：表格 */}
      <Card className="hidden sm:flex overflow-hidden p-0 gap-0">
        <Table className="table-fixed text-[13px]" style={{ minWidth }}>
          <colgroup>
            <col style={{ width: NAME_COL_WIDTH }} />
            {columns.map((c) => (
              <col key={c.key} style={{ width: c.width }} />
            ))}
          </colgroup>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4 sticky left-0 z-20 bg-[#FCFCFB]">{nameLabel}</TableHead>
              {columns.map((c) => (
                <TableHead
                  key={c.key}
                  aria-sort={sortKey === c.key ? (sortOrder === "desc" ? "descending" : "ascending") : undefined}
                  className={c.align === "left" ? "text-left" : "text-right"}
                >
                  <ColumnHead
                    column={c}
                    active={sortKey === c.key}
                    order={sortOrder}
                    onSort={() => handleSort(c.key)}
                  />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary && (
              <TableRow className="hover:bg-transparent bg-[#FCFCFB]">
                <TableCell className="pl-4 sticky left-0 z-10 bg-[#FCFCFB]">
                  <PersonName name={summary.name} sub={summary.sub ?? null} isSelf={false} zero={false} />
                </TableCell>
                {columns.map((c) => (
                  <TableCell key={c.key} className={`${c.align === "left" ? "text-left" : "text-right"} tabular-nums text-[#141413]`}>
                    {c.render(summary.row)}
                  </TableCell>
                ))}
              </TableRow>
            )}
            {sorted.map((row) => {
              const userId = getId(row);
              const isSelf = Boolean(currentUserId && userId === currentUserId);
              const zero = isZero?.(row) ?? false;
              const sub = getSub?.(row) ?? null;
              return (
                // 整行可点（鼠标）；键盘与读屏落在名字格里的真按钮上，<tr> 保留表格行语义
                <TableRow
                  key={userId}
                  data-self={isSelf ? "true" : undefined}
                  className="group cursor-pointer data-[self=true]:bg-[#F7F7F6] focus-within:bg-[#F7F7F6]"
                  onClick={() => onSelectPerson(userId)}
                  onMouseEnter={() => onPrefetchPerson?.(userId)}
                >
                  <TableCell className="pl-4 sticky left-0 z-10 bg-white group-hover:bg-[#F7F7F6] group-data-[self=true]:bg-[#F7F7F6] group-focus-within:bg-[#F7F7F6] transition-[background-color] duration-150">
                    <button
                      type="button"
                      aria-label={rowAriaLabel ? rowAriaLabel(row) : `查看${getName(row)}的个人档案`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelectPerson(userId);
                      }}
                      onFocus={() => onPrefetchPerson?.(userId)}
                      className="block w-full min-w-0 rounded-md text-left cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#141413]/10 focus-visible:ring-offset-2"
                    >
                      <PersonName name={getName(row)} sub={sub} isSelf={isSelf} zero={zero} />
                    </button>
                  </TableCell>
                  {columns.map((c) => (
                    <TableCell
                      key={c.key}
                      className={`${c.align === "left" ? "text-left" : "text-right"} tabular-nums ${
                        zero ? "text-[#A8A29E]" : sortKey === c.key ? "text-[#141413]" : "text-[#1F1E1D]"
                      }`}
                    >
                      {c.render(row)}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* 窄屏：每人一行 */}
      <ul className="sm:hidden divide-y divide-[#E2E2DF]/60 border-y border-[#E2E2DF]/60">
        {summary && (() => {
          const s = getMobileSummary(summary.row);
          return (
            <li className="flex items-center justify-between gap-3 bg-[#FCFCFB] px-1 py-3">
              <PersonName name={summary.name} sub={summary.sub ?? null} isSelf={false} zero={false} />
              <span className="flex shrink-0 flex-col items-end gap-1 tabular-nums">
                <span className="text-[14px] text-[#141413]">{s.primary}</span>
                <span className="text-[12px] text-[#78716C]">{s.secondary}</span>
              </span>
            </li>
          );
        })()}
        {sorted.map((row) => {
          const userId = getId(row);
          const isSelf = Boolean(currentUserId && userId === currentUserId);
          const zero = isZero?.(row) ?? false;
          const mobile = getMobileSummary(row);
          return (
            <li key={userId}>
              <button
                type="button"
                aria-label={rowAriaLabel ? rowAriaLabel(row) : undefined}
                onClick={() => onSelectPerson(userId)}
                className={`flex w-full items-center justify-between gap-3 px-1 py-3 text-left transition-colors duration-150 hover:bg-[#F7F7F6] cursor-pointer ${isSelf ? "bg-[#F7F7F6]" : ""}`}
              >
                <PersonName name={getName(row)} sub={getSub?.(row) ?? null} isSelf={isSelf} zero={zero} />
                <span className="flex shrink-0 flex-col items-end gap-1 tabular-nums">
                  <span className={`text-[14px] ${zero ? "text-[#A8A29E]" : "text-[#141413]"}`}>{mobile.primary}</span>
                  <span className="text-[12px] text-[#78716C]">{mobile.secondary}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function PersonName({
  name,
  sub,
  isSelf,
  zero,
}: {
  name: string;
  sub: string | null;
  isSelf: boolean;
  zero: boolean;
}) {
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="flex min-w-0 items-center">
        <span className={`truncate text-[14px] leading-[1.40] ${zero ? "text-[#78716C]" : "text-[#141413]"}`}>{name}</span>
        {isSelf && <SelfMemberBadge />}
      </span>
      {sub ? <span className="truncate text-[12px] leading-[1.50] text-[#78716C]">{sub}</span> : null}
    </span>
  );
}

function ColumnHead<R>({
  column,
  active,
  order,
  onSort,
}: {
  column: RoleColumn<R>;
  active: boolean;
  order: "asc" | "desc";
  onSort: () => void;
}) {
  const justify = column.align === "left" ? "justify-start" : "justify-end";
  const arrow = active ? (
    order === "desc" ? <ArrowDown className="size-3" aria-hidden /> : <ArrowUp className="size-3" aria-hidden />
  ) : null;

  const label = column.sortValue ? (
    <button
      type="button"
      onClick={onSort}
      className={`inline-flex items-center gap-1 cursor-pointer transition-colors duration-150 ${
        active ? "text-[#141413]" : "hover:text-[#141413]"
      }`}
    >
      {column.label}
      {arrow}
    </button>
  ) : (
    <span className={column.tip ? "cursor-help" : undefined}>{column.label}</span>
  );

  return (
    <span className={`flex w-full items-center gap-1 ${justify}`}>
      {column.tip ? <OneTip tip={column.tip}>{label}</OneTip> : label}
      {column.headExtra}
    </span>
  );
}

/** 列头说明的统一写法：一句口径，不加标题。 */
export function HeadTip({ children }: { children: ReactNode }) {
  return <span className="text-[12px] text-[#1F1E1D]">{children}</span>;
}
