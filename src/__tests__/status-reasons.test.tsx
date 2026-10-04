import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";
import { pushText } from "@/lib/pushText";
import { cleanReason } from "@/lib/statusReason";

// Item 12 (migration 150): the clinic's optional reason on reject/cancel and
// its message on Confirm/Propose live on the appointment (the patient sees
// them); a push never carries clinic text, only "…with a message from the
// clinic" (e7).

const h = vi.hoisted(() => ({
  live: true,
  updates: [] as Record<string, unknown>[],
  notices: [] as { fn: string; args: Record<string, unknown> }[],
}));
vi.mock("@/lib/conditions", async (orig) => {
  const real = await orig<typeof import("@/lib/conditions")>();
  return { ...real, conditionMet: (id: string) => (id === "status-reason-live" ? h.live : real.conditionMet(id as never)) };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", async (orig) => ({ ...(await orig<typeof import("next/navigation")>()), useParams: () => ({ locale: "pt-BR" }), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/activeAccess", () => ({ getActiveProfId: async () => "doc-1", isLockedOut: async () => false }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const q: Record<string, unknown> = {};
    q.update = (row: Record<string, unknown>) => { h.updates.push(row); return q; };
    q.eq = () => q;
    q.in = () => q;
    q.select = () => q;
    q.not = () => q;
    q.maybeSingle = async () => ({ data: { patient_auth_id: "pat-1", professional_id: "doc-1" }, error: null });
    q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [{ id: "a-1" }], error: null }).then(res);
    return {
      auth: { getUser: async () => ({ data: { user: { id: "doc-1" } } }) },
      from: () => q,
      rpc: async (fn: string, args: Record<string, unknown>) => { if (fn.startsWith("enqueue_")) h.notices.push({ fn, args }); return { data: null, error: null }; },
    };
  },
}));

import { confirmBooking, proposeNewTime, rejectBooking } from "@/app/[locale]/(site)/dashboard/(gated)/schedule/booking-actions";
import { MyAppointmentsClient } from "@/app/[locale]/(site)/my-appointments/MyAppointmentsClient";

beforeEach(() => { h.live = true; h.updates = []; h.notices = []; });

describe("pushes never carry the clinic's text", () => {
  it("hasMessage: the hint only (pt/en/th)", () => {
    expect(pushText("pt-BR", "apptConfirmed", { doctor: "Dra. Ana", date: "05/10/2026", time: "09:00", hasMessage: true }).body).toBe("Dra. Ana confirmou sua consulta de 05/10/2026 às 09:00 (com uma mensagem da clínica)");
    expect(pushText("en", "apptConfirmed", { doctor: "Dra. Ana", date: "05/10/2026", time: "09:00", hasMessage: true }).body).toBe("Dra. Ana confirmed your appointment on 05/10/2026 at 09:00 (with a message from the clinic)");
    expect(pushText("th", "apptConfirmed", { hasMessage: true }).body).toMatch(/\(พร้อมข้อความจากคลินิก\)$/);
  });

  it("cleanReason: trimmed, at most 200, null when blank", () => {
    expect(cleanReason("  ")).toBeNull();
    expect(cleanReason(" Ok ")).toBe("Ok");
    expect(cleanReason("x".repeat(250))).toHaveLength(200);
  });
});

describe("the actions (150 live)", () => {
  // The push is the server's (171): the website only queues the kind and
  // the appointment, so no clinic text can ever reach it.
  it("Reject: the reason goes on the appointment; the notice is the kind + id only", async () => {
    await rejectBooking("a-1", "  Horário indisponível  ");
    expect(h.updates).toContainEqual({ status: "rejected", status_reason: "Horário indisponível" });
    expect(h.notices).toEqual([{ fn: "enqueue_request_notice", args: { p_kind: "rejected", p_appointment_id: "a-1" } }]);
  });

  it("Confirm / Propose: the message is stored, the push only hints at it", async () => {
    await confirmBooking("a-1", "Traga os exames");
    expect(h.updates).toContainEqual({ status: "confirmed", clinic_message: "Traga os exames" });
    await proposeNewTime("a-1", "2030-01-02", "10:00", "10:30", "Pode ser às 10?");
    expect(h.updates.at(-1)).toMatchObject({ status: "proposal", clinic_message: "Pode ser às 10?" });
    // The server adds "(com uma mensagem da clínica)" from clinic_message itself.
    expect(h.notices).toEqual([
      { fn: "enqueue_request_notice", args: { p_kind: "confirmed", p_appointment_id: "a-1" } },
      { fn: "enqueue_request_notice", args: { p_kind: "proposed", p_appointment_id: "a-1" } },
    ]);
  });

  it("before 150: no new columns; the notice is still the kind + id only", async () => {
    h.live = false;
    await rejectBooking("a-1", "Sem horário");
    expect(h.updates).toContainEqual({ status: "rejected" });
    expect(h.notices).toEqual([{ fn: "enqueue_request_notice", args: { p_kind: "rejected", p_appointment_id: "a-1" } }]);
  });
});

describe("the patient's card (150 live)", () => {
  const base = {
    id: "a-1", date: "2030-01-15", start_time: "09:00:00", end_time: "09:30:00", consultation_type: "Consulta", type: "in-person",
    professional_id: "doc-1", proposed_date: null, proposed_start_time: null, proposed_end_time: null, scheduled_by: "patient", patient_note: null,
  };
  const show = (appt: Record<string, unknown>) =>
    render(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <MyAppointmentsClient upcoming={[{ ...base, ...appt } as never]} past={[]} userEmail="p@x.co" myProfessionalId={null} myProfessionalMeta={null} />
      </NextIntlClientProvider>,
    );

  it("declined / cancelled by the clinic, with or without a reason; the patient's own cancel", () => {
    let r = show({ status: "rejected", status_by: "clinic", status_reason: "Agenda cheia" });
    expect(screen.getByTestId("status-by")).toHaveTextContent("Recusado pela clínica: Agenda cheia");
    r.unmount();
    r = show({ status: "cancelled", status_by: "clinic", status_reason: null });
    expect(screen.getByTestId("status-by")).toHaveTextContent("Cancelado pela clínica");
    r.unmount();
    show({ status: "cancelled", status_by: "patient", status_reason: null });
    expect(screen.getByTestId("status-by")).toHaveTextContent("Você cancelou");
  });

  it("the clinic's message on a confirmed appointment", () => {
    show({ status: "confirmed", clinic_message: "Traga os exames" });
    expect(screen.getByTestId("clinic-message")).toHaveTextContent("Mensagem da clínica: Traga os exames");
  });
});

describe("a declined request's badge on Minhas Consultas (3e's ❌)", () => {
  it.each([
    ["pt-BR", "Recusado"],
    ["en", "Declined"],
    ["th", "ถูกปฏิเสธ"],
  ])("%s: the label, never the raw status", async (locale, label) => {
    const messages = (await import(`@/messages/${locale}.json`)).default;
    const appt = {
      id: "a-1", date: "2030-01-15", start_time: "09:00:00", end_time: "09:30:00", consultation_type: "Consulta", type: "in-person",
      professional_id: "doc-1", proposed_date: null, proposed_start_time: null, proposed_end_time: null, scheduled_by: "patient", patient_note: null,
      status: "rejected", status_by: "clinic", status_reason: "x".repeat(200),
    };
    render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <MyAppointmentsClient upcoming={[appt as never]} past={[]} userEmail="p@x.co" myProfessionalId={null} myProfessionalMeta={null} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId("appointment-status-badge")).toHaveTextContent(label);
    expect(screen.queryByText("rejected")).toBeNull();
    expect(screen.getByTestId("status-by").className).toContain("break-words");
  });
});
