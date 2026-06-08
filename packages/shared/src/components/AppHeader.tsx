import type { ReactNode } from "react";

export interface AppHeaderProps {
  /** Logo section — typically a Link wrapping Image + site name. Rendered on the left. */
  logo: ReactNode;
  /** Optional flex-1 middle slot — use for search bars (games, shopping). */
  expand?: ReactNode;
  /** Right-side items — locale selector, nav links, misc badges. */
  right?: ReactNode;
  /** Dark variant for apps with dark backgrounds (games). */
  dark?: boolean;
}

/**
 * Shared header chrome used across all BurrowSoft apps.
 * Provides consistent sticky positioning, backdrop blur, and border.
 * Content is fully controlled by the consuming app via slots.
 */
export function AppHeader({ logo, expand, right, dark = false }: AppHeaderProps) {
  return (
    <header
      className={[
        "sticky top-0 z-50 border-b backdrop-blur",
        dark
          ? "border-white/5 bg-[#0d0d14]/95"
          : "border-slate-200 bg-white/95",
      ].join(" ")}
    >
      <nav
        className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3"
        aria-label="Main navigation"
      >
        <div className="shrink-0">{logo}</div>
        {expand != null && <div className="min-w-0 flex-1">{expand}</div>}
        {right != null && (
          <div className="flex shrink-0 items-center gap-3">{right}</div>
        )}
      </nav>
    </header>
  );
}
