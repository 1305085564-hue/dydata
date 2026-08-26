import Link from "next/link";
import { DraftRecalibrateIllustration } from "@/components/editorial/editorial-illustrations";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12 bg-[#FBF9F5]">
      <div className="flex max-w-md flex-col items-center gap-3 rounded-2xl border border-[#E5E0D6] bg-white px-8 py-10 text-center shadow-claude-float">
        <DraftRecalibrateIllustration size={96} />
        <h1 className="font-serif text-xl font-medium tracking-tight text-[#1C1917]">未找到对应卷册</h1>
        <p className="text-[13px] leading-relaxed text-[#78716C]">
          此处的篇章可能已被归档收卷，或链接有微小出入。
        </p>
        <Link
          href="/"
          className="mt-3 inline-flex h-9 items-center rounded-lg bg-[#D97757] hover:bg-[#C46A4D] px-5 text-[13px] font-medium text-white transition-colors duration-100 shadow-sm active:scale-[0.985]"
        >
          回到工作台首页
        </Link>
      </div>
    </main>
  );
}
