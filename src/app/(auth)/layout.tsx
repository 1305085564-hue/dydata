import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "账号服务",
  description: "登录或管理 DYData 账号。",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-screen bg-stone-50 overflow-hidden flex flex-col justify-center">
      {/* 顶部极淡天空渐变氛围 */}
      <div 
        className="absolute inset-x-0 top-0 h-[500px] pointer-events-none bg-gradient-to-b from-[#D97757]/0.04 via-[#D97757]/0.005 to-transparent" 
      />
      {/* 极隐约的微暖色点阵材质底纹 */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-[0.012]"
        style={{
          backgroundImage: `radial-gradient(circle, #D97757 1px, transparent 1px)`,
          backgroundSize: '24px 24px'
        }}
      />
      <div className="relative z-10 w-full">
        {children}
      </div>
    </main>
  );
}
