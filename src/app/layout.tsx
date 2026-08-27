import type { Metadata, Viewport } from "next";

import { RouteToaster } from "@/components/ui/route-toaster";

import "./globals.css";

const lowDensityTextScript = `
(() => {
  const nav = navigator;
  const userAgentData = nav.userAgentData;
  const platform = userAgentData?.platform || nav.platform || "";
  const isWindows = /Windows/i.test(platform) || /Windows/i.test(nav.userAgent);
  if (!isWindows) return;
  const root = document.documentElement;
  root.dataset.os = "windows";
  if ((window.devicePixelRatio || 1) < 1.5) {
    root.dataset.textDensity = "low";
  }
})();
`;

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
  themeColor: "#FBF9F5",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased tabular-nums">
        <script dangerouslySetInnerHTML={{ __html: lowDensityTextScript }} />
        {children}
        <RouteToaster />
      </body>
    </html>
  );
}
