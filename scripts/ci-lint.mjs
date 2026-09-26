// CI lint runner. Lint is advisory until the existing findings are cleaned
// up, so findings never fail the step: they're printed (as ::warning
// annotations, with path:line:col in the text since GitHub annotates only
// ~10 per type) and totalled in the job summary, and the runner exits 0.
// Anything else (ESLint failing to load or run, a file it can't parse, a
// bug in this script) exits non-zero, so the "Lint" check goes red and a
// crash can't pass as findings. To make lint gating later: exit 1 when errors > 0, and remove
// eslint.ignoreDuringBuilds in next.config.ts.
import { appendFileSync } from "node:fs";
import { relative } from "node:path";

// Workflow-command escaping (see GitHub's "workflow commands" docs).
const escapeData = (s) => String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const escapeProperty = (s) => escapeData(s).replace(/:/g, "%3A").replace(/,/g, "%2C");

function summary(text) {
  console.log(text);
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  try {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
  } catch (err) {
    // A failed summary write isn't a lint failure; the log has the totals.
    console.error("Couldn't write the job summary:", err);
  }
}

async function main() {
  const { ESLint } = await import("eslint");
  const results = await new ESLint().lintFiles(["."]);

  // Fatal messages (e.g. "Parsing error") mean ESLint couldn't lint the
  // file at all, so no rules ran: that's a broken setup, not findings.
  const fatal = results.flatMap((file) =>
    file.messages.filter((m) => m.fatal).map((m) => `${relative(process.cwd(), file.filePath)}:${m.line ?? 1} ${m.message}`),
  );
  if (fatal.length > 0) {
    throw new Error(`ESLint couldn't parse ${fatal.length} file(s), so no rules ran on them:\n${fatal.join("\n")}`);
  }

  let errors = 0;
  let warnings = 0;
  for (const file of results) {
    errors += file.errorCount;
    warnings += file.warningCount;
    const path = relative(process.cwd(), file.filePath).split("\\").join("/");
    for (const m of file.messages) {
      const line = m.line ?? 1;
      const col = m.column ?? 1;
      const level = m.severity === 2 ? "error" : "warning";
      const text = `${path}:${line}:${col} ${level}: ${m.message} (${m.ruleId ?? "eslint"})`;
      console.log(`::warning file=${escapeProperty(path)},line=${line},col=${col}::${escapeData(text)}`);
    }
  }

  summary(`### Lint (advisory)\n\n${errors} errors, ${warnings} warnings`);
}

try {
  await main();
} catch (err) {
  console.error("Lint runner failed:", err);
  summary("### Lint (advisory)\n\n⚠️ The lint runner failed (see the step log). No findings were checked.");
  process.exit(2);
}
