"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function WriterCertificationButton({ userId, certified }: { userId: string; certified: boolean }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  async function toggle() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/collaboration/writer-certification", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, certified: !certified }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "认证状态保存失败");
      startTransition(() => router.refresh());
    } catch (error) {
      setError(error instanceof Error ? error.message : "认证状态保存失败");
    } finally {
      setSaving(false);
    }
  }
  return <span className="inline-flex flex-col items-start gap-1">
    <button type="button" disabled={saving || refreshing} onClick={() => void toggle()}
      className="h-7 rounded-md px-2 text-[12px] text-[#78716C] hover:bg-[#F5F3EE] disabled:opacity-50">
      {saving || refreshing ? "保存中…" : certified ? "取消认证" : "认证文案岗"}
    </button>
    {error && <span role="alert" className="text-[12px] text-red-700">{error}</span>}
  </span>;
}
