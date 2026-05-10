export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-screen bg-[#ECECEE]">
      {children}
    </main>
  );
}
