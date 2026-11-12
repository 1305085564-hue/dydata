import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import { RouteToaster } from "@/components/ui/route-toaster";
import { MotionPreferences } from "@/components/motion-preferences";

import "./globals.css";

// 自托管字体（next/font 按内容哈希命名，浏览器按 immutable 缓存一年）。
// 只保留 400–600 三档；Inter 只认英文/数字/英文标点，中文与中文标点在 Unicode 里不落它，
// 自然交给 MiSans。系统字体仍排在 globals.css 的 --font-sans 末尾做兜底。
const inter = localFont({
  src: "../fonts/Inter-Variable.woff2",
  weight: "400 600",
  style: "normal",
  display: "swap",
  variable: "--font-inter",
  adjustFontFallback: false,
  declarations: [
    {
      // 只覆盖 ASCII 可见字符与不换行空格：中文引号（U+2018/2019/201C/201D）、
      // 省略号（U+2026）、破折号（U+2013/2014）都不在这里，自动落 MiSans。
      prop: "unicode-range",
      value: "U+0020-007E, U+00A0",
    },
  ],
});

const miSans = localFont({
  src: "../fonts/MiSans-Variable.woff2",
  weight: "400 600",
  style: "normal",
  display: "swap",
  variable: "--font-misans",
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  metadataBase: new URL("https://dydata.cc"),
  title: {
    default: "DYData｜抖音数据日报平台",
    template: "%s｜DYData",
  },
  description: "面向内容团队的抖音数据日报与运营分析平台。",
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
    description: "面向内容团队的抖音数据日报与运营分析平台。",
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
    description: "面向内容团队的抖音数据日报与运营分析平台。",
    images: ["/opengraph-image"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light",
  themeColor: "#FCFCFB",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning className={`${inter.variable} ${miSans.variable}`}>
      <body className="antialiased tabular-nums">
        <MotionPreferences>{children}</MotionPreferences>
        <RouteToaster />
      </body>
    </html>
  );
}
