import { describe, expect, it } from "vitest";
import { MERGE_FIELDS, NOTES_BOTH_SEP, addressDisplay, defaultPick, mergeChoices, mergeColumns, mergeDiff, mergeFields, notesFitBoth, type MergeRow } from "@/lib/patientMerge";

// 139's merge of the address (one block), CNS and Observações ('both').

const row = (o: Partial<MergeRow>): MergeRow => ({
  id: "x", full_name: "Ana", cpf: null, th_national_id: null, passport_number: null, birth_date: null, sex: null, phone: null,
  emergency_phone: null, email: null, rg: null, profession: null, convenio_type: null, photo_url: null, archived_at: null, booking_blocked: null, ...o,
});
const F = mergeFields(true);

describe("merge × 139", () => {
  it("reads and compares the new fields only once live", () => {
    expect(mergeColumns(false)).not.toContain("cns");
    expect(mergeColumns(true)).toContain("address_postal_code");
    expect(mergeColumns(true)).toContain("notes_admin");
    expect(mergeFields(false)).toBe(MERGE_FIELDS);
    const a = row({ address_city: "Santos", cns: "1" }), b = row({ address_city: "Nan", cns: "2" });
    expect(mergeDiff(a, b).differing).toEqual([]);
    expect(mergeDiff(a, b, F).differing).toEqual(["address", "cns"]);
  });

  it("the address is one block, by position, case- and space-insensitive", () => {
    expect(mergeDiff(row({ address_street: "Rua A " }), row({ address_street: "rua a" }), F).differing).toEqual([]);
    expect(mergeDiff(row({ address_street: "A" }), row({ address_city: "A" }), F).differing).toEqual(["address"]);
    expect(addressDisplay(row({ address_street: "Rua A", address_city: "Santos" }))).toBe("Rua A, Santos");
    // An empty kept address takes the other one by default, as a block.
    expect(defaultPick("address", row({}), row({ address_city: "Nan" }), F)).toBe("merged");
    expect(defaultPick("address", row({ address_state: "SP" }), row({ address_city: "Nan" }), F)).toBe("kept");
  });

  it("notes: 'both' by default when the joined text fits (kept, \\n—\\n, removed), else the kept one", () => {
    const kept = row({ notes_admin: "a".repeat(1000) });
    const fits = row({ notes_admin: "b".repeat(2000 - 1000 - NOTES_BOTH_SEP.length) });
    const over = row({ notes_admin: "b".repeat(2000 - 1000 - NOTES_BOTH_SEP.length + 1) });
    expect(NOTES_BOTH_SEP).toBe("\n—\n");
    expect(notesFitBoth(kept, fits)).toBe(true);
    expect(notesFitBoth(kept, over)).toBe(false);
    expect(defaultPick("notes_admin", kept, fits, F)).toBe("both");
    expect(defaultPick("notes_admin", kept, over, F)).toBe("kept");
    expect(defaultPick("notes_admin", row({}), fits, F)).toBe("merged");
  });

  it("choices: Observações always sent (the server joins by default); address / CNS only when taken", () => {
    const kept = row({ notes_admin: "a", address_city: "Santos", cns: "1" });
    const merged = row({ notes_admin: "b", address_city: "Nan", cns: "2" });
    expect(mergeChoices(kept, merged, {}, F)).toEqual({ notes_admin: "both" });
    expect(mergeChoices(kept, merged, { notes_admin: "kept", address: "merged", cns: "kept" }, F)).toEqual({ notes_admin: "kept", address: "merged" });
    // Equal notes: nothing to choose, nothing sent.
    expect(mergeChoices(row({ notes_admin: "x" }), row({ notes_admin: "X " }), {}, F)).toEqual({});
    // Before 139, the new keys never go out.
    expect(mergeChoices(kept, merged, { address: "merged" })).toEqual({});
  });
});
