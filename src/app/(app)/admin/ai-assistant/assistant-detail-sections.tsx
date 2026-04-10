"use client";

import type { AssistantDetails } from "@/lib/admin-ai/presentation";

type Props = {
  details?: AssistantDetails;
};

export default function AssistantDetailSections({ details }: Props) {
  if (!details?.sections.length && !details?.nextSteps?.length) return null;

  return (
    <div className="mt-3 space-y-3">
      {details.sections.map((section, index) => (
        <div key={`${section.title}-${index}`} className="rounded-xl border border-border/60 bg-muted/30 p-3">
          <div className="mb-2 text-sm font-medium">{section.title}</div>
          {section.kind === "fields" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {section.items.map((item) => (
                <div key={`${section.title}-${item.label}`} className="rounded-lg bg-background/80 px-3 py-2">
                  <div className="text-xs text-muted-foreground">{item.label}</div>
                  <div className="mt-1 text-sm">{item.value}</div>
                </div>
              ))}
            </div>
          ) : null}

          {section.kind === "list" ? (
            <div className="space-y-2">
              {section.items.map((item, itemIndex) => (
                <div key={`${section.title}-${itemIndex}`} className="rounded-lg bg-background/80 px-3 py-2">
                  <div className="text-sm font-medium">{item.title}</div>
                  {item.description ? <div className="mt-1 text-sm text-muted-foreground">{item.description}</div> : null}
                </div>
              ))}
            </div>
          ) : null}

          {section.kind === "table" ? (
            <div className="overflow-x-auto rounded-lg border border-border/60 bg-background/80">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    {section.columns.map((column) => (
                      <th key={`${section.title}-${column}`} className="whitespace-nowrap px-3 py-2 font-medium">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((row, rowIndex) => (
                    <tr key={`${section.title}-row-${rowIndex}`} className="border-t border-border/60">
                      {row.map((cell, cellIndex) => (
                        <td key={`${section.title}-${rowIndex}-${cellIndex}`} className="px-3 py-2 align-top">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ))}

      {details.nextSteps?.length ? (
        <div className="rounded-xl border border-dashed border-border/70 bg-background/80 p-3">
          <div className="mb-2 text-sm font-medium">下一步</div>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {details.nextSteps.map((item, index) => (
              <li key={`next-${index}`}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
