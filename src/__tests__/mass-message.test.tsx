import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// "Enviar para Pacientes" (1.6.0, the app's broadcast; behind the flag):
// doctor only, title + a non-blank message, the server's answer in the app's
// words (sent to n / nobody has the app / the 10-a-day limit).

const h = vi.hoisted(() => ({ rpc: vi.fn(), prof: true as boolean | null, flag: true }));
vi.mock("@/lib/liveFeatures", async (orig) => {
  const real = await orig<typeof import("@/lib/liveFeatures")>();
  return { ...real, get liveFeatures() { return { ...real.liveFeatures, broadcast: h.flag }; } };
});
vi.mock("@/lib/activeAccess", () => ({ isActiveProfessional: async () => h.prof }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "doc-1" } } }) }, rpc: h.rpc }),
}));

import { sendMassMessage } from "@/app/[locale]/(site)/dashboard/(gated)/mass-actions";
import { MassMessageButton } from "@/app/[locale]/(site)/dashboard/(gated)/MassMessageButton";

const m = pt.massMessage;
beforeEach(() => { h.rpc.mockReset().mockResolvedValue({ data: 3, error: null }); h.prof = true; h.flag = true; });

describe("sendMassMessage", () => {
  it("trims, calls enqueue_mass_message, returns how many were queued", async () => {
    expect(await sendMassMessage("  Aviso ", " Feriado amanhã ")).toEqual({ ok: true, queued: 3 });
    expect(h.rpc).toHaveBeenCalledWith("enqueue_mass_message", { p_title: "Aviso", p_body: "Feriado amanhã" });
  });

  it("refuses blank fields, a secretary, the flag off; maps the 10-a-day limit", async () => {
    expect(await sendMassMessage(" ", "x")).toEqual({ ok: false, code: "titleRequired" });
    expect(await sendMassMessage("x", "   ")).toEqual({ ok: false, code: "bodyRequired" });
    h.prof = false;
    expect(await sendMassMessage("x", "y")).toEqual({ ok: false, code: "failed" });
    h.prof = true; h.flag = false;
    expect(await sendMassMessage("x", "y")).toEqual({ ok: false, code: "failed" });
    h.flag = true;
    h.rpc.mockResolvedValue({ data: null, error: { message: "too_many_notices" } });
    expect(await sendMassMessage("x", "y")).toEqual({ ok: false, code: "limitReached" });
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });
});

describe("the modal", () => {
  const open = () => {
    render(<NextIntlClientProvider locale="pt-BR" messages={pt}><MassMessageButton /></NextIntlClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: m.title }));
  };

  it("Send stays off until both fields are filled; a blank message says so; the hint is there", () => {
    open();
    const send = screen.getByRole("button", { name: m.send });
    expect(send).toBeDisabled();
    expect(screen.getByText(m.noPatientDetails)).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(m.notifTitlePlaceholder), { target: { value: "Aviso" } });
    const body = screen.getByPlaceholderText(m.notifBodyPlaceholder);
    fireEvent.change(body, { target: { value: "   " } });
    fireEvent.blur(body);
    expect(screen.getByText(m.bodyRequired)).toBeInTheDocument();
    expect(send).toBeDisabled();
    fireEvent.change(body, { target: { value: "Feriado amanhã" } });
    expect(send).toBeEnabled();
  });

  it("sent: how many; nobody has the app: the app's line", async () => {
    open();
    fireEvent.change(screen.getByPlaceholderText(m.notifTitlePlaceholder), { target: { value: "Aviso" } });
    fireEvent.change(screen.getByPlaceholderText(m.notifBodyPlaceholder), { target: { value: "Feriado" } });
    fireEvent.click(screen.getByRole("button", { name: m.send }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Enviado para 3 pacientes"));
    h.rpc.mockResolvedValue({ data: 0, error: null });
    fireEvent.change(screen.getByPlaceholderText(m.notifTitlePlaceholder), { target: { value: "Aviso" } });
    fireEvent.change(screen.getByPlaceholderText(m.notifBodyPlaceholder), { target: { value: "Feriado" } });
    fireEvent.click(screen.getByRole("button", { name: m.send }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(m.noTokens));
  });
});
