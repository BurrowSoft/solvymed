// CI lint runner (advisory): runs ESLint once, prints every finding, writes
// the totals to the job summary (GitHub shows only ~10+10 annotations), and
// exits 1 on errors. An ESLint crash (bad config, missing plugin) exits 2
// and says so in the summary, so it's never mistaken for "findings".
import { ESLint } from "eslint";
import { appendFileSync } from "node:fs";
import { relative } from "node:path";

function summary(text) {
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
}

let results;
try {
  results = await new ESLint().lintFiles(["."]);
} catch (err) {
  console.error("ESLint failed to run:", err);
  // The step is advisory (the job stays green), so make a crash visible.
  summary("### Lint (advisory)\n\n⚠️ ESLint failed to run (see the step log). No findings were checked.");
  process.exit(2);
}

let errors = 0;
let warnings = 0;
for (const file of results) {
  errors += file.errorCount;
  warnings += file.warningCount;
  for (const m of file.messages) {
    const level = m.severity === 2 ? "error" : "warning";
    const path = relative(process.cwd(), file.filePath).split("\\").join("/");
    // Workflow command, so GitHub also annotates the ones it has room for.
    console.log(`::${level} file=${path},line=${m.line ?? 1},col=${m.column ?? 1}::${m.message} (${m.ruleId ?? "eslint"})`);
  }
}

summary(`### Lint (advisory)\n\n${errors} errors, ${warnings} warnings`);
process.exit(errors > 0 ? 1 : 0);
