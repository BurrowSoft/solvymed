// Prints the Vercel Preview URL of a commit, waiting until it's ready, from
// GitHub's deployment statuses (the smoke suite's E2E_BASE_URL). Uses the
// gh CLI; no Vercel CLI, no log streaming.
//   node scripts/preview-url.mjs <sha> [--timeout=900]
import { execFileSync } from "node:child_process";

const sha = process.argv[2];
if (!/^[0-9a-f]{7,40}$/.test(sha ?? "")) {
  console.error("usage: node scripts/preview-url.mjs <sha> [--timeout=seconds]");
  process.exit(2);
}
const timeoutS = Number((process.argv.find((a) => a.startsWith("--timeout=")) ?? "--timeout=900").split("=")[1]);
const gh = (path) => JSON.parse(execFileSync("gh", ["api", path], { encoding: "utf8" }));
const repo = execFileSync("gh", ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"], { encoding: "utf8" }).trim();

const until = Date.now() + timeoutS * 1000;
while (Date.now() < until) {
  const deployments = gh(`repos/${repo}/deployments?sha=${sha}&per_page=20`).filter((d) => /preview/i.test(d.environment));
  for (const d of deployments) {
    const [latest] = gh(`repos/${repo}/deployments/${d.id}/statuses?per_page=1`);
    if (latest?.state === "success" && latest.environment_url) {
      console.log(latest.environment_url);
      process.exit(0);
    }
    if (latest?.state === "failure" || latest?.state === "error") {
      console.error(`deployment ${d.id} ${latest.state}`);
      process.exit(1);
    }
  }
  await new Promise((r) => setTimeout(r, 15_000));
}
console.error(`no ready Preview for ${sha} after ${timeoutS}s`);
process.exit(1);
