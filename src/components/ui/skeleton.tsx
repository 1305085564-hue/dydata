import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "animate-pulse-claude rounded-xl bg-[#F5F3EE]",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
