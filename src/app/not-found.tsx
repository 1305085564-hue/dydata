import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="flex max-w-md flex-col items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-8 py-10 text-center">
        <p className="text-[48px] font-semibold leading-none text-zinc-300">404</p>
        <h1 className="text-lg font-medium text-zinc-900">页面不存在</h1>
        <p className="text-sm leading-6 text-zinc-500">
          你访问的页面已被移除或地址有误。
        </p>
        <Link
          href="/"
          className="mt-2 inline-flex h-9 items-center rounded-lg border border-zinc-200 bg-white px-4 text-[13px] font-medium text-zinc-900 transition-colors hover:bg-zinc-50"
        >
          返回首页
        </Link>
      </div>
    </main>
  );
}
