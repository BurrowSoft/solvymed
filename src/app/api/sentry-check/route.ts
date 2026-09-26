// Preview-only: throws a test error so a deploy can be checked end to end
// (the event reaches Sentry, the stack trace resolves through the uploaded
// source maps, and the scrubber masks the fake personal data in the
// message). A 404 everywhere else, including production.
export const dynamic = "force-dynamic";

export function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return new Response("Not found", { status: 404 });
  }
  // The fake data is assembled at runtime, so it only exists in the error
  // message (which must come out masked), never literally in this source
  // line, which Sentry shows as the stack frame's context.
  const email = ["maria.teste", "example.com"].join("@");
  const cpf = ["123", "456", "789"].join(".") + "-09";
  const phone = ["+55", "11", "91234"].join(" ") + "-5678";
  throw new Error(`sentry-check: test error for ${email}, CPF ${cpf}, phone ${phone}`);
}
