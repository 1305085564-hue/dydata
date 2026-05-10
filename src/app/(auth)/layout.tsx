export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-screen bg-[#F4F4F5]">
      {children}
    </main>
  );
}
