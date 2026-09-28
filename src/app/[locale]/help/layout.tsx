import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { pickMessages } from "@/lib/pickMessages";

// The Help Center hands its client components only the messages they use
// (the footer's cookie-settings button). The page source then carries no
// other strings: opened from the apps, it must not include subscription or
// pricing copy, even hidden (store rules; UX). Its own texts come from the
// help articles, rendered on the server.
const HELP_CLIENT_NAMESPACES = ["footer"] as const;

export default async function HelpLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const messages = await getMessages();
  return (
    <NextIntlClientProvider locale={locale} messages={pickMessages(messages, HELP_CLIENT_NAMESPACES)}>
      {children}
    </NextIntlClientProvider>
  );
}
