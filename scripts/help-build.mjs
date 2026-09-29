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
//   {pending:<id>,<id>} <text>  a paragraph only when all are met
//
// Conditions (content/help/conditions.json; the App Map's pending rules use
// the same ids): text that describes something not true yet (an app build
// not released, a migration not applied, SolvyAI not live) is left out of
// the JSON entirely, so it's in no page, list, search, the app's view,
// SolvyAI's knowledge or the JS bundle. Flipping a condition is one line in
// conditions.json + `npm run help:build`, in the PR that makes it true. An
// unknown id fails the build (a typo can't silently hide or show text).
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const CATEGORIES = {
  "01-agenda": { slug: "agenda", pt: "Agenda", en: "Schedule" },
  "02-pacientes": { slug: "pacientes", pt: "Pacientes", en: "Patients" },
  "03-pagamentos": { slug: "pagamentos", pt: "Pagamentos", en: "Payments" },
  "04-configuracoes": { slug: "configuracoes", pt: "Configurações", en: "Settings" },
  "05-conta": { slug: "conta", pt: "Conta", en: "Account" },
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
    let requires = [];
    const isMet = (cid) => {
      if (!Object.hasOwn(conditions, cid)) throw new Error(`${id}: unknown condition "${cid}"`);
      return conditions[cid].met === true;
    };
    for (const line of lines) {
      if (line === "**pt-BR**") { lang = "pt"; continue; }
      if (line === "**en**") { lang = "en"; continue; }
      let m;
      if ((m = line.match(/^\*\*No site:\*\*\s+(.+)$/))) { web.pt = m[1]; lang = null; continue; }
      if ((m = line.match(/^\*\*On the website:\*\*\s+(.+)$/))) { web.en = m[1]; lang = null; continue; }
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
      if ((m = line.match(/^\{pending:([\w#.,-]+)\}\s+(.+)$/))) {
        if (m[1].split(",").every(isMet)) a.body[lang].push(m[2]);
        continue;
      }
      a.body[lang].push(line);
    }
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
  return { slug: cat.slug, title: { pt: cat.pt, en: cat.en }, articles };
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
