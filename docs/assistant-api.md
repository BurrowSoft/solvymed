# SolvyAI API contract (`/api/assistant`)

Status: **draft for review**, no route code yet. Source of truth for product
rules: `burrowsoft-mobile/specs/assistant.md` (§2.3a no-guessing, §4 how it
works, §6 privacy). This file is the wire contract the web panel
(`src/components/solvyai/`) and the app both build against.

## 1. Overview

- One Next.js route on Vercel, region `gru1`: `POST /api/assistant` (a
  question, streamed answer) and `GET /api/assistant/usage` (the usage bar).
- Used by **web and the app**. Both send the user's **Supabase access token**
  (`Authorization: Bearer <jwt>`). The route builds a Supabase client with that
  token, so every read and every RPC runs **as the user** (RLS and role rules
  apply). No service-role key in this path.
- Model: `claude-sonnet-5` through the official Anthropic TypeScript SDK,
  streaming, the Help articles in a cached prefix. The model client is
  injected (an interface), so tests use a fake model and the route works
  without a key (`ANTHROPIC_API_KEY` goes into Vercel only when Vitor adds
  it; until then the route answers `503 model_unavailable`).
- **Doctors only.** Secretaries and patients get `403 not_doctor`.
- **Nothing is ever written by the route.** Read tools run directly; write
  tools return a *proposal* (a confirmation card). The client executes the
  card's `action` through the **normal RPC** only after the user taps
  Confirmar on that card (§2.3a rules 2, 10).

## 2. Modes

| Mode | When | What the model gets |
| --- | --- | --- |
| `help` | the clinic's `solvyai_actions_enabled` is off (the default), **or** the monthly budget guard is at 100% | the question (re-masked), role, screen, language, the Help articles. No tools, no database data. |
| `actions` | the doctor switched on "Permitir que o SolvyAI faça ações" (migration 115) | as `help`, plus the read and proposal tools (§5) |

The mode is decided **by the server** on every request from the database,
never taken from the client. At 100% of the monthly budget every clinic is
`help` until the next month ("Central de Ajuda only"), never an error.

## 3. `POST /api/assistant`

### Request

```jsonc
{
  "messages": [                         // newest last; the server keeps only the last 6
    { "role": "user", "text": "Marca a Ana amanhã às 14h" }
  ],
  "screen": "schedule",                 // home | schedule | patients | payments | settings | other
  "locale": "pt-BR",                    // the app language
  "conversationTurns": 3                // turns so far in this conversation (for the 12-turn cap)
}
```

Server-side checks, **before** any model call and in this order:

1. JWT valid → else `401 unauthorized`.
2. Caller is a professional (not a secretary, not a patient) → else `403 not_doctor`.
3. Subscription active or trial (the same rule as the paywall) → else `403 inactive`.
4. Last user message ≤ 500 chars, `messages` well-formed, roles alternate,
   `conversationTurns` < 12 → else `400 too_long` / `400 bad_request` /
   `400 too_many_turns`.
5. **Re-mask** every user message (CPF, Thai ID, phones, emails; the same
   `maskPersonalData` as the client). The client masks too; the server never
   trusts that it did.
6. `assistant_consume_message()` (migration 115): counts one message against
   today's quota in the clinic's time zone, and the anti-spam limits (1 per
   3 s, 10 per minute) → else `429 quota_exhausted` / `429 rate_limited`
   (with `retryAfterS`).
7. Off-topic and clinical questions get a fixed short reply (§4.6, §6), which
   still counts as a message.

If the model call then fails, the route calls `assistant_release_message()`
(the message isn't spent) and streams `error`. Token usage is recorded with
`assistant_record_usage()` after a successful answer.

### Response: a stream

`200`, `Content-Type: application/x-ndjson`, one JSON object per line. The
line types are the panel's `AnswerChunk` (`src/lib/assistant/types.ts`) plus
`meta`, `usage` and `error`:

```jsonc
{ "kind": "meta", "mode": "actions" }                       // first line, always
{ "kind": "delta", "text": "Para que " }                    // text, in pieces
{ "kind": "delta", "text": "horário?" }
{ "kind": "block", "block": { "type": "pick", ... } }       // whole blocks
{ "kind": "block", "block": { "type": "card", "card": { ... } } }
{ "kind": "usage", "used": 4, "limit": 20, "extra": 0, "resetsAt": "2026-09-29T03:00:00Z" }
{ "kind": "done" }                                          // last line
// or, instead of the rest:
{ "kind": "error", "code": "model_failed" }                 // then the stream ends
```

**`docs/assistant-examples.ndjson`** has one example of every line and
block type (incl. cards with each warning, `secondConfirm`, and every
`slot_choice` reason). `src/__tests__/assistant-examples.test.ts` checks it
against this contract. The app copies the same file into its own fixture
test, so a shape change breaks both sides together: change the file, this
doc and both tests in step.

Errors before the stream starts are plain JSON with a status:
`{ "error": "<code>", "usage"?: {...}, "retryAfterS"?: 3 }`.

| Code | Status | Client shows |
| --- | --- | --- |
| `unauthorized` | 401 | the sign-in prompt |
| `not_doctor` | 403 | nothing (the button isn't shown to them) |
| `inactive` | 403 | the neutral screen |
| `bad_request` / `too_long` / `too_many_turns` | 400 | the input's own limits (should not happen) / "Começar nova conversa" |
| `quota_exhausted` | 429 | "Você usou as mensagens de hoje do SolvyAI. Renova em N h." + Ajuda |
| `rate_limited` | 429 | the Send button waits `retryAfterS` |
| `model_unavailable` | 503 | "O SolvyAI está indisponível agora." (no key yet, or the provider is down) |
| `model_failed` | stream `error` | the same, and the message wasn't counted |

## 4. `GET /api/assistant/usage`

Same auth. Returns `assistant_usage_today()`:
`{ "used": 3, "limit": 20, "extra": 0, "resetsAt": "<timestamptz>", "mode": "help" | "actions" }`.
The panel's `AssistantUsage.resetsInHours` is computed from `resetsAt` on the
client.

## 5. Tools (mode `actions` only)

Every tool has a strict schema (`strict: true`) and runs as the user. Tools
return **only the fields the action needs**: never clinical notes,
diagnoses, records, prescriptions, exams or files (§6). Text from the
database (patient names, notes) is data, never instructions.

**Read tools** (run directly, the model sees their result):

| Tool | Input | Returns |
| --- | --- | --- |
| `list_appointments` | `{ from, to }` (YYYY-MM-DD, clinic zone; max 14 days) | id, patient id + full name + birth date, date, start–end, type, status, value, paid |
| `find_free_slots` | `{ date, durationMin }` | free start times, by the clinic's hours and blocks |
| `find_patients` | `{ query }` | up to 5: id, full name, birth date (the same search as the picker) |
| `payments_summary` | `{ period: "week" \| "month" }` | totals to receive / received, counts |

**Proposal tools** (never write; each returns one card):

| Tool | Input | The client's Confirmar runs |
| --- | --- | --- |
| `propose_book_appointment` | `{ patientId, date, start, durationMin?, procedureId?, type?, value?, repeat?: { every: "week", count } }` | the new-appointment action (a series like the app's) |
| `propose_move_appointment` | `{ appointmentId, date, start }` | reschedule |
| `propose_cancel_appointment` | `{ appointmentId }` | status → cancelled |
| `propose_block_time` | `{ date, start, end, reason? }` | block time |
| `propose_unblock_time` | `{ blockId }` | delete the block |
| `propose_booking_decision` | `{ appointmentId, decision: "confirm" \| "reject" }` | confirm / reject the request |
| `propose_add_patient` | `{ fullName, birthDate?, phone?, email? }` | create patient (the same duplicate checks) |
| `propose_mark_paid` | `{ appointmentId, paid: boolean }` | mark paid / unpaid |
| `propose_send_pix` | `{ appointmentId }` | open WhatsApp with the Pix / PromptPay message |

There is deliberately **no tool** for records, prescriptions, exams, files,
deleting/archiving patients, closing accounts, payment/Pix settings,
subscriptions, team members or the clinic country (§3 "Never").

### How a proposal becomes a card

The model only supplies ids and values. The **server** builds the card:

1. validates the input (types, ranges, dates in the future where it matters,
   a year < 2400, the Buddhist-era guard);
2. re-reads the referenced rows **as the user** (the patient's full name and
   birth date, the appointment's current date and time), so a card never
   shows a name or time the model made up;
3. fills missing optional values from the clinic's defaults and marks them
   `isDefault` ("(padrão)", §2.3a rule 5);
4. spells out every date and time in the clinic's time zone and language
   ("terça, 29/09/2026, 14:00–14:30"), with before → after for moves
   (rule 7);
5. checks the schedule with the same rules as the normal screens (§5a) and
   either returns **no card** (a `slot_choice` block) or a card with
   structured `warnings` and, where the app asks twice, `secondConfirm`;
6. builds `editHref` and `viewHref` as **internal paths only**, from a
   fixed route table plus `URLSearchParams`, never by concatenating model
   text. Any href (including `open` blocks) must start with exactly one `/`,
   contain no `\`, no control characters and no scheme, and match a route in
   the table; anything else is dropped.

Card wire format (extends `ConfirmationCard`):

```jsonc
{
  "id": "c_7f3a…",                       // random, per card
  "icon": "calendar",
  "title": "Nova consulta",
  "fields": [
    { "label": "Paciente", "value": "Ana Costa (14/02/2001)" },
    { "label": "Quando", "value": "terça, 29/09/2026, 14:00–14:30" },
    { "label": "Duração", "value": "30 min", "isDefault": true },
    { "label": "Valor", "value": "R$ 150,00", "isDefault": true }
  ],
  "warnings": [                          // structured; the text is in the request's language
    { "code": "blocked", "text": "⚠ Horário bloqueado (12:00–13:00)" }
  ],
  "secondConfirm": {                     // present → Confirmar asks this before running the action
    "question": "Este horário está bloqueado (12:00–13:00). Agendar mesmo assim?",
    "confirmLabel": "Agendar"
  },
  "hardStop": false,
  "editHref": "/dashboard/schedule?new=1&patient=…&date=2026-09-29&start=14:00",
  "viewHref": "/dashboard/schedule?date=2026-09-29",
  "after": {                             // where the UI goes once it's saved (§2.3 "After saving")
    "screen": "schedule",
    "date": "2026-09-29",
    "highlight": { "kind": "appointment" } // the id comes from the RPC's result (a new row has no id yet)
  },
  "action": {                            // what Confirmar executes, and nothing else
    "kind": "book_appointment",
    "args": { "patientId": "…", "date": "2026-09-29", "start": "14:00", "durationMin": 30, "value": 150 }
  },
  "expiresAt": "2026-09-28T12:45:00Z"    // 15 min; after that the card must be re-proposed
}
```

`fields` and `action.args` come from the same validated object on the
server, so what the user reads is what runs. The client executes
`action.kind` with `action.args` through the **same RPC or server action as
the normal form**, which re-checks permissions, the slot, blocks and hours
(rule 10). No signature is needed: every action is something the user could
already do in the form with the same session. A card is confirmed at most
once; a typed "sim"/"ok" never executes (rule 2). If the user edits a field,
the client re-sends the edited values as a new message and gets a new card
(rule 9).

## 5a. Schedule checks before proposing (§2.3, Vitor 2026-09-28)

Every proposal that places or moves an appointment or a block is checked
**by the server** with the same rules as the normal screens, before a card
exists. The model never decides these outcomes:

| Situation | Result | Wire |
| --- | --- | --- |
| Conflict with another appointment (a hard stop in the app) | **no card**: says what's there, offers the nearest free times, never picks | `slot_choice` block, `reason: "conflict"` |
| Blocked time | card + warning + the app's second question | `warnings: [{code:"blocked"}]`, `secondConfirm` |
| Outside working hours | card + warning + an explicit second question | `warnings: [{code:"outside_hours"}]`, `secondConfirm` |
| Same patient already booked that day / an overlapping pending request | card + warning only | `warnings: [{code:"same_patient_day"}]` / `{code:"pending_request_overlap"}` |
| Recurring series with any conflicting date | **no card**: names the conflicting dates, asks how to proceed (the app's "none are saved") | `slot_choice` block, `reason: "recurring_conflict"` |
| Moving | the same checks on the new time; the card shows before → after | as above |

The `slot_choice` block (a new `AnswerBlock` type):

```jsonc
{
  "type": "slot_choice",
  "reason": "conflict",                  // conflict | recurring_conflict | confirm_failed
  "text": "Sexta, 02/10/2026 às 10:00 já tem Ana Costa (10:00–10:30). Qual destes horários?",
  "conflicts": [{ "date": "2026-10-02", "start": "10:00", "end": "10:30", "what": "Ana Costa" }],
  "alternatives": [                      // up to 3 nearest free starts, same day first; may be empty
    { "date": "2026-10-02", "start": "09:30" },
    { "date": "2026-10-02", "start": "10:30" },
    { "date": "2026-10-02", "start": "11:00" }
  ],
  "other": true                          // shows [Outro horário]
}
```

Tapping an alternative sends it as the user's next message ("Sexta,
02/10/2026 às 10:30"), which gets a new proposal. It is still the user who
chose it.

**Confirmar failed** (the state changed between the card and the tap: the
slot was taken, a block was added): the normal RPC refuses and nothing is
saved. The client then sends:

```jsonc
{ "event": { "type": "confirm_failed", "code": "slot_taken", "action": { /* card.action */ } },
  "screen": "schedule", "locale": "pt-BR" }
```

The server answers **without a model call** (so this is free and can't be
used to get free answers): a fixed-text explanation in the user's language
plus a `slot_choice` block with `reason: "confirm_failed"` and fresh
alternatives, computed from the schedule as the user. It doesn't count
against the quota. It is rate-limited like messages.

### After saving (§2.3, Vitor 2026-09-28)

After a **confirmed** action succeeds, the panel minimises to the pill, the
UI navigates to `card.after`, briefly highlights the item, and shows the
"✓ … + Desfazer" toast. The highlight's id is the one the RPC returned, or
the existing row's id for moves, cancels and payments. `after` is built by
the server from the action, never by the model:

| `action.kind` | `after` |
| --- | --- |
| `book_appointment`, `move_appointment`, `cancel_appointment` | `{ screen: "schedule", date: <the (new) date>, highlight: { kind: "appointment", id? } }` |
| `block_time` / `unblock_time` | `{ screen: "schedule", date, highlight: { kind: "block", id? } }` |
| `booking_decision` | `{ screen: "schedule", date }` |
| `add_patient` | `{ screen: "patient", highlight: { kind: "patient", id? } }` (the patient's page, by the new id) |
| `mark_paid` | `{ screen: "payments", highlight: { kind: "appointment", id } }` |
| `send_pix` | `{ screen: "whatsapp", then: { screen: "payments", highlight: { kind: "appointment", id } } }` |

Screens are names, not URLs: each client maps them to its own routes (web
paths, app screens), so nothing the server sends becomes an arbitrary link.
Read-only answers never navigate by themselves. They end with an `open`
block ("Abrir na agenda"), whose `href` passes the same internal-path check.

**One card per action** (rule 8). "Cancela todas de sexta" returns one card
per appointment, each with its own Confirmar.

## 6. The no-guessing rules on the server

The system prompt states them first, and the server enforces what it can:

- A proposal tool whose required inputs are missing is rejected before a card
  is built. The model gets an error saying to ask the user.
- A patient or appointment id that isn't in a read-tool result from **this
  same request** is rejected, so it can't pick "the most likely Maria". The
  route is stateless and the client's history can be forged, so ids in past
  turns don't count; the model re-reads (find_patients / list_appointments).
- A date that came from a relative word ("sexta", "amanhã") is spelled out
  on the card, never shown as the word. A bare weekday means its next
  occurrence after today. It always asks when the weekday is today or the
  user said "próxima sexta" / "next Friday" (UX, 2026-09-28).
- Years: the tools take Gregorian ISO dates only (a year ≥ 2400 is
  rejected). In chat, a year ≥ 2400 is read as Buddhist-era when the
  practice is TH or the language is th, and the card shows it Thai-style
  ("5 ต.ค. 2569"). Otherwise the model asks (UX, 2026-09-28).

The eval set (`src/lib/assistant/evals/cases.json`, §7) checks the parts
only the model can do: asking instead of guessing.

## 7. Evals

`src/lib/assistant/evals/cases.json` holds real-style requests in pt-BR, en and
th, each with a fixed context (the clinic, today, patients, appointments)
and the **expected behaviour**: `ask`, `pick`, `propose` (with the tool and
key args, and the expected warning codes / second confirm), `slot_choice`
(no card: conflicts + alternatives), `answer`, `reshow_card`, `refuse_action`, `refuse_clinical` or
`offtopic`. For `ask` and `pick` no proposal tool may be called in that turn.
The runner (with the route) plays each case against the fake model in CI
(for the harness) and against `claude-sonnet-5` when the key exists (for
quality and cost per conversation, before launch and on model changes).

## 8. Privacy (must match the policy text)

- `help` mode sends only the typed question (re-masked), role, screen and
  language, plus the Help articles. Names typed by the doctor are sent as
  typed (they can't be reliably masked). The policy says exactly this.
- `actions` mode, only after the clinic's opt-in, also sends what the tools
  return: patient name, birth date, appointment date/time/type/value/paid.
  Never clinical data. The opt-in text (UX, 2026-09-28) says exactly this.
- Conversations aren't stored beyond the request. Logs hold counts, token
  usage and error codes, never message text.
- The route runs in `gru1` (Brazil) and sends the request to Anthropic in
  the USA: an **international transfer** the privacy policy must state (LGPD;
  PDPA for Thailand), with Anthropic as a processor.
- **Launch gate:** Anthropic's retention terms / zero data retention for our
  account confirmed and the policy says the retention period (spec §6).
