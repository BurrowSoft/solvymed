import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

const MESSAGES = {
  en:      () => import("../messages/en.json"),
  th:      () => import("../messages/th.json"),
  es:      () => import("../messages/es.json"),
  ru:      () => import("../messages/ru.json"),
  "pt-BR": () => import("../messages/pt-BR.json"),
  fr:      () => import("../messages/fr.json"),
  ja:      () => import("../messages/ja.json"),
  zh:      () => import("../messages/zh.json"),
  "zh-TW": () => import("../messages/zh-TW.json"),
  ar:      () => import("../messages/ar.json"),
  de:      () => import("../messages/de.json"),
  id:      () => import("../messages/id.json"),
  ko:      () => import("../messages/ko.json"),
  it:      () => import("../messages/it.json"),
  vi:      () => import("../messages/vi.json"),
} as const;

type Locale = keyof typeof MESSAGES;

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;
  if (!locale || !(routing.locales as readonly string[]).includes(locale)) {
    locale = routing.defaultLocale;
  }
  const messages = (await MESSAGES[locale as Locale]()).default as Record<string, unknown>;
  return { locale, messages };
});
