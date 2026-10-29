import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { tipsTogglesLive } from "@/lib/tips";

// A personal link from an e-mail: never indexed, and the token in the URL is
// never sent on as a Referer (cf). Dark until tips-toggles-live (276 live).
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

// The page reads ?t= (useSearchParams), which needs a Suspense boundary.
export default function TipsUnsubscribeLayout({ children }: { children: React.ReactNode }) {
  if (!tipsTogglesLive()) notFound();
  return <Suspense>{children}</Suspense>;
}
