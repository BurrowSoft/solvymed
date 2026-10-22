const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.burrowsoft.solvymed";

// The page a store button sits on, recorded as install attribution.
export type StoreMedium = "landing" | "invite";

// Play listing link with install attribution: Play passes `referrer` to the
// app's Install Referrer API, so installs can be traced to the page that
// sent them (e.g. "landing", "invite").
// campaign: the visitor's own landing campaign (e.g. a YouTube episode),
// passed only with marketing consent (02; privacy §3/§4), as utm_content, so
// Play Console shows installs per episode. Campaign-level only.
export function playStoreUrl(medium: StoreMedium, campaign: string | null = null): string {
  // Play Console groups installs by utm_source and utm_campaign, so the page
  // goes in utm_campaign.
  const safe = (campaign ?? "").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 100);
  const referrer = `utm_source=solvymed_web&utm_medium=web&utm_campaign=${medium}${safe ? `&utm_content=${safe}` : ""}`;
  return `${PLAY_STORE_URL}&referrer=${encodeURIComponent(referrer)}`;
}

// solvymed.com/app (Vitor: the link in video descriptions and posters): on
// an Android phone a 302 to the Play listing with this FIXED referrer (or
// the visit's campaign with marketing consent, appShortlinkPlayTarget);
// anywhere else to the landing (F6, middleware). 302, not 308: the target
// can change (an iPhone page once the App Store exists).
export const APP_SHORTLINK_TARGET = `${PLAY_STORE_URL}&referrer=${encodeURIComponent("utm_source=solvymed&utm_medium=shortlink")}`;

// Funnel F5/F6 (specs/signup-funnel-fixes.md): the visit's own campaign as
// the Play referrer: utm_source / utm_medium / utm_campaign only (never
// click ids), and only with marketing consent (privacy §3.6: the campaign
// that brought you is used only with your consent). Null without one.
export type VisitUtm = Partial<Record<"utm_source" | "utm_medium" | "utm_campaign", string | null | undefined>>;
const REFERRER_KEYS = ["utm_source", "utm_medium", "utm_campaign"] as const;

export function visitReferrer(visit: VisitUtm | null | undefined): string | null {
  if (!visit) return null;
  const q = new URLSearchParams();
  for (const key of REFERRER_KEYS) {
    const v = (visit[key] ?? "").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 100);
    if (v) q.set(key, v);
  }
  return q.has("utm_source") || q.has("utm_campaign") ? q.toString() : null;
}

export function playStoreUrlForVisit(medium: StoreMedium, visit: VisitUtm | null | undefined): string {
  const referrer = visitReferrer(visit);
  return referrer ? `${PLAY_STORE_URL}&referrer=${encodeURIComponent(referrer)}` : playStoreUrl(medium);
}

// /app's Play target (F6): the shortlink's own referrer unless the visit
// brings its campaign (with consent).
export function appShortlinkPlayTarget(visit: VisitUtm | null | undefined): string {
  const referrer = visitReferrer(visit);
  return referrer ? `${PLAY_STORE_URL}&referrer=${encodeURIComponent(referrer)}` : APP_SHORTLINK_TARGET;
}

// Android (01; c6's row from YouTube): inside an in-app browser (a Chrome
// Custom Tab) a play.google.com link opens the Play WEBSITE, an extra step
// at the key moment. An intent:// to market:// opens the Play Store app
// with the same referrer; a browser that can't (no Play Store) follows
// S.browser_fallback_url, today's exact play.google.com link. One helper
// for every Android store link (the landing CTA, /app, the demo's chip).
export function androidStoreLink(playUrl: string): string {
  const u = new URL(playUrl);
  const id = u.searchParams.get("id") ?? "";
  const referrer = u.searchParams.get("referrer");
  const query = `id=${encodeURIComponent(id)}${referrer ? `&referrer=${encodeURIComponent(referrer)}` : ""}`;
  return `intent://details?${query}#Intent;scheme=market;package=com.android.vending;S.browser_fallback_url=${encodeURIComponent(playUrl)};end`;
}

// An Android phone (Android tablets omit "Mobile").
export function isAndroidPhone(userAgent: string | null | undefined): boolean {
  return /Android.+Mobile/i.test(userAgent ?? "");
}

// Run inline in <head> before first paint (root layout): marks Android
// phones on <html> for the CSS in globals.css. A data attribute, not a
// class, so React never rewrites it.
export const PLATFORM_SCRIPT = `try{if(/Android.+Mobile/i.test(navigator.userAgent))document.documentElement.setAttribute("data-platform","android")}catch(e){}`;

// /app, with or without a locale prefix (any case, a trailing slash).
export function isAppShortlink(pathname: string, locales: readonly string[]): boolean {
  const m = pathname.match(/^(?:\/([^/]+))?\/app\/?$/i);
  if (!m) return false;
  return !m[1] || locales.some((l) => l.toLowerCase() === m[1].toLowerCase()) || /^pt$/i.test(m[1]);
}

export type IosLink =
  | { mode: "soon" }
  | { mode: "beta"; url: string } // TestFlight public link
  | { mode: "store"; url: string }; // App Store listing

// Config-driven, so moving from "coming soon" to TestFlight to the App Store
// needs no code change: set NEXT_PUBLIC_IOS_APP_URL in Vercel and redeploy.
// Anything that isn't an https TestFlight or App Store URL counts as unset.
export function iosAppLink(medium: StoreMedium, raw = process.env.NEXT_PUBLIC_IOS_APP_URL): IosLink {
  let url: URL;
  try {
    url = new URL((raw ?? "").trim());
  } catch {
    return { mode: "soon" };
  }
  if (url.protocol !== "https:") return { mode: "soon" };
  // TestFlight links can't carry attribution parameters.
  if (url.hostname === "testflight.apple.com" && /^\/join\/[A-Za-z0-9]+$/.test(url.pathname)) {
    return { mode: "beta", url: url.toString() };
  }
  if (url.hostname === "apps.apple.com") {
    // App Store campaign tagging. `ct` shows up in App Analytics only when
    // the URL also has the provider token (`pt`), so include it in the
    // configured URL once known.
    url.searchParams.set("ct", `solvymed_web_${medium}`);
    url.searchParams.set("mt", "8");
    return { mode: "store", url: url.toString() };
  }
  return { mode: "soon" };
}

// The app's own screen a web page hands over to ("Abrir no app SolvyMed").
export const APP_OPEN_PATH = "login";

// Android: an intent URL opens the SolvyMed app when it's installed, else
// Chrome goes to its Play page (browser_fallback_url).
export function appOpenUrl(path: string = APP_OPEN_PATH): string {
  return `intent://${path}#Intent;scheme=solvymed;package=com.burrowsoft.solvymed;S.browser_fallback_url=${encodeURIComponent(playStoreUrl("invite"))};end`;
}
