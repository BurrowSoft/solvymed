// An administrative request (an options or exam reason) scores 0 by design (requestScore): its
// band and points mean nothing to the staff, so the inbox doesn't show them (launch polish 29).
// From the request's reason snapshot; one without a kind (older rows) keeps its score.
export function isUnscored(snapshot: unknown): boolean {
  const kind = (snapshot as { kind?: unknown } | null | undefined)?.kind;
  return kind === "options" || kind === "exam";
}
