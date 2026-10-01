const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.burrowsoft.solvymed";

// The page a store button sits on, recorded as install attribution.
export type StoreMedium = "landing" | "invite";

// Play listing link with install attribution: Play passes `referrer` to the
// app's Install Referrer API, so installs can be traced to the page that
// sent them (e.g. "landing", "invite").
export function playStoreUrl(medium: StoreMedium): string {
  // Play Console groups installs by utm_source and utm_campaign, so the page
  // goes in utm_campaign.
  const referrer = `utm_source=solvymed_web&utm_medium=web&utm_campaign=${medium}`;
  return `${PLAY_STORE_URL}&referrer=${encodeURIComponent(referrer)}`;
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
