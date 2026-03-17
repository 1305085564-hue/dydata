export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="relative min-h-screen overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse at top, rgba(224,231,255,0.2) 0%, transparent 50%), radial-gradient(ellipse at bottom right, rgba(199,210,254,0.15) 0%, transparent 50%), hsl(var(--muted) / 0.3)",
      }}
    >
      <div className="auth-background-glow pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="auth-background-glow-spot auth-background-glow-spot-primary" />
        <div className="auth-background-glow-spot auth-background-glow-spot-secondary" />
      </div>
      <div className="relative z-10">{children}</div>
    </main>
  );
}
