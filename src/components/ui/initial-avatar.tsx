import { cn } from "@/lib/utils";

/**
 * 首字头像：人名前的定位锚（《效率美学》§0 噪音与锚点）。
 * 在名单里眼睛先找形状再读字，所以成列出现的人名带它；单个人名不带。
 */
export function InitialAvatar({
  name,
  size = "sm",
  className,
}: {
  name: string | null | undefined;
  size?: "xs" | "sm" | "lg";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border border-[#E2E2DF]/60 bg-[#F1F1F0] text-[#1F1E1D]",
        size === "lg" ? "size-9 text-[14px]" : size === "xs" ? "size-6 text-[12px]" : "size-7 text-[12px]",
        className,
      )}
    >
      {name?.trim() ? name.trim().slice(0, 1) : "?"}
    </span>
  );
}
