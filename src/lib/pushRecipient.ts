// The website's 15 locales → what set_my_locale (117) stores, so the
// server-sent pushes (171) reach each person in their language. The website
// has languages the app doesn't; those aren't saved, so they never replace
// the language someone chose in the app.
//
// (The website no longer reads anyone's push tokens: every push is queued
// for the server, lib/serverNotice; c6's security finding.)
const SAVED: Record<string, string> = { "pt-BR": "pt-BR", en: "en", fr: "fr-FR", de: "de-DE", it: "it-IT", es: "es-ES", th: "th" };
export function savedLocaleFor(webLocale: string): string | null {
  return SAVED[webLocale] ?? null;
}
