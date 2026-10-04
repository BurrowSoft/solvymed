// SolvyAI's wire types: exactly the /api/assistant contract
// (docs/assistant-api.md; examples in docs/assistant-examples.ndjson, which
// the app parses too). The panel renders these; the backend is a mock until
// the route exists.

export type AssistantScreen = "home" | "schedule" | "patients" | "payments" | "settings" | "other";

export type AssistantRequest = {
  // The conversation so far (the last few turns are sent), newest last.
  messages: { role: "user" | "assistant"; text: string }[];
  screen: AssistantScreen;
  locale: string;
  // User messages sent so far in this conversation (the route caps them).
  turns?: number;
};

// Screens by name (each client maps them to its own routes), for links and
// the navigation after a save.
export type TargetScreen = "home" | "schedule" | "patients" | "patient" | "payments" | "settings" | "whatsapp" | "help";
export type ScreenTarget = { screen: TargetScreen; date?: string; id?: string; params?: Record<string, string> };

// One field of a confirmation card. isDefault = it came from the clinic's
// settings, not from what the doctor said, and is labelled so (§2.3a rule 5).
export type CardField = { label: string; value: string; isDefault?: boolean };

export type WarningCode = "blocked" | "outside_hours" | "same_patient_day" | "pending_request_overlap";
export type CardWarning = { code: WarningCode; text: string };

export type ActionKind =
  | "book_appointment" | "move_appointment" | "cancel_appointment" | "block_time" | "unblock_time"
  | "booking_decision" | "add_patient" | "mark_paid" | "send_pix";
export type CardAction = { kind: ActionKind; args: Record<string, unknown> };

// Where the UI goes once the action is saved (§2.3 "After saving"); the
// highlight's id comes from the save's result when it's a new row.
export type AfterSave = {
  screen: TargetScreen;
  date?: string;
  highlight?: { kind: "appointment" | "block" | "patient"; id?: string };
  then?: ScreenTarget;
};

// A proposed action. Nothing is saved until the doctor taps Confirmar on
// this exact card (§2.3a rule 2); blocked / outside hours ask a second
// question first; a hard-stopped card can't be confirmed and says why.
export type ConfirmationCard = {
  id: string;
  icon: string;
  title: string;
  fields: CardField[];
  warnings: CardWarning[];
  secondConfirm?: { question: string; confirmLabel: string };
  hardStop: boolean;
  stop?: { code: "past_time" | "patient_archived" | "not_allowed"; text: string };
  editHref: string;
  viewHref: string;
  editTarget: ScreenTarget;
  viewTarget: ScreenTarget;
  after: AfterSave;
  action: CardAction;
  expiresAt: string;
};

export type PickOption = { id: string; title: string; detail: string };
export type SlotChoice = {
  type: "slot_choice";
  reason: "conflict" | "recurring_conflict" | "confirm_failed";
  text: string;
  conflicts: { date: string; start: string; end: string; what: string }[];
  alternatives: { date: string; start: string }[];
  other: boolean;
};

export type AnswerBlock =
  | { type: "text"; text: string }
  | { type: "steps"; items: string[] }
  | { type: "open"; label: string; href: string; target: ScreenTarget }
  | { type: "pick"; question: string; options: PickOption[] }
  | { type: "card"; card: ConfirmationCard }
  | SlotChoice
  // Help answers end with 👍/👎 + "Falar com o suporte".
  | { type: "feedback" };

// The stream: meta first, text in pieces ("delta"), whole blocks, the
// updated usage, then done (or an error).
export type AnswerChunk =
  | { kind: "meta"; mode: "help" | "actions" }
  | { kind: "delta"; text: string }
  | { kind: "block"; block: AnswerBlock }
  | { kind: "usage"; used: number; limit: number; extra: number; resetsAt: string }
  | { kind: "done" }
  | { kind: "error"; code: string }
  // Previews only (testers' probes): how each model round ended, no
  // content. Clients ignore it.
  | { kind: "debug"; rounds: { round: number; stop: string; chars: number; calls: string[]; output: number; blocks: string[] }[] };

// Today's usage (§4, cost controls): resets at the next local midnight in
// the clinic's time zone.
export type AssistantUsage = { used: number; limit: number; extra: number; resetsAt: string };

// noUndo: the save already told someone else (a booking decision): no Desfazer.
export type ExecuteResult = { ok: true; id?: string; demo?: boolean; noUndo?: boolean } | { ok: false; code: string };

// signal: "Nova conversa" or closing stops the answer (its request too).
export interface AssistantBackend {
  ask(req: AssistantRequest, signal?: AbortSignal): AsyncIterable<AnswerChunk>;
  usage(): Promise<AssistantUsage>;
  // Confirmar: the client runs the card's action through the normal save
  // path, which re-checks everything (§2.3a rule 10).
  // warningsAsked: the card's second question was asked and answered.
  execute(action: CardAction, opts?: { warningsAsked?: boolean }): Promise<ExecuteResult>;
  // The save refused (the slot was taken, …): the server explains and
  // offers fresh times, without a model call and without counting.
  reportConfirmFailed(code: string, action: CardAction, locale: string, signal?: AbortSignal): AsyncIterable<AnswerChunk>;
  // Desfazer (10 s after saving).
  // Desfazer: true when it was undone.
  undo(action: CardAction, id?: string): Promise<boolean>;
}
