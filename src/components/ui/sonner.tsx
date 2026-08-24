"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4 stroke-[1.5] text-[#16A34A]" />,
        info: <InfoIcon className="size-4 stroke-[1.5] text-[#78716C]" />,
        warning: <TriangleAlertIcon className="size-4 stroke-[1.5] text-[#D99E55]" />,
        error: <OctagonXIcon className="size-4 stroke-[1.5] text-[#DC2626]" />,
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
          "--normal-text": "#292524",
          "--normal-border": "#E5E0D6",
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
