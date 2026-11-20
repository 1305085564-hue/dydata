import Link from "next/link";

/** 链接打不开时：直说「页面不存在」，给一条回工作台的路。 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen min-h-dvh flex-col items-center justify-center gap-2 bg-[#FCFCFB] px-4 py-12 text-center">
      <h1 className="font-serif text-[20px] leading-[1.25] text-[#141413]">这个页面不存在</h1>
      <p className="text-[14px] leading-[1.60] text-[#78716C]">链接可能有误，或者这个页面已经下线。</p>
      <Link
        href="/dashboard"
        className="mt-2 inline-flex h-7 items-center rounded-md bg-[#D97757] px-3 text-[14px] text-white transition-colors duration-150 hover:bg-[#C46A4D]"
      >
        回到工作台
      </Link>
    </main>
  );
}
