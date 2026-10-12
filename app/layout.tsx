import type { Metadata } from "next";
import "./globals.css";
import "./refined.css";

export const metadata: Metadata = {
  title: "家有备｜家庭安全协同",
  description:
    "让家庭信号有人回应。事件跟进、家庭任务、安全授权与本机视觉监测。",
  icons: { icon: "/favicon.svg", apple: "/apple-touch-icon.png" },
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <head>
        <meta name="theme-color" content="#f7f8f5" />
      </head>
      <body>{children}</body>
    </html>
  );
}
