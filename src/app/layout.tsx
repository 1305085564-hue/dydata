import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://dydata.cc"),
  title: {
    default: "DYData｜抖音数据日报平台",
    template: "%s｜DYData",
  },
  description: "面向内容团队的抖音数据日报、运营分析与成长复盘平台。",
  applicationName: "DYData",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
  },
  openGraph: {
    type: "website",
    locale: "zh_CN",
    url: "/",
    siteName: "DYData",
    title: "DYData｜抖音数据日报平台",
    description: "面向内容团队的抖音数据日报、运营分析与成长复盘平台。",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "DYData 抖音数据日报平台",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "DYData｜抖音数据日报平台",
    description: "面向内容团队的抖音数据日报、运营分析与成长复盘平台。",
    images: ["/opengraph-image"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light",
  themeColor: "#fafaf9",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={inter.variable}>
      <body className="antialiased tabular-nums">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
