import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";

// "We've updated our Privacy Policy" (cf, 6 Oct; migration 204): shown when
// the stored version is older than this build's or missing; never when it
// can't be read (before 204, no session, an error). OK records it; X hides
// it for the session only.

const h = vi.hoisted(() => ({ ack: vi.fn() }));
vi.mock("@/lib/privacyNoticeActions", () => ({ acknowledgePrivacyNotice: (...a: unknown[]) => h.ack(...a) }));
vi.mock("@/i18n/navigation", () => ({ Link: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));

import { DISMISS_KEY, privacyNoticeDue, readAcceptedPrivacy } from "@/lib/privacyNotice";
import { PrivacyNoticeCard } from "@/components/PrivacyNoticeCard";

beforeEach(() => {
  h.ack.mockReset();
  sessionStorage.clear();
});

describe("when the notice is due", () => {
  it("an older or missing version: yes; the same or newer: no; unknown: never", () => {
    expect(privacyNoticeDue("2026-10-10", "2026-10-12")).toBe(true);
    expect(privacyNoticeDue(null, "2026-10-12")).toBe(true);
    expect(privacyNoticeDue("2026-10-12", "2026-10-12")).toBe(false);
    expect(privacyNoticeDue("2026-10-15", "2026-10-12")).toBe(false);
    expect(privacyNoticeDue(undefined, "2026-10-12")).toBe(false);
  });

  it("reading it fails closed: before 204 (no function), no session, an odd shape", async () => {
    const db = (data: unknown, error: unknown = null) => ({ rpc: async () => ({ data, error }) });
    expect(await readAcceptedPrivacy(db(null, { message: "function my_privacy_status() does not exist" }))).toBeUndefined();
    expect(await readAcceptedPrivacy(db(null))).toBeUndefined();
    expect(await readAcceptedPrivacy(db({ other: 1 }))).toBeUndefined();
    expect(await readAcceptedPrivacy({ rpc: async () => { throw new Error("x"); } })).toBeUndefined();
    expect(await readAcceptedPrivacy(db({ accepted: "2026-10-10" }))).toBe("2026-10-10");
    expect(await readAcceptedPrivacy(db([{ accepted: null }]))).toBeNull();
  });
});

describe("the card", () => {
  const card = () => render(<NextIntlClientProvider locale="en" messages={en}><PrivacyNoticeCard locale="en" date="12 October 2026" /></NextIntlClientProvider>);

  it("cf's copy, with the date and a link to the policy", () => {
    card();
    expect(screen.getByText(en.privacyNotice.title)).toBeInTheDocument();
    expect(screen.getByText("See what changed on 12 October 2026.")).toBeInTheDocument();
    expect(screen.getByText(en.privacyNotice.read).closest("a")?.getAttribute("href")).toBe("/privacy");
  });

  it("X hides it for this session only, without recording anything", () => {
    card();
    fireEvent.click(screen.getByLabelText(en.privacyNotice.close));
    expect(screen.queryByTestId("privacy-notice")).toBeNull();
    expect(sessionStorage.getItem(DISMISS_KEY)).toBe("1");
    expect(h.ack).not.toHaveBeenCalled();
  });

  it("OK records the version and hides it", async () => {
    h.ack.mockResolvedValue({ ok: true });
    card();
    await act(async () => { fireEvent.click(screen.getByText(en.privacyNotice.ok)); });
    expect(h.ack).toHaveBeenCalledWith("en");
    expect(screen.queryByTestId("privacy-notice")).toBeNull();
  });

  it("a failed save keeps it, with a message", async () => {
    h.ack.mockResolvedValue({ ok: false });
    card();
    await act(async () => { fireEvent.click(screen.getByText(en.privacyNotice.ok)); });
    expect(screen.getByTestId("privacy-notice")).toBeInTheDocument();
    expect(screen.getByText(en.privacyNotice.failed)).toBeInTheDocument();
  });
});
