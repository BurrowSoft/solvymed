import type { AbstractIntlMessages } from "next-intl";

// Only these namespaces of the messages: what a route's client components
// need. Whatever is passed to NextIntlClientProvider ends up in the page
// source, so pages that must not carry other strings (the Help Center
// opened from the apps: no subscription copy) pass a small set.
export function pickMessages(messages: AbstractIntlMessages, namespaces: readonly string[]): AbstractIntlMessages {
  return Object.fromEntries(namespaces.filter((ns) => ns in messages).map((ns) => [ns, messages[ns]]));
}
