export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.burrowsoft.solvymed";

// Play listing link with install attribution: Play passes `referrer` to the
// app's Install Referrer API, so installs can be traced to the page that
// sent them (e.g. "landing", "invite").
export function playStoreUrl(medium: string): string {
  const referrer = `utm_source=solvymed_web&utm_medium=${medium}`;
  return `${PLAY_STORE_URL}&referrer=${encodeURIComponent(referrer)}`;
}
