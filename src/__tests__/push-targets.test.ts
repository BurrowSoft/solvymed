import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clinicPushTargets, patientPushTargets, savedLocaleFor } from "@/lib/pushRecipient";

// Each device in its reader's saved language (migration 117's targets),
// with the older path while 117 isn't applied.

type Rpcs = Record<string, { data: unknown; error: unknown } | (() => never)>;
function db(rpcs: Rpcs, savedPatientLocale: string | null = null) {
  const calls: string[] = [];
  return {
    calls,
    client: {
      rpc: async (fn: string) => {
        calls.push(fn);
        const r = rpcs[fn];
        if (typeof r === "function") r();
        return r ?? { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
      },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: savedPatientLocale ? { locale: savedPatientLocale } : null, error: null }) }) }) }),
    } as unknown as SupabaseClient,
  };
}
const practice = (country: string) => ({ get_professional_public_info: { data: [{ country }], error: null } });

describe("push targets", () => {
  it("117: tokens grouped by their reader's language; an unknown one → the practice's", async () => {
    const d = db({
      ...practice("TH"),
      get_clinic_push_targets: { data: [
        { token: "a", locale: "fr-FR" }, { token: "b", locale: "th" }, { token: "c", locale: "fr-FR" }, { token: "d", locale: null },
      ], error: null },
    });
    expect(await clinicPushTargets(d.client, "doc")).toEqual([
      { locale: "fr", tokens: ["a", "c"] },
      { locale: "th", tokens: ["b", "d"] },
    ]);
    expect(d.calls).not.toContain("get_clinic_push_tokens");
  });

  it("before 117: the tokens RPC, in the practice's language (clinic) or the patient's saved one", async () => {
    const clinic = db({ ...practice("BR"), get_clinic_push_tokens: { data: [{ token: "t1" }, { token: "t2" }], error: null } });
    expect(await clinicPushTargets(clinic.client, "doc")).toEqual([{ locale: "pt-BR", tokens: ["t1", "t2"] }]);
    const patient = db({ ...practice("BR"), get_patient_push_tokens: { data: [{ token: "p1" }], error: null } }, "en");
    expect(await patientPushTargets(patient.client, "pat", "doc")).toEqual([{ locale: "en", tokens: ["p1"] }]);
  });

  it("117 but no booking linked to the account: still reaches the linked patient through the tokens RPC", async () => {
    const d = db({ ...practice("TH"), get_patient_push_targets: { data: [], error: null }, get_patient_push_tokens: { data: [{ token: "p1" }], error: null } });
    expect(await patientPushTargets(d.client, "pat", "doc")).toEqual([{ locale: "th", tokens: ["p1"] }]);
  });

  it("no devices, or everything failing: nothing, never a throw", async () => {
    expect(await patientPushTargets(db({ ...practice("BR"), get_patient_push_tokens: { data: [], error: null } }).client, "p", "d")).toEqual([]);
    const boom = db({ get_patient_push_targets: () => { throw new Error("x"); }, get_patient_push_tokens: () => { throw new Error("y"); } });
    expect(await patientPushTargets(boom.client, "p", "d")).toEqual([]);
  });

  it("the website's 15 languages → what set_my_locale stores; website-only ones aren't saved", () => {
    expect(savedLocaleFor("pt-BR")).toBe("pt-BR");
    expect(savedLocaleFor("en")).toBe("en");
    expect(savedLocaleFor("fr")).toBe("fr-FR");
    expect(savedLocaleFor("de")).toBe("de-DE");
    expect(savedLocaleFor("it")).toBe("it-IT");
    expect(savedLocaleFor("es")).toBe("es-ES");
    expect(savedLocaleFor("th")).toBe("th");
    for (const l of ["ru", "ja", "zh", "zh-TW", "ar", "id", "ko", "vi"]) expect(savedLocaleFor(l)).toBeNull();
  });
});
