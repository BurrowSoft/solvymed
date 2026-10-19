import { LOCALE_REDIRECT_PARAM } from "./signupCountry";

// Whether this visit's language was picked by the site (an automatic
// redirect marked ?lr=1 by the middleware) rather than opened by the
// visitor. Kept in memory for the page's lifetime, so a click from the
// redirected landing to another page and then to the signup still knows
// (client navigations keep it); a new page load starts over. Nothing is
// stored in the browser. Never set on the server (module state there is
// shared by every request).
let auto = false;

export function noteLocaleArrival(search: string): boolean {
  if (typeof window === "undefined") return false;
  if (new URLSearchParams(search).has(LOCALE_REDIRECT_PARAM)) auto = true;
  return auto;
}

export function autoLocaleArrival(): boolean {
  return typeof window !== "undefined" && auto;
}
