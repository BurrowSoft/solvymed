// Minimal Next.js lint config (flat config for ESLint 9). Lint reports in
// CI but doesn't gate merges yet; see .github/workflows/ci.yml.
import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

export default [
  {
    // Flat config doesn't read .gitignore; keep generated output out.
    ignores: [
      ".next/**", "node_modules/**", "out/**", "build/**", "coverage/**", ".vercel/**",
      "playwright-report/**", "test-results/**", "eslint-report.json", "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];
