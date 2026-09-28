// SolvyAI (specs/assistant.md): what the panel sends and what comes back.
// The backend (the Supabase edge function "assistant"; a mock until it
// exists) streams an answer made of blocks the panel renders.

export type AssistantScreen = "home" | "schedule" | "patients" | "payments" | "settings" | "other";

export type AssistantLang = "pt" | "en";

export type AssistantRequest = {
  // The conversation so far (the last few turns are sent), newest last.
  messages: { role: "user" | "assistant"; text: string }[];
  screen: AssistantScreen;
  locale: string;
};

// One field of a confirmation card. isDefault = it came from the clinic's
// settings, not from what the doctor said, and is labelled so (§2.3a rule 5).
export type CardField = { label: string; value: string; isDefault?: boolean };

// A proposed action (v2). Nothing is saved until the doctor taps Confirmar
// on this exact card (§2.3a rule 2); hardStop = it can't be confirmed.
export type ConfirmationCard = {
  id: string;
  icon: string;
  title: string;
  fields: CardField[];
  warnings: string[];
  hardStop?: boolean;
  // Where "Editar" opens the normal form, pre-filled.
  editHref: string;
  // Where "Ver na agenda" (or the like) goes after saving.
  viewHref: string;
};

export type PickOption = { id: string; title: string; detail: string };

export type AnswerBlock =
  | { type: "text"; text: string }
  | { type: "steps"; items: string[] }
  | { type: "open"; label: string; href: string }
  | { type: "pick"; question: string; options: PickOption[] }
  | { type: "card"; card: ConfirmationCard }
  // Help answers end with 👍/👎 + "Falar com o suporte".
  | { type: "feedback" };

// A streamed answer: text arrives in pieces ("delta"), the other blocks
// whole; "done" closes it.
export type AnswerChunk =
  | { kind: "delta"; text: string }
  | { kind: "block"; block: AnswerBlock }
  | { kind: "done" };

// Today's usage (§4, cost controls): the day's free messages, any extra
// ones, and when the day resets (clinic time zone).
export type AssistantUsage = { used: number; limit: number; extra: number; resetsInHours: number };

export interface AssistantBackend {
  ask(req: AssistantRequest): AsyncIterable<AnswerChunk>;
  usage(): Promise<AssistantUsage>;
  // Confirmar on a card: the server re-checks everything and saves, or says
  // why not (§2.3a rules 9-10).
  confirm(cardId: string): Promise<{ ok: true } | { ok: false; reason: string }>;
  // Desfazer (10 s after saving).
  undo(cardId: string): Promise<void>;
}
