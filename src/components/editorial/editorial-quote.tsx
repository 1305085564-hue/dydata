import React, { type ReactNode } from "react";

interface EditorialEpigraphProps {
  quote: string;
  author?: string;
  className?: string;
}

/**
 * 出版物卷首寄语 (Epigraph)
 * 渲染在页面或大章节顶部，提供具有思想读本温度的呼吸感开篇。
 */
export function EditorialEpigraph({ quote, author, className = "" }: EditorialEpigraphProps) {
  return (
    <div className={`relative py-4 my-2 border-l-2 border-[#D97757]/60 pl-4 bg-gradient-to-r from-[#F5F3EE]/60 to-transparent rounded-r-lg ${className}`}>
      <p className="font-serif italic text-[13.5px] leading-[1.7] text-[#292524]/90 tracking-normal">
        “{quote}”
      </p>
      {author ? (
        <p className="mt-1 text-[12px] text-[#78716C] tracking-wide">
          —— {author}
        </p>
      ) : null}
    </div>
  );
}

interface EditorialSidenoteProps {
  children: ReactNode;
  className?: string;
}

/**
 * 出版物边注 / 旁白 (Marginalia / Sidenote)
 * 放置于卡片或表单右侧/下方，提供学者同行式的轻声提醒。
 */
export function EditorialSidenote({ children, className = "" }: EditorialSidenoteProps) {
  return (
    <aside className={`text-[12.5px] leading-[1.65] text-[#78716C] border-t border-[#ECE7DE]/80 pt-2.5 mt-3 flex items-start gap-2 ${className}`}>
      <span className="text-[#D97757] text-[11px] select-none mt-0.5">✦</span>
      <div className="flex-1">{children}</div>
    </aside>
  );
}
