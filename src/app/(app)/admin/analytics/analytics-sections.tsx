"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AnalyticsSection {
  id: string;
  title: string;
  content: ReactNode;
}

export function AnalyticsSections({
  sections,
  focusSectionId = null,
}: {
  sections: AnalyticsSection[];
  focusSectionId?: string | null;
}) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(
    sections.reduce((acc, section) => ({ ...acc, [section.id]: true }), {}),
  );

  useEffect(() => {
    if (!focusSectionId) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpandedSections((prev) => ({
      ...prev,
      [focusSectionId]: true,
    }));

    const timeoutId = window.setTimeout(() => {
      document.getElementById(`analytics-section-${focusSectionId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);

    return () => window.clearTimeout(timeoutId);
  }, [focusSectionId]);

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  return (
    <div className="space-y-6">
      {sections.map((section, index) => {
        const isExpanded = expandedSections[section.id];

        return (
          <div
            key={section.id}
            id={`analytics-section-${section.id}`}
            className="group"
          >
            <div
              className={cn(
                "overflow-hidden rounded-2xl border border-stone-200 bg-white transition-[background-color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
                !isExpanded && "hover:-translate-y-[1px] active:translate-y-0",
              )}
            >
              <button
                onClick={() => toggleSection(section.id)}
                className="flex w-full items-center justify-between px-6 py-5 text-left outline-none"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={cn(
                      "flex size-10 items-center justify-center rounded-lg bg-stone-100 text-[13px] font-medium text-stone-400 transition-[background-color,color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] font-mono tabular-nums",
                      isExpanded && "bg-stone-100 text-stone-800",
                    )}
                  >
                    {index + 1}
                  </div>
                  <h2 className="text-[18px] font-medium tracking-tight text-stone-800">
                    {section.title}
                  </h2>
                </div>

                <div
                  className={cn(
                    "flex size-10 items-center justify-center rounded-full bg-stone-50 text-stone-400 transition-[background-color,color,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] group-hover:bg-stone-100",
                    isExpanded && "rotate-180 bg-stone-100 text-stone-800 group-hover:bg-stone-200",
                  )}
                >
                  <ChevronDown className="size-5 stroke-[1.5]" />
                </div>
              </button>

              <div
                className={cn(
                  "grid transition-[grid-template-rows,opacity] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
                  isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                )}
              >
                <div className="overflow-hidden">
                  <div className="border-t border-stone-100 px-6 pb-6 pt-5">{section.content}</div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
