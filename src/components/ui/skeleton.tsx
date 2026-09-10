import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "animate-pulse-claude rounded-xl bg-[#F1F1F0]",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
