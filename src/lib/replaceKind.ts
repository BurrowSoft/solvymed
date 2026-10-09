// What a copy replaced (214, b2): "updated" = an earlier copy of the same
// document (re-shared after an edit), "corrected" = a copy of another one (a
// correction), null = nothing. Before 214 only `corrected` exists.
export type ReplaceKind = "updated" | "corrected" | null;
export const replaceKindOf = (r: Record<string, unknown>): ReplaceKind =>
  r.replace_kind === "updated" || r.replace_kind === "corrected" ? r.replace_kind : r.corrected === true ? "corrected" : null;
