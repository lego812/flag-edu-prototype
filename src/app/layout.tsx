import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { PwaRegistration } from "@/components/pwa-registration";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Flag Edu",
    template: "%s | Flag Edu",
  },
  description: "코치 수업 보고와 관리자 확인을 한곳에서 관리합니다.",
  applicationName: "Flag Edu",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Flag Edu",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${geistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {children}
        <PwaRegistration />
      </body>
    </html>
  );
}
