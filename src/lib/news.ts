import { liveFeatures } from "./liveFeatures";
import { MENU_TARGET, type TourRole, type TourStep } from "./tour";

// The "Novidades" announcements (specs/walkthrough.md §4a): one per release,
// shown once per account (migration 113: tour "news:<release>"), each item a
// line in the popup and a step of its short spotlight tour. Copy (by UX &
// PM) lives in the "news" messages. An item appears only when its feature
// is live for customers (lib/liveFeatures), and only for the roles that
// have it.

export type NewsItem = TourStep & {
  // The popup's one line about it (the step's titleKey is its title).
  lineKey: string;
  roles: TourRole[];
  live: boolean;
};
// since: when the release reached production. An account created on or
// after it is new to everything: the main tour, no "What's new" (cf, 6 Oct).
export type NewsRelease = { release: string; since: string; items: NewsItem[] };

// Brand-new for this release: created on or after its date (YYYY-MM-DD, UTC).
export function newForRelease(createdAt: string | null | undefined, release: Pick<NewsRelease, "since">): boolean {
  return !!createdAt && createdAt.slice(0, 10) >= release.since;
}

export const NEWS: NewsRelease[] = [
  {
    release: "1.4.0",
    // 1.4.0 reached Google Play production on 2 Oct 2026.
    since: "2026-10-02",
    items: [
      // SolvyAI: doctors only, once it exists; the spotlight is its ✦ button.
      {
        id: "solvyai", target: "solvyai", path: "/dashboard",
        titleKey: "r140.solvyaiTitle", lineKey: "r140.solvyaiLine", textKey: "r140.solvyaiSpot",
        roles: ["professional"], live: liveFeatures.solvyAi,
      },
      // The guided tour, replayable from Settings; the spotlight is the
      // Settings item in the sidebar.
      {
        id: "tour", target: "nav-settings", path: "/dashboard",
        titleKey: "r140.tourTitle", lineKey: "r140.tourLine", textKey: "r140.tourSpot",
        // Narrow screens: the Settings link is inside the closed drawer, so
        // the menu button is spotlighted with drawer-aware text (UX).
        fallback: { target: MENU_TARGET, textKey: "r140.tourSpotMenu" },
        roles: ["professional", "secretary"], live: true,
      },
    ],
  },
];

// The latest release's announcement (the one the popup shows).
export const CURRENT_NEWS = NEWS[0];

export function newsTourId(release: string): string {
  return `news:${release}`;
}

// The items a role sees for a release (at most 3, per the spec).
export function newsItemsFor(release: NewsRelease, role: TourRole): NewsItem[] {
  return release.items.filter((i) => i.live && i.roles.includes(role)).slice(0, 3);
}

// As tour steps (the same overlay as the main tour; the card shows the
// item's title and its spotlight text).
export function newsSteps(release: NewsRelease, role: TourRole): TourStep[] {
  return newsItemsFor(release, role).map(({ id, target, titleKey, textKey, path, fallback }) => ({ id, target, titleKey, textKey, path, fallback }));
}
