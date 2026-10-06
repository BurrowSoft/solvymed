import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// 166 (behind the flag): a secretary serving several doctors chooses whose
// app notifications she gets; all may be off (with cf's hint); the RPC runs
// without the acting header; the switcher names each doctor with the title.

const h = vi.hoisted(() => ({ rpc: vi.fn(), acting: [] as unknown[], set: vi.fn() }));
vi.mock("@/lib/liveFeatures", async (orig) => {
  const real = await orig<typeof import("@/lib/liveFeatures")>();
  return { ...real, liveFeatures: { ...real.liveFeatures, multiPractice: true } };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", async (orig) => ({ ...(await orig<typeof import("next/navigation")>()), useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async (opts?: unknown) => {
    h.acting.push(opts);
    return { auth: { getUser: async () => ({ data: { user: { id: "sec-1" } } }) }, rpc: h.rpc };
  },
}));

import { setNotifyPref } from "@/app/[locale]/(site)/dashboard/settings/notify-actions";
import { NotifyPrefsCard } from "@/app/[locale]/(site)/dashboard/settings/NotifyPrefsCard";
import { PracticeSwitcher } from "@/components/PracticeSwitcher";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const prefs = [
  { professional_id: A, display_name: "Ana Um", title: "Dra.", accent_color: "#7c3aed", muted: false },
  { professional_id: B, display_name: "Paulo Dois", title: "Dr.", accent_color: null, muted: true },
];
const tp = pt.secretaryPractices;

beforeEach(() => {
  h.rpc.mockReset().mockResolvedValue({ data: null, error: null });
  h.acting = [];
});

describe("notifications per doctor", () => {
  it("the action calls set_secretary_notify_pref without the acting header; an error is not ok", async () => {
    expect(await setNotifyPref(A, true)).toEqual({ ok: true });
    expect(h.rpc).toHaveBeenCalledWith("set_secretary_notify_pref", { p_professional_id: A, p_muted: true });
    expect(h.acting).toEqual([{ acting: false }]);
    h.rpc.mockResolvedValue({ data: null, error: { message: "not_served" } });
    expect(await setNotifyPref(B, false)).toEqual({ ok: false });
  });

  it("a switch per doctor with the title; muting the last one shows the all-muted hint", async () => {
    render(<NextIntlClientProvider locale="pt-BR" messages={pt}><NotifyPrefsCard prefs={prefs} /></NextIntlClientProvider>);
    expect(screen.getByText(tp.notifyTitle)).toBeInTheDocument();
    expect(screen.getByTestId("notify-prefs")).toHaveTextContent(tp.notifyAppHint);
    const ana = screen.getByRole("switch", { name: "Dra. Ana Um" });
    expect(ana).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: "Dr. Paulo Dois" })).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByTestId("all-muted")).toBeNull();
    fireEvent.click(ana);
    await waitFor(() => expect(ana).toHaveAttribute("aria-checked", "false"));
    expect(screen.getByTestId("all-muted")).toHaveTextContent(tp.allMuted);
  });

  it("a refused change keeps the switch and says so", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "not_served" } });
    render(<NextIntlClientProvider locale="pt-BR" messages={pt}><NotifyPrefsCard prefs={prefs} /></NextIntlClientProvider>);
    const ana = screen.getByRole("switch", { name: "Dra. Ana Um" });
    fireEvent.click(ana);
    await waitFor(() => expect(screen.getByText(pt.secretary.genericError)).toBeInTheDocument());
    expect(ana).toHaveAttribute("aria-checked", "true");
  });

  it("the switcher names each doctor with the brand title (166)", () => {
    render(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <PracticeSwitcher practices={prefs.map(({ muted: _m, ...p }) => ({ ...p, is_primary: p.professional_id === A }))} current={A} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("option", { name: "Dra. Ana Um" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Dr. Paulo Dois" })).toBeInTheDocument();
  });
});
