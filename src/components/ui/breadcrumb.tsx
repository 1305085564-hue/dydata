import Link from "next/link";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumb({ items, className }: BreadcrumbProps) {
  return (
    <nav aria-label="面包屑" className={cn("flex items-center gap-1.5 text-[12px]", className)}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={item.label + index} className="flex items-center gap-1.5">
            {index > 0 ? (
              <ChevronRight className="size-3 text-zinc-300" strokeWidth={1.5} />
            ) : null}
            {isLast || !item.href ? (
              <span className={isLast ? "text-zinc-800" : "text-zinc-400"}>{item.label}</span>
            ) : (
              <Link
                href={item.href}
                className="text-zinc-400 transition-colors hover:text-zinc-600"
              >
                {item.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
