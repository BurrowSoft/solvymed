import type { ReactNode } from "react";
import { BurrowSoftIcon } from "./icons";

export interface AppFooterProps {
  /** Support email address shown in the bottom bar. */
  supportEmail: string;
  /**
   * Tailwind hover color class applied to sibling product links.
   * e.g. "hover:text-sky-600", "hover:text-emerald-400"
   * Defaults to neutral slate.
   */
  accentHoverClass?: string;
  /** Dark variant — adjusts text and border colors for dark-background pages. */
  dark?: boolean;
  /**
   * Optional attribution line rendered in the bottom bar.
   * e.g. <>Powered by <a href="...">Twitch</a> &amp; IGDB</>
   */
  attribution?: ReactNode;
  /**
   * App-specific top section (footer columns with internal links).
   * Rendered above the shared siblings row.
   */
  children?: ReactNode;
  /**
   * Current site name to exclude from the siblings list.
   * e.g. "FlyMole" — so FlyMole doesn't link to itself.
   */
  currentSite?: string;
}

const SIBLINGS = [
  { name: "FlyMole", href: "https://www.flymole.com" },
  { name: "BookingMole", href: "https://www.bookingmole.com" },
  { name: "InsightMole", href: "https://www.insightmole.com" },
  { name: "RentACarMole", href: "https://www.rentacarmole.com" },
  { name: "GamesMole", href: "https://www.gamesmole.com" },
  { name: "ShoppingMole", href: "https://www.shoppingmole.com" },
];

/**
 * Shared footer used across all BurrowSoft product apps.
 * Renders the app-specific top section (via children), a sibling products row,
 * and a bottom bar with BurrowSoft branding, attribution, support email, and copyright.
 */
export function AppFooter({
  supportEmail,
  accentHoverClass = "hover:text-slate-600",
  dark = false,
  attribution,
  children,
  currentSite,
}: AppFooterProps) {
  const year = new Date().getFullYear();
  const siblings = currentSite
    ? SIBLINGS.filter((s) => s.name !== currentSite)
    : SIBLINGS;

  const border = dark ? "border-white/5" : "border-slate-200";
  const borderInner = dark ? "border-white/5" : "border-slate-100";
  const bg = dark ? "" : "bg-white";
  const textMuted = dark ? "text-gray-500" : "text-slate-400";
  const textBody = dark ? "text-gray-400" : "text-slate-600";

  return (
    <footer className={`mt-16 border-t ${border} ${bg}`}>
      <div className="mx-auto max-w-7xl space-y-8 px-4 py-10">
        {children && <div>{children}</div>}

        {/* Sibling products */}
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          {siblings.map((s) => (
            <a
              key={s.name}
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              className={`text-xs ${textMuted} ${accentHoverClass} transition-colors`}
            >
              {s.name}
            </a>
          ))}
        </div>

        {/* Bottom bar */}
        <div
          className={`flex flex-col items-center justify-between gap-4 border-t ${borderInner} pt-6 sm:flex-row`}
        >
          <a
            href="https://www.burrowsoft.com"
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-2 text-xs ${textMuted} ${accentHoverClass} transition-colors`}
          >
            <BurrowSoftIcon className="h-5 w-5 shrink-0" />
            <span className="font-semibold">BurrowSoft</span>
          </a>

          {attribution && (
            <p className={`text-xs ${textBody}`}>{attribution}</p>
          )}

          <div className={`flex items-center gap-4 text-xs ${textMuted}`}>
            <a
              href={`mailto:${supportEmail}`}
              className={`${accentHoverClass} transition-colors`}
            >
              {supportEmail}
            </a>
            <p>© {year} BurrowSoft. All rights reserved.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
