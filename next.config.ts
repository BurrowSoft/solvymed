import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs/config";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Lint is advisory for now (existing findings; CI reports them without
  // gating). Without this, `next build` would fail on lint errors now that
  // ESLint is installed. Type errors still fail the build. To make lint
  // gating, remove this AND make scripts/ci-lint.mjs exit 1 on errors
  // (see the note at its top).
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

// Sentry: source maps upload at build time (org, project and auth token are
// Vercel env vars), then get deleted from the deployment so they're never
// served publicly. Without SENTRY_AUTH_TOKEN (local builds) the upload is
// skipped.
export default withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  // No build telemetry to Sentry: only runtime errors, scrubbed, are sent.
  telemetry: false,
  widenClientFileUpload: true,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  webpack: { treeshake: { removeDebugLogging: true } },
});
