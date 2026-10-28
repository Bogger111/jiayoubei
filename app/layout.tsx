import type { Metadata } from "next";
import "./globals.css";
import "./refined.css";
import "./competition.css";
import "./quiet-glass.css";

export const metadata: Metadata = {
  title: "家有备｜多模态家庭协作助手",
  description:
    "让远方的关心，变成行动。理解家庭情况，安排家人和设备，持续跟进每一份牵挂。",
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
