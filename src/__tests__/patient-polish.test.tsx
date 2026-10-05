import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// 3e: Minhas Consultas printed the raw type ("In Person") in every language;
// patient-welcome's 5 s countdown took the "Abrir no app" buttons away.
// 9a: with Thai switched off, a forced English page must not overwrite a
// Thai user's saved language.

const save = vi.hoisted(() => vi.fn(async () => true));
vi.mock("@/app/[locale]/(site)/dashboard/locale-actions", () => ({ saveMyLocale: save }));
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  useParams: () => ({ locale: "pt-BR" }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

// Imported up front, not inside the test: under the full suite's load the
// dynamic import alone could pass the 15 s test timeout (the recurring flake).
import { MyAppointmentsClient } from "@/app/[locale]/(site)/my-appointments/MyAppointmentsClient";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); save.mockClear(); try { localStorage.clear(); sessionStorage.clear(); } catch { /* none */ } });

describe("the appointment type in the patient's language", () => {
  it("Presencial / Online, never the raw value", async () => {
    const appt = (id: string, type: string) => ({
      id, date: "2030-01-15", start_time: "09:00:00", end_time: "09:30:00", consultation_type: "Consulta", type, status: "confirmed",
      professional_id: "doc-1", proposed_date: null, proposed_start_time: null, proposed_end_time: null, scheduled_by: "professional", patient_note: null,
    });
    render(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <MyAppointmentsClient upcoming={[appt("a", "in-person"), appt("b", "online")] as never} past={[]} userEmail="p@x.co" myProfessionalId={null} myProfessionalMeta={null} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Presencial")).toBeInTheDocument();
    expect(screen.getByText("Online")).toBeInTheDocument();
    expect(screen.queryByText(/in person/i)).toBeNull();
  });
});

describe("OpenInApp tells the page when it's up", () => {
  it("onShown(true) on an Android phone", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Linux; Android 14) Mobile");
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    const { OpenInApp } = await import("@/components/OpenInApp");
    const onShown = vi.fn();
    render(<NextIntlClientProvider locale="pt-BR" messages={pt}><OpenInApp onShown={onShown} /></NextIntlClientProvider>);
    await waitFor(() => expect(onShown).toHaveBeenLastCalledWith(true));
  });
});

describe("SaveMyLocale with Thai switched off", () => {
  it("never saves English (forced), but still saves pt-BR", async () => {
    vi.stubEnv("NEXT_PUBLIC_THAI_ENABLED", "0");
    vi.resetModules();
    const { SaveMyLocale } = await import("@/components/SaveMyLocale");
    const { unmount } = render(<SaveMyLocale locale="en" />);
    await new Promise((r) => setTimeout(r, 20));
    expect(save).not.toHaveBeenCalled();
    unmount();
    render(<SaveMyLocale locale="pt-BR" />);
    await waitFor(() => expect(save).toHaveBeenCalled());
  });
});
