// Cloudflare Turnstile is DORMANT unless NEXT_PUBLIC_TURNSTILE_SITE_KEY is
// set (inlined at build). A plain module so server components (the privacy
// page's Cloudflare row) and client components read the same flag.
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
export const turnstileEnabled = TURNSTILE_SITE_KEY !== "";
