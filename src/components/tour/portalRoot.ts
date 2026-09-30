// Overlays portal into the dashboard's theme scope ([data-theme-root], the
// layout's display: contents wrapper), so the dark theme reaches them too
// (Help C8); outside the dashboard, the body.
export function portalRoot(): HTMLElement {
  return (document.querySelector("[data-theme-root]") as HTMLElement | null) ?? document.body;
}
