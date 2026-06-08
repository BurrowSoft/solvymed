import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://www.solvymed.com"),
  title: {
    default: "Solvymed — Medical Practice Management",
    template: "%s | Solvymed",
  },
  description:
    "Solvymed is the all-in-one practice management app for healthcare professionals. Smart scheduling, patient records, prescriptions, and integrated payments — all in one place.",
  keywords: [
    "medical practice management",
    "appointment scheduling",
    "patient management",
    "clinical records",
    "digital prescriptions",
    "healthcare app",
    "medical billing",
  ],
  openGraph: {
    type: "website",
    url: "https://www.solvymed.com",
    siteName: "Solvymed",
    title: "Solvymed — Medical Practice Management",
    description:
      "The all-in-one practice management app for healthcare professionals.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Solvymed — Medical Practice Management",
    description:
      "The all-in-one practice management app for healthcare professionals.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0d9488",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.className}>
      <body className="bg-white text-slate-900 antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
