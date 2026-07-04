import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AppLayout } from "@/components/ui/app-layout";
import { BookmarkProvider } from "@/lib/bookmark-context";
import { ConversationProvider } from "@/lib/conversation-context";
import { ServiceWorkerRegister } from "@/components/service-worker-register";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Lingua Chat AI",
  description: "AI-powered voice chat application with real-time speech recognition and text-to-speech",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Lingua Chat AI",
  },
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: "cover",
  },
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <BookmarkProvider>
          <ConversationProvider>
            <AppLayout>
              {children}
            </AppLayout>
            <ServiceWorkerRegister />
          </ConversationProvider>
        </BookmarkProvider>
      </body>
    </html>
  );
}
