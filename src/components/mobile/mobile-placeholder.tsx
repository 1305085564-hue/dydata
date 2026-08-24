export function MobilePlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-2 py-24">
      <h1 className="font-serif text-[26px] font-semibold leading-tight text-claude-ink-950">
        {title}
      </h1>
      <p className="text-[13px] leading-relaxed text-claude-ink-600">
        {description}
      </p>
    </div>
  );
}
