import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// 1.5.0 patients with several doctors (migration 164; behind the flag):
// the patient's own doctors as cards, "+ Adicionar médico" only while the
// server allows it, Desconectar with its confirmation and the blocked case.

const h = vi.hoisted(() => ({ connect: vi.fn(), disconnect: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  useParams: () => ({ locale: "pt-BR" }),
  useRouter: () => ({ push: vi.fn(), refresh: h.refresh }),
}));
vi.mock("@/app/[locale]/(site)/my-appointments/doctor-actions", () => ({ connectDoctor: h.connect, disconnectDoctor: h.disconnect }));

import { MyDoctors } from "@/app/[locale]/(site)/my-appointments/MyDoctors";
import type { MyDoctor } from "@/lib/myDoctors";

const d = (id: string, name: string, over: Partial<MyDoctor> = {}): MyDoctor => ({
  id, name, specialty: "Dermatologia", accentColor: null, logoUrl: null, photoUrl: null, isPrimary: false, acceptsBookings: true, ...over,
});
const ANA = d("d-1", "Dra. Ana Souza", { isPrimary: true });
const PAULO = d("d-2", "Dr. Paulo Lima");
const t = pt.patientDoctors;
const show = (doctors: MyDoctor[], canAdd = true) =>
  render(<NextIntlClientProvider locale="pt-BR" messages={pt}><MyDoctors doctors={doctors} canAdd={canAdd} /></NextIntlClientProvider>);

beforeEach(() => { h.connect.mockReset(); h.disconnect.mockReset(); h.refresh.mockReset(); });

describe("Meus médicos", () => {
  it("one doctor: \"Seu médico\"; two: \"Meus médicos\", a card each with its own book link", () => {
    const one = show([ANA]);
    expect(screen.getByTestId("my-doctors")).toHaveTextContent(t.homeCard);
    one.unmount();
    show([ANA, PAULO]);
    expect(screen.getByTestId("my-doctors")).toHaveTextContent(t.homeSection);
    const cards = screen.getAllByTestId("doctor-card");
    expect(cards).toHaveLength(2);
    expect(within(cards[1]).getByRole("link")).toHaveAttribute("href", "/pt-BR/book/d-2");
  });

  it("no book link for a doctor not taking bookings", () => {
    show([d("d-3", "Dra. Bia", { acceptsBookings: false })]);
    expect(within(screen.getByTestId("doctor-card")).queryByRole("link")).toBeNull();
  });

  it("+ Adicionar médico only while the server allows a second doctor", () => {
    const a = show([ANA], false);
    expect(screen.queryByText(t.add)).toBeNull();
    a.unmount();
    show([ANA], true);
    expect(screen.getByText(t.add)).toBeInTheDocument();
  });

  it("a code connects: \"Pronto! Você agora está conectado a {doctor}.\"", async () => {
    h.connect.mockResolvedValue({ outcome: "connected", doctor: "Dr. Paulo Lima", doctorId: "d-2" });
    show([ANA]);
    fireEvent.click(screen.getByText(t.add));
    fireEvent.change(screen.getByLabelText(t.code), { target: { value: "ab-12c" } });
    fireEvent.click(screen.getByRole("button", { name: t.connect }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Pronto! Você agora está conectado a Dr. Paulo Lima."));
    expect(h.connect).toHaveBeenCalledWith("AB12C");
  });

  it("an invalid or unavailable code: the neutral message", async () => {
    h.connect.mockResolvedValue({ outcome: "invalid" });
    show([ANA]);
    fireEvent.click(screen.getByText(t.add));
    fireEvent.change(screen.getByLabelText(t.code), { target: { value: "ZZZ999" } });
    fireEvent.click(screen.getByRole("button", { name: t.connect }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(pt.auth.inviteRequired.codeUnavailable));
  });

  it("Desconectar confirms; confirmed visits ahead → the blocked message; otherwise disconnected", async () => {
    h.disconnect.mockResolvedValueOnce({ ok: false, code: "has_future_visits" }).mockResolvedValueOnce({ ok: true });
    show([ANA, PAULO]);
    const card = screen.getAllByTestId("doctor-card")[1];
    fireEvent.click(within(card).getByRole("button", { name: t.disconnect }));
    expect(within(card).getByTestId("disconnect-confirm")).toHaveTextContent("Desconectar de Dr. Paulo Lima?");
    fireEvent.click(within(within(card).getByTestId("disconnect-confirm")).getByRole("button", { name: t.disconnect }));
    await waitFor(() => expect(within(card).getByTestId("disconnect-blocked")).toHaveTextContent("Você tem consultas futuras com Dr. Paulo Lima."));
    expect(h.disconnect).toHaveBeenCalledWith("d-2");
    fireEvent.click(within(card).getByRole("button", { name: t.disconnect }));
    fireEvent.click(within(within(card).getByTestId("disconnect-confirm")).getByRole("button", { name: t.disconnect }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Desconectado de Dr. Paulo Lima."));
    expect(h.refresh).toHaveBeenCalled();
  });
});
