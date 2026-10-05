// Builds src/content/helpArticles.json from content/help/*.md (the Help
// articles by UX & PM, with the web dev's "**No site:**" notes). Run after
// editing an article: `npm run help:build`. The help-articles test fails if
// the JSON is out of date, so the two can't drift.
//
// Article format:
//   ## A1. Título pt / Title en
//   **pt-BR**
//   <lines: "1. step" or a paragraph>
//   **en**
//   <lines>
//   **No site:** <web note pt>          (optional)
//   **On the website:** <web note en>   (optional)
//   `open:<screen>`
//   Note for SolvyAI: ... In the apps: "<pt>" / "<en>".   (optional)
//   `requires:<id>,<id>`   (optional) the whole article only when all are met
//   Thai title: "<th title>"            (optional, with a **th** block)
//   **th**                               (optional) the Thai text
//   <lines>
//   **ในเว็บไซต์:** <web note th>        (optional, with a **th** block)
//   {pending:<id>,<id>} <text>  a paragraph only when all are met
//   **No site:** {pending:<id>} <note> / **No site:** {unless:<id>} <note>
//     a web note (pt and en alike) only when the conditions are all met /
//     not all met: the note for before and after a feature reaches the
//     website, so flipping the condition swaps them.
//
// Conditions (content/help/conditions.json; the App Map's pending rules use
// the same ids): text that describes something not true yet (an app build
// not released, a migration not applied, SolvyAI not live) is left out of
// the JSON entirely, so it's in no page, list, search, the app's view,
// SolvyAI's knowledge or the JS bundle. Flipping a condition is one line in
// conditions.json + `npm run help:build`, in the PR that makes it true. An
// unknown id fails the build (a typo can't silently hide or show text).
//
// Thai (cf, 7 Oct): an article may carry a Thai title, text and web note
// (labels from the th i18n strings). They reach the JSON only once
// help-th-live is met (after Vitor's first pass); until then the JSON is
// exactly as before. Articles without Thai read in English for Thai users.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// th: the apps' tab names (th i18n: tab.schedule, tab.patients…).
export const CATEGORIES = {
  "01-agenda": { slug: "agenda", pt: "Agenda", en: "Schedule", th: "ตารางงาน" },
  "02-pacientes": { slug: "pacientes", pt: "Pacientes", en: "Patients", th: "ผู้ป่วย" },
  "03-pagamentos": { slug: "pagamentos", pt: "Pagamentos", en: "Payments", th: "การชำระเงิน" },
  "04-configuracoes": { slug: "configuracoes", pt: "Configurações", en: "Settings", th: "การตั้งค่า" },
  "05-conta": { slug: "conta", pt: "Conta", en: "Account", th: "บัญชี" },
};

function blocks(lines) {
  const out = [];
  for (const line of lines) {
    const m = line.match(/^(\d+)\.\s+(.*)$/);
    if (m) {
      const last = out[out.length - 1];
      if (last?.type === "ol") last.items.push(m[2]);
      else out.push({ type: "ol", items: [m[2]] });
    } else {
      out.push({ type: "p", text: line });
    }
  }
  return out;
}

export function parseBatch(file, text, conditions = {}) {
  const cat = CATEGORIES[file];
  if (!cat) throw new Error(`unknown help file ${file}`);
  const articles = [];
  for (const chunk of text.split(/^## /m).slice(1)) {
    const lines = chunk.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && l !== "---");
    const head = lines.shift().match(/^(\w+)\.\s+(.+?)\s+\/\s+(.+)$/);
    if (!head) throw new Error(`${file}: bad article title in "${chunk.slice(0, 40)}"`);
    const [, id, ptTitle, enTitle] = head;
    const a = { id, category: cat.slug, title: { pt: ptTitle, en: enTitle }, body: { pt: [], en: [] }, web: null, webUnavailable: false, open: null, appOnly: null, appTitle: null };
    let lang = null;
    const web = {};
    const th = { title: null, body: [], web: null };
    let requires = [];
    const isMet = (cid) => {
      if (!Object.hasOwn(conditions, cid)) throw new Error(`${id}: unknown condition "${cid}"`);
      return conditions[cid].met === true;
    };
    for (const line of lines) {
      if (line === "**pt-BR**") { lang = "pt"; continue; }
      if (line === "**en**") { lang = "en"; continue; }
      if (line === "**th**") { lang = "th"; continue; }
      let m;
      if ((m = line.match(/^Thai title: "([^"]+)"$/))) { th.title = m[1]; lang = null; continue; }
      if ((m = line.match(/^\*\*ในเว็บไซต์:\*\*\s+(.+)$/))) {
        lang = null;
        const held = m[1].match(/^\{(pending|unless):([\w#.,-]+)\}\s+(.+)$/);
        if (!held) { th.web = m[1]; continue; }
        const all = held[2].split(",").map(isMet).every(Boolean);
        if (all === (held[1] === "pending")) th.web = held[3];
        continue;
      }
      if ((m = line.match(/^\*\*(No site|On the website):\*\*\s+(.+)$/))) {
        lang = null;
        const key = m[1] === "No site" ? "pt" : "en";
        const held = m[2].match(/^\{(pending|unless):([\w#.,-]+)\}\s+(.+)$/);
        if (!held) { web[key] = m[2]; continue; }
        const all = held[2].split(",").map(isMet).every(Boolean);
        if (all === (held[1] === "pending")) web[key] = held[3];
        continue;
      }
      if ((m = line.match(/^`open:([\w-]+)`$/))) { a.open = m[1] === "none" ? null : m[1]; lang = null; continue; }
      if ((m = line.match(/^`requires:([\w#.,-]+)`$/))) { requires = m[1].split(","); requires.forEach(isMet); continue; }
      if (line.startsWith("Note for SolvyAI:")) {
        m = line.match(/In the apps: "([^"]+)" \/ "([^"]+)"/);
        if (!m) throw new Error(`${id}: a SolvyAI note without the apps' text`);
        a.appOnly = { pt: m[1], en: m[2] };
        continue;
      }
      if ((m = line.match(/^App title: "([^"]+)" \/ "([^"]+)"$/))) {
        a.appTitle = { pt: m[1], en: m[2] };
        continue;
      }
      if (!lang) throw new Error(`${id}: text outside a language block: "${line.slice(0, 50)}"`);
      const into = lang === "th" ? th.body : a.body[lang];
      if ((m = line.match(/^\{pending:([\w#.,-]+)\}\s+(.+)$/))) {
        // Every id checked (an unknown one fails the build), then all must be met.
        if (m[1].split(",").map(isMet).every(Boolean)) into.push(m[2]);
        continue;
      }
      into.push(line);
    }
    if (th.body.length && !th.title) throw new Error(`${id}: Thai text without a Thai title`);
    if (th.title && !th.body.length) throw new Error(`${id}: a Thai title without Thai text`);
    if (th.web && !web.en) throw new Error(`${id}: a Thai web note without the pt/en ones`);
    if (th.body.length && isMet("help-th-live")) a.th = { title: th.title, body: blocks(th.body), web: th.web };
    if (!a.body.pt.length || !a.body.en.length) throw new Error(`${id}: missing pt-BR or en text`);
    if (!!web.pt !== !!web.en) throw new Error(`${id}: the web note needs both pt-BR and en`);
    if (a.appTitle && !a.appOnly) throw new Error(`${id}: an app title without the apps' text`);
    a.body = { pt: blocks(a.body.pt), en: blocks(a.body.en) };
    if (web.pt) a.web = web;
    // The web note says the feature isn't on the website: no "Open on the
    // website" button then (the three phrasings the notes use).
    a.webUnavailable = !!web.en && /^(Not available on the website|Doesn't apply to the website|Reminders and notifications are app features)/.test(web.en);
    if (requires.some((cid) => !isMet(cid))) continue;
    articles.push(a);
  }
  // The Thai category name only once Thai is live (the JSON unchanged before).
  const thLive = Object.hasOwn(conditions, "help-th-live") && conditions["help-th-live"].met === true;
  return { slug: cat.slug, title: { pt: cat.pt, en: cat.en }, ...(thLive ? { titleTh: cat.th } : {}), articles };
}

export function readConditions(dir) {
  return JSON.parse(readFileSync(resolve(dir, "conditions.json"), "utf8"));
}

export function buildAll(dir) {
  const conditions = readConditions(dir);
  return readdirSync(dir)
    .filter((f) => /^\d\d-.+\.md$/.test(f))
    .sort()
    .map((f) => parseBatch(f.replace(/\.md$/, ""), readFileSync(resolve(dir, f), "utf8"), conditions));
}

// CLI: write the JSON.
if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("help-build.mjs")) {
  const data = buildAll(resolve("content/help"));
  writeFileSync(resolve("src/content/helpArticles.json"), JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`Wrote ${data.reduce((n, c) => n + c.articles.length, 0)} articles in ${data.length} categories.`);
}
