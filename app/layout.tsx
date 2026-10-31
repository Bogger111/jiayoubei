import type { Metadata } from "next";
import "./globals.css";
import "./refined.css";
import "./competition.css";
import "./quiet-glass.css";

export const metadata: Metadata = {
  title: "家有备｜多模态家庭协作中枢",
  description:
    "看见家里，听懂家人，协同全家。把视觉事件、自然表达、家人与设备的安排放到同一个家庭空间。",
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
