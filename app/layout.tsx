import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "家有备｜家庭应急 AI Agent",
  description: "家庭应急 AI Agent 交互应用",
  icons: { icon: "/favicon.svg" },
  manifest: "/manifest.json",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0f2f2c" />
      </head>
      <body>{children}</body>
    </html>
  );
}
