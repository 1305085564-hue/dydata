export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-bg)_88%,white)_0%,color-mix(in_srgb,var(--color-bg)_96%,white)_100%)]">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute inset-x-0 top-0 h-[32rem] bg-[radial-gradient(circle_at_top,rgba(10,132,255,0.14),transparent_58%)]" />
        <div className="absolute left-[-10%] top-[18%] h-72 w-72 rounded-full bg-[rgba(255,255,255,0.5)] blur-3xl" />
        <div className="absolute bottom-[-8%] right-[-8%] h-80 w-80 rounded-full bg-[rgba(10,132,255,0.1)] blur-3xl" />
      </div>
      <div className="relative z-10">{children}</div>
    </main>
  );
}
