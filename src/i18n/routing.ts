import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "th", "es", "ru", "pt-BR", "fr", "ja", "zh", "zh-TW", "ar", "de", "id", "ko", "it", "vi"],
  defaultLocale: "en",
  localePrefix: "as-needed",
});
