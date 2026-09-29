import data from "@/content/helpArticles.json";

// The public Help Center (Enhancing UX; specs/help, specs/assistant.md §5):
// articles by UX & PM in pt-BR and en (other languages later), with the
// web's differences as a "No site / On the website" note. Built from
// content/help/*.md by `npm run help:build`.

export type HelpLang = "pt" | "en";
export type HelpBlock = { type: "ol"; items: string[] } | { type: "p"; text: string };
export type HelpArticle = {
  id: string;
  category: string;
  title: Record<HelpLang, string>;
  body: Record<HelpLang, HelpBlock[]>;
  web: Record<HelpLang, string> | null;
  // The web note says the feature isn't on the website (no "Open on the
  // website" button).
  webUnavailable: boolean;
  open: string | null;
  // Opened from the apps (?app=1), this text replaces the article: no
  // prices, buying or subscribing on the website (store rules).
  appOnly: Record<HelpLang, string> | null;
  // And its neutral title there (e.g. "Your account", not "subscription").
  appTitle: Record<HelpLang, string> | null;
};

// The title a reader sees: the app variant's neutral one when there is one.
export function articleTitle(a: HelpArticle, lang: HelpLang, app: boolean): string {
  return app && a.appTitle ? a.appTitle[lang] : a.title[lang];
}
export type HelpCategory = { slug: string; title: Record<HelpLang, string>; articles: HelpArticle[] };

export const HELP: HelpCategory[] = data as HelpCategory[];

// The Help Center's own words, in the articles' two languages.
export const HELP_UI: Record<HelpLang, Record<string, string>> = {
  pt: {
    title: "Central de Ajuda",
    subtitle: "Passo a passo para usar o SolvyMed.",
    search: "Buscar na ajuda",
    searchPlaceholder: "Ex.: bloquear horário, Pix, secretária",
    noResults: "Nenhum artigo encontrado. Tente outras palavras ou escreva para o suporte.",
    onTheWebsite: "No site",
    openOnWebsite: "Abrir no site",
    back: "← Central de Ajuda",
    support: "Ainda precisa de ajuda? Escreva para",
  },
  en: {
    title: "Help Center",
    subtitle: "Step-by-step guides for SolvyMed.",
    search: "Search help",
    searchPlaceholder: "e.g. block time, Pix, secretary",
    noResults: "No articles found. Try other words or email support.",
    onTheWebsite: "On the website",
    openOnWebsite: "Open on the website",
    back: "← Help Center",
    support: "Still need help? Email",
  },
};

// Brazilian Portuguese for pt-BR; English for every other language (the
// articles only exist in those two for now).
export function helpLang(locale: string): HelpLang {
  return locale === "pt-BR" ? "pt" : "en";
}

export function articleSlug(a: Pick<HelpArticle, "id">): string {
  return a.id.toLowerCase();
}

export function findArticle(slug: string): { article: HelpArticle; category: HelpCategory } | null {
  for (const category of HELP) {
    const article = category.articles.find((a) => articleSlug(a) === slug.toLowerCase());
    if (article) return { article, category };
  }
  return null;
}

// "**bold**" → segments; everything else is plain text (rendered escaped).
export function inlineSegments(text: string): { bold: boolean; text: string }[] {
  const out: { bold: boolean; text: string }[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ bold: false, text: text.slice(last, m.index) });
    out.push({ bold: true, text: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ bold: false, text: text.slice(last) });
  return out;
}

const plain = (s: string) => s.replace(/\*\*/g, "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

// The articles whose title or text contain every word of the query
// (accents and case ignored). Only what the variant SHOWS is searched: in
// the app variant, the app title and text, never the web notes.
// The articles that best match a question in plain words (no model): for
// SolvyAI's fallback when it's unavailable. Words shared with the article
// count once, with its title twice; stems match ("bloquear"/"bloqueio").
// At most `n`, best first, and only real matches.
const RANK_STOP = new Set(["como", "para", "uma", "que", "com", "meu", "minha", "the", "how", "can", "what", "does", "and", "you", "your", "sobre", "fazer", "posso", "quero", "want"]);
export function rankHelp(question: string, lang: HelpLang, app: boolean, n = 3): HelpArticle[] {
  const words = plain(question).split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !RANK_STOP.has(w));
  if (!words.length) return [];
  const scored = HELP.flatMap((c) => c.articles).map((a) => {
    const title = plain(articleTitle(a, lang, app));
    const text = plain([title, ...(app && a.appOnly ? [a.appOnly[lang]] : a.body[lang].flatMap((b) => (b.type === "ol" ? b.items : [b.text])))].join(" "));
    const score = words.reduce((s, w) => {
      const stem = w.slice(0, Math.max(4, w.length - 3));
      return s + (text.includes(stem) ? 1 : 0) + (title.includes(stem) ? 1 : 0);
    }, 0);
    return { a, score };
  });
  return scored.filter((x) => x.score >= 2).sort((x, y) => y.score - x.score).slice(0, n).map((x) => x.a);
}

export function searchHelp(query: string, lang: HelpLang, app: boolean): HelpArticle[] {
  const words = plain(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return HELP.flatMap((c) => c.articles).filter((a) => {
    const text = plain([
      articleTitle(a, lang, app),
      ...(app && a.appOnly ? [a.appOnly[lang]] : a.body[lang].flatMap((b) => (b.type === "ol" ? b.items : [b.text]))),
      app ? "" : a.web?.[lang] ?? "",
    ].join(" "));
    return words.every((w) => text.includes(w));
  });
}

// "Open on the website" for an article's screen (help deep link ids), when
// the website has that screen.
const WEB_SCREENS: Record<string, string> = {
  home: "/dashboard",
  schedule: "/dashboard/schedule",
  "new-appointment": "/dashboard/schedule",
  patients: "/dashboard/patients",
  "new-patient": "/dashboard/patients?new=1",
  payments: "/dashboard/payments",
  settings: "/dashboard/settings",
  "settings-profile": "/dashboard/settings",
  "settings-hours": "/dashboard/settings",
  "settings-procedures": "/dashboard/settings#procedures",
  "settings-team": "/dashboard/settings",
  "settings-financial": "/dashboard/settings#clinic",
};

export function webScreen(open: string | null): string | null {
  return open ? WEB_SCREENS[open] ?? null : null;
}
