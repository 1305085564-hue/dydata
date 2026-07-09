"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4 stroke-[1.5] text-[#6FAA7D]" />,
        info: <InfoIcon className="size-4 stroke-[1.5] text-stone-500" />,
        warning: <TriangleAlertIcon className="size-4 stroke-[1.5] text-[#D99E55]" />,
        error: <OctagonXIcon className="size-4 stroke-[1.5] text-[#C9604D]" />,
        loading: (
          <span className="relative flex size-2 items-center justify-center">
            <span className="inline-flex size-2 rounded-full bg-[#D99E55]" />
            <span className="absolute size-3 animate-pulse rounded-full bg-[#D99E55]/15" />
          </span>
        ),
      }}
      style={
        {
          "--normal-bg": "#FFFFFF",
          "--normal-text": "#27272A",
          "--normal-border": "#E4E4E7",
          "--border-radius": "12px",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
