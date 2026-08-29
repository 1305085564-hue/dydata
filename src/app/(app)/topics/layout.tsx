export default function TopicsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="min-h-[500px]">
        {children}
      </div>
    </div>
  );
}
