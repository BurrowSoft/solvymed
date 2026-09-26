export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.burrowsoft.solvymed";

// Play listing link with install attribution: Play passes `referrer` to the
// app's Install Referrer API, so installs can be traced to the page that
// sent them (e.g. "landing", "invite").
export function playStoreUrl(medium: string): string {
  const referrer = `utm_source=solvymed_web&utm_medium=${medium}`;
  return `${PLAY_STORE_URL}&referrer=${encodeURIComponent(referrer)}`;
}

export type IosLink =
  | { mode: "soon" }
  | { mode: "beta"; url: string } // TestFlight public link
  | { mode: "store"; url: string }; // App Store listing

// Config-driven, so moving from "coming soon" to TestFlight to the App Store
// needs no code change: set NEXT_PUBLIC_IOS_APP_URL in Vercel and redeploy.
// Anything that isn't an https TestFlight or App Store URL counts as unset.
export function iosAppLink(medium: string, raw = process.env.NEXT_PUBLIC_IOS_APP_URL): IosLink {
  let url: URL;
  try {
    url = new URL((raw ?? "").trim());
  } catch {
    return { mode: "soon" };
  }
  if (url.protocol !== "https:") return { mode: "soon" };
  // TestFlight links can't carry attribution parameters.
  if (url.hostname === "testflight.apple.com" && url.pathname.startsWith("/join/")) {
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
