// Removes a one-shot query parameter (e.g. ?new=1 after its dialog opened)
// from the address bar without navigating, so a reload or a shared URL
// doesn't reopen it.
export function dropQueryParam(name: string) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(name)) return;
  url.searchParams.delete(name);
  window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
}
