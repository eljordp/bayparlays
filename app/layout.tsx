import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "BayParlays — AI-Powered Parlay Optimizer",
  description: "Find +EV parlays with the best odds across every sportsbook. AI-driven picks, real math, no guessing.",
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    title: "BayParlays",
    description: "AI-powered parlay optimizer. Best odds. Real edge.",
    siteName: "BayParlays",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased font-sans`}>
        {children}
      </body>
    </html>
  );
}
