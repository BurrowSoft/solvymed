import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import pt from "@/messages/pt-BR.json";

// An already-linked patient entering a code (145/146): the page reaches the
// RPCs (they refuse the re-link), and the message names the doctor; the
// same practice's code (HINT same_practice) asks the clinic to combine the
// records instead of support. Other roles are still stopped on the page.

type RpcResult = { data: unknown; error: { message: string; hint?: string | null } | null };
const h = vi.hoisted(() => ({
  role: "patient" as string | null,
  link: { data: null, error: null } as RpcResult,
  rpcs: [] as string[],
  connectLive: false,
  connect: { data: null, error: null } as RpcResult,
  push: vi.fn(),
  search: "",
}));
vi.mock("@/lib/conditions", () => ({ conditionMet: (id: string) => (id === "invite-connect-live" ? h.connectLive : false) }));
vi.mock("next/navigation", async (orig) => ({ ...(await orig<typeof import("next/navigation")>()), useParams: () => ({ locale: "pt-BR" }), useRouter: () => ({ push: h.push }), useSearchParams: () => new URLSearchParams(h.search) }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => {
    const row = (data: unknown) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data }) }) }) });
    return {
      auth: { getUser: async () => ({ data: { user: { id: "u-1", user_metadata: { role: "patient" } } } }) },
      from: (table: string) => row(table === "user_roles" ? (h.role ? { role: h.role } : null) : null),
      rpc: (fn: string) => {
        h.rpcs.push(fn);
        const res: Promise<RpcResult> & { maybeSingle?: () => Promise<RpcResult> } = Promise.resolve(
          fn === "link_patient_by_invite_code" ? h.link
            : fn === "connect_with_code" ? h.connect
            : fn === "get_linked_professional_id" ? { data: "doc-1", error: null }
            : { data: null, error: null },
        );
        if (fn === "get_professional_public_info") res.maybeSingle = async () => ({ data: { full_name: "Dra. Ana" }, error: null });
        return res;
      },
    };
  },
}));

// The page's own RPCs only: B's delete option (its own status RPC on load) is tested in
// unlinked-patient-delete.test.tsx; the past-messages link in one-doctor-disconnect.test.tsx.
vi.mock("@/components/AccountDeleteOption", () => ({ AccountDeleteOption: () => null }));
vi.mock("@/components/patientChannel/PastPracticeLinks", () => ({ PastPracticeLinks: () => null }));
import InviteRequiredPage from "@/app/[locale]/(site)/auth/invite-required/page";

async function submit() {
  h.rpcs = [];
  const { unmount } = render(
    <NextIntlClientProvider locale="pt-BR" messages={pt}>
      <InviteRequiredPage />
    </NextIntlClientProvider>,
  );
  fireEvent.change(screen.getByLabelText(pt.auth.inviteRequired.codeLabel), { target: { value: "ABC123" } });
  fireEvent.click(screen.getByRole("button", { name: pt.auth.inviteRequired.submit }));
  return unmount;
}

describe("invite code while already connected", () => {
  it("a linked patient reaches the RPC and sees the doctor's name (another clinic: support)", async () => {
    h.role = "patient";
    h.link = { data: null, error: { message: "already_connected" } };
    const unmount = await submit();
    expect(await screen.findByText("Você já está conectado a Dra. Ana. Para trocar, fale com o suporte.")).toBeInTheDocument();
    expect(h.rpcs).toContain("link_patient_by_invite_code");
    unmount();
  });

  it("the same practice's code (hint same_practice): ask the clinic to combine", async () => {
    h.role = "patient";
    h.link = { data: null, error: { message: "already_connected", hint: "same_practice" } };
    const unmount = await submit();
    expect(await screen.findByText("Você já está conectado a Dra. Ana. Peça à clínica para juntar seus cadastros.")).toBeInTheDocument();
    unmount();
  });

  it("a non-patient role is still stopped before any RPC", async () => {
    h.role = "admin";
    const unmount = await submit();
    expect(await screen.findByText(pt.auth.inviteRequired.alreadyHasRole)).toBeInTheDocument();
    expect(h.rpcs).toEqual([]);
    unmount();
  });

  it("147 live: one connect_with_code call; its kind routes, its errors map the same", async () => {
    h.role = "patient";
    h.connectLive = true;
    for (const [kind, path] of [["personal", "/pt-BR/auth/patient-welcome"], ["public", "/pt-BR/auth/pending-confirmation"]] as const) {
      h.connect = { data: kind, error: null };
      h.push.mockClear();
      const unmount = await submit();
      await waitFor(() => expect(h.push).toHaveBeenCalledWith(path));
      expect(h.rpcs).toEqual(["connect_with_code"]);
      unmount();
    }
    h.connect = { data: null, error: { message: "already_connected", hint: "same_practice" } };
    let unmount = await submit();
    expect(await screen.findByText("Você já está conectado a Dra. Ana. Peça à clínica para juntar seus cadastros.")).toBeInTheDocument();
    expect(h.rpcs).not.toContain("link_patient_by_invite_code");
    unmount();
    h.connect = { data: "unavailable", error: null };
    unmount = await submit();
    expect(await screen.findByText("Não foi possível conectar com este código. Fale com a clínica.")).toBeInTheDocument();
    unmount();
    // An archived record's personal code (094): the same neutral text (e7).
    h.connect = { data: null, error: { message: "patient_archived" } };
    unmount = await submit();
    expect(await screen.findByText("Não foi possível conectar com este código. Fale com a clínica.")).toBeInTheDocument();
    unmount();
    h.connect = { data: null, error: null };
    unmount = await submit();
    expect(await screen.findByText(pt.auth.inviteRequired.codeInvalid)).toBeInTheDocument();
    unmount();
    h.connectLive = false;
  });
});

// 01 (13's logs): sent here because the code saved at sign-up matched
// nothing: the page says so first, above its field for a new code.
describe("invite-required: why the saved code didn't link", () => {
  const show = () =>
    render(
      <NextIntlClientProvider locale="pt-BR" messages={pt}>
        <InviteRequiredPage />
      </NextIntlClientProvider>,
    );

  it("?code=notfound: 'not found, ask your clinic' + the code field", () => {
    h.search = "code=notfound";
    show();
    expect(screen.getByText("Código de convite não encontrado. Peça o código à sua clínica.")).toBeInTheDocument();
    expect(document.getElementById("invite-required-code")).not.toBeNull();
    h.search = "";
  });

  it("?code=unavailable: the code no longer admits", () => {
    h.search = "code=unavailable";
    show();
    expect(screen.getByText(pt.auth.inviteRequired.codeUnavailable)).toBeInTheDocument();
    h.search = "";
  });

  it("no reason: no message until a try", () => {
    show();
    expect(document.querySelector(".error-banner")).toBeNull();
  });
});
