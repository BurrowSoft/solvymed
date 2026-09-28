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

export function parseBatch(file, text) {
  const cat = CATEGORIES[file];
  if (!cat) throw new Error(`unknown help file ${file}`);
  const articles = [];
  for (const chunk of text.split(/^## /m).slice(1)) {
    const lines = chunk.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && l !== "---");
    const head = lines.shift().match(/^(\w+)\.\s+(.+?)\s+\/\s+(.+)$/);
    if (!head) throw new Error(`${file}: bad article title in "${chunk.slice(0, 40)}"`);
    const [, id, ptTitle, enTitle] = head;
    const a = { id, category: cat.slug, title: { pt: ptTitle, en: enTitle }, body: { pt: [], en: [] }, web: null, open: null, appOnly: null };
    let lang = null;
    const web = {};
    for (const line of lines) {
      if (line === "**pt-BR**") { lang = "pt"; continue; }
      if (line === "**en**") { lang = "en"; continue; }
      let m;
      if ((m = line.match(/^\*\*No site:\*\*\s+(.+)$/))) { web.pt = m[1]; lang = null; continue; }
      if ((m = line.match(/^\*\*On the website:\*\*\s+(.+)$/))) { web.en = m[1]; lang = null; continue; }
      if ((m = line.match(/^`open:([\w-]+)`$/))) { a.open = m[1] === "none" ? null : m[1]; lang = null; continue; }
      if (line.startsWith("Note for SolvyAI:")) {
        m = line.match(/In the apps: "([^"]+)" \/ "([^"]+)"/);
        if (!m) throw new Error(`${id}: a SolvyAI note without the apps' text`);
        a.appOnly = { pt: m[1], en: m[2] };
        continue;
      }
      if (!lang) throw new Error(`${id}: text outside a language block: "${line.slice(0, 50)}"`);
      a.body[lang].push(line);
    }
    if (!a.body.pt.length || !a.body.en.length) throw new Error(`${id}: missing pt-BR or en text`);
    if (!!web.pt !== !!web.en) throw new Error(`${id}: the web note needs both pt-BR and en`);
    a.body = { pt: blocks(a.body.pt), en: blocks(a.body.en) };
    if (web.pt) a.web = web;
    articles.push(a);
  }
  return { slug: cat.slug, title: { pt: cat.pt, en: cat.en }, articles };
}

export function buildAll(dir) {
  return readdirSync(dir)
    .filter((f) => /^\d\d-.+\.md$/.test(f))
    .sort()
    .map((f) => parseBatch(f.replace(/\.md$/, ""), readFileSync(resolve(dir, f), "utf8")));
}

// CLI: write the JSON.
if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("help-build.mjs")) {
  const data = buildAll(resolve("content/help"));
  writeFileSync(resolve("src/content/helpArticles.json"), JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`Wrote ${data.reduce((n, c) => n + c.articles.length, 0)} articles in ${data.length} categories.`);
}
