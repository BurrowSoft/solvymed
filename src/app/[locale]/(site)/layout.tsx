import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { PendingSignOut } from "@/components/PendingSignOut";

// The site and the dashboard: their client components may use any message.
export default async function SiteLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const messages = await getMessages();
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {/* A sign-out made offline, finished on the server (lib/signOut). */}
      <PendingSignOut />
      {children}
    </NextIntlClientProvider>
  );
}
