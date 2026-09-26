// Preview-only: throws a test error so a deploy can be checked end to end
// (the event reaches Sentry, the stack trace resolves through the uploaded
// source maps, and the scrubber masks the fake personal data in the
// message). A 404 everywhere else, including production.
export const dynamic = "force-dynamic";

export function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return new Response("Not found", { status: 404 });
  }
  throw new Error(
    "sentry-check: test error for maria.teste@example.com, CPF 123.456.789-09, phone +55 11 91234-5678",
  );
}
