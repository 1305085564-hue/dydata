"use client";

interface ConclusionCardProps {
  reasonTags?: { id: string; name: string }[];
  adminConclusion?: string | null;
  suggestedAction?: string | null;
}

export function ConclusionCard({
  reasonTags,
  adminConclusion,
  suggestedAction,
}: ConclusionCardProps) {
  const hasReasonTags = reasonTags && reasonTags.length > 0;
  const hasConclusion = !!adminConclusion?.trim();
  const hasSuggestion = !!suggestedAction?.trim();

  if (!hasReasonTags && !hasConclusion && !hasSuggestion) return null;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      {/* Eyebrow */}
      <div className="flex items-center gap-2">
        <span className="size-1.5 rounded-full bg-[#D97757]" />
        <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-500">
          审核结论
        </span>
      </div>

      {/* Reason tags */}
      {hasReasonTags ? (
        <div className="mt-3">
          <div className="flex flex-wrap gap-2">
            {reasonTags!.map((tag) => (
              <span
                key={tag.id}
                className="rounded-lg border border-[#C9604D]/30 px-2.5 py-0.5 text-[12px] font-medium text-[#C9604D]"
              >
                {tag.name}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* Conclusion + Suggestion dual column */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {hasConclusion ? (
          <div>
            <div className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-[#D99E55]" />
              <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-500">
                管理员结论
              </span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-[13px] leading-[1.7] text-zinc-700">
              {adminConclusion}
            </p>
          </div>
        ) : null}
        {hasSuggestion ? (
          <div>
            <div className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-[#6FAA7D]" />
              <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-500">
                建议动作
              </span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-[13px] leading-[1.7] text-zinc-700">
              {suggestedAction}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
