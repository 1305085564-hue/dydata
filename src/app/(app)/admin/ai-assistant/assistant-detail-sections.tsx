"use client";

import type { AssistantDetails } from "@/lib/admin-ai/presentation";
import { ArrowRight } from "lucide-react";

type Props = {
  details?: AssistantDetails;
};

export default function AssistantDetailSections({ details }: Props) {
  if (!details?.sections.length && !details?.nextSteps?.length) return null;

  return (
    <div className="space-y-3">
      {details.sections.map((section, index) => (
        <div key={`${section.title}-${index}`} className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-400">
              {section.title}
            </span>
            <div className="h-px flex-1 bg-zinc-200" />
          </div>

          {section.kind === "fields" && (
            <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
              {section.items.map((item) => (
                <div
                  key={`${section.title}-${item.label}`}
                  className="flex items-baseline gap-2 border-b border-dashed border-zinc-100 py-1.5"
                >
                  <span className="shrink-0 text-[10px] uppercase tracking-wider text-zinc-400">
                    {item.label}
                  </span>
                  <span className="ml-auto truncate text-right text-[12.5px] font-medium font-mono tabular-nums text-zinc-800">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          )}

          {section.kind === "list" && (
            <ul className="space-y-1.5">
              {section.items.map((item, itemIndex) => (
                <li
                  key={`${section.title}-${itemIndex}`}
                  className="flex items-start gap-2 rounded-lg border border-zinc-100 bg-white px-2.5 py-2"
                >
                  <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-zinc-400" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-medium text-zinc-800">{item.title}</div>
                    {item.description && (
                      <div className="mt-0.5 text-[11.5px] leading-relaxed text-zinc-500">
                        {item.description}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {section.kind === "table" && (
            <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
              <table className="min-w-full text-left text-[12px]">
                <thead className="bg-[#FAFAFB]">
                  <tr>
                    {section.columns.map((column) => (
                      <th
                        key={`${section.title}-${column}`}
                        className="whitespace-nowrap border-b border-zinc-200 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500"
                      >
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((row, rowIndex) => (
                    <tr
                      key={`${section.title}-row-${rowIndex}`}
                      className="border-t border-zinc-100 transition-colors hover:bg-[#FAFAFB]"
                    >
                      {row.map((cell, cellIndex) => (
                        <td
                          key={`${section.title}-${rowIndex}-${cellIndex}`}
                          className="px-3 py-2 align-top text-zinc-800 font-mono tabular-nums"
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      {details.nextSteps?.length ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-3">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-400">
            Next Steps
          </div>
          <ul className="space-y-1">
            {details.nextSteps.map((item, index) => (
              <li
                key={`next-${index}`}
                className="flex items-start gap-2 text-[12px] leading-relaxed text-zinc-700"
              >
                <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-zinc-400" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
