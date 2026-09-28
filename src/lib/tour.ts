import { liveFeatures } from "./liveFeatures";

// The guided tour (Enhancing UX, specs/walkthrough.md): one definition per
// role for the web. Each step spotlights an element marked with
// data-tour="<target>"; a step whose element isn't on screen (a narrow
// screen hides the sidebar, no trial chip, ...) is skipped and the count
// adjusts. Copy lives in the "tour" messages. The tour never creates data.

export type TourRole = "professional" | "secretary";
export type PaymentQr = "pix" | "promptpay" | null;

export type TourStep = {
  id: string;
  // data-tour value of the element to spotlight.
  target: string;
  // Keys under "tour" (title + text).
  titleKey: string;
  textKey: string;
  // The page the step is on (the tour navigates there first).
  path: string;
};

const HOME = "/dashboard";

export function tourSteps(role: TourRole, paymentQr: PaymentQr): TourStep[] {
  if (role === "secretary") {
    return [
      { id: "home", target: "home", titleKey: "secHomeTitle", textKey: "secHomeText", path: HOME },
      { id: "new-appointment", target: "new-appointment", titleKey: "newApptTitle", textKey: "newApptText", path: HOME },
      { id: "schedule", target: "nav-schedule", titleKey: "scheduleTitle", textKey: "secScheduleText", path: HOME },
      { id: "patients", target: "nav-patients", titleKey: "patientsTitle", textKey: "secPatientsText", path: HOME },
    ];
  }
  const payments = paymentQr === "pix" ? "paymentsPixTitle" : paymentQr === "promptpay" ? "paymentsPromptPayTitle" : "paymentsTitle";
  const steps: (TourStep & { live?: boolean })[] = ([
    { id: "home", target: "home", titleKey: "homeTitle", textKey: "homeText", path: HOME },
    // SolvyAI: shown once it exists (liveFeatures.solvyAi).
    { id: "solvyai", target: "solvyai", titleKey: "solvyaiTitle", textKey: "solvyaiText", path: HOME, live: liveFeatures.solvyAi },
    { id: "new-appointment", target: "new-appointment", titleKey: "newApptTitle", textKey: "newApptText", path: HOME },
    { id: "schedule", target: "nav-schedule", titleKey: "scheduleTitle", textKey: "scheduleText", path: HOME },
    { id: "patients", target: "nav-patients", titleKey: "patientsTitle", textKey: "patientsText", path: HOME },
    { id: "payments", target: "nav-payments", titleKey: payments, textKey: "paymentsText", path: HOME },
    { id: "trial", target: "trial-chip", titleKey: "trialTitle", textKey: "trialText", path: HOME },
    { id: "invite", target: "invite-link", titleKey: "inviteTitle", textKey: "inviteText", path: "/dashboard/settings" },
    { id: "settings", target: "nav-settings", titleKey: "settingsTitle", textKey: "settingsText", path: "/dashboard/settings" },
  ] as (TourStep & { live?: boolean })[]).filter((s) => s.live !== false);
  return steps.map((s) => ({ id: s.id, target: s.target, titleKey: s.titleKey, textKey: s.textKey, path: s.path }));
}

// The steps whose element is on screen now (the count adjusts).
export function visibleSteps(steps: TourStep[], isVisible: (target: string) => boolean): TourStep[] {
  return steps.filter((s) => isVisible(s.target));
}

// Tracking event names (anonymous; lib/track applies the consent rules).
export const TOUR_EVENTS = {
  started: "tour_started",
  step: "tour_step",
  completed: "tour_completed",
  skipped: "tour_skipped",
  replayed: "tour_replayed",
} as const;
