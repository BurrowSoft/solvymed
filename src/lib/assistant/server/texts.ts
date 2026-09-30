import { createTranslator } from "next-intl";
import { formatDateLabel } from "@/lib/dateLabels";
import { routing } from "@/i18n/routing";
import type en from "@/messages/en.json";
import { labelGlossary, labelMap } from "./uiLabels";

// Every fixed text SolvyAI's server shows (card labels, warnings, questions,
// the pointer after a card) comes from the user's locale file, namespace
// solvyaiServer (UX: a Thai UI never gets Portuguese or English). Loaded
// once per request.

const MESSAGES: Record<string, () => Promise<{ default: unknown }>> = {
  en: () => import("@/messages/en.json"),
  th: () => import("@/messages/th.json"),
  es: () => import("@/messages/es.json"),
  ru: () => import("@/messages/ru.json"),
  "pt-BR": () => import("@/messages/pt-BR.json"),
  fr: () => import("@/messages/fr.json"),
  ja: () => import("@/messages/ja.json"),
  zh: () => import("@/messages/zh.json"),
  "zh-TW": () => import("@/messages/zh-TW.json"),
  ar: () => import("@/messages/ar.json"),
  de: () => import("@/messages/de.json"),
  id: () => import("@/messages/id.json"),
  ko: () => import("@/messages/ko.json"),
  it: () => import("@/messages/it.json"),
  vi: () => import("@/messages/vi.json"),
};

export type RepeatEvery = "week" | "2weeks" | "month";

// The language SolvyAI answers in, by UI locale (the model's instruction).
const LANGUAGE: Record<string, string> = {
  en: "English", th: "Thai", es: "Spanish", ru: "Russian", "pt-BR": "Brazilian Portuguese", fr: "French",
  ja: "Japanese", zh: "Simplified Chinese", "zh-TW": "Traditional Chinese", ar: "Arabic", de: "German",
  id: "Indonesian", ko: "Korean", it: "Italian", vi: "Vietnamese",
};
const replyLanguage = (locale: string) => LANGUAGE[locale] ?? LANGUAGE[routing.defaultLocale];

// What the model's rules quote (knowledge.ts): its reply language, the two
// fixed refusals and the real names of the buttons it may mention.
// labels: the screens' labels the Help/App Map name, in the user's language.
// labelMap: the same, English (lowercase) → local, to rewrite the Help/App Map text.
export type ReplyTexts = { language: string; onlySolvyMed: string; noClinical: string; buttons: string[]; labels: string[]; labelMap: ReadonlyMap<string, string> };

function textsFrom(locale: string, messages: typeof en) {
  const tr = createTranslator({ locale, messages, namespace: "solvyaiServer" });
  const as = createTranslator({ locale, messages, namespace: "assistant" });
  const s = (k: Parameters<typeof tr>[0]) => tr(k);
  return {
    sendPix: s("sendPix"), pixKey: s("pixKey"),
    newAppt: s("newAppt"), cancelAppt: s("cancelAppt"), block: s("block"), paid: s("paid"), unpaid: s("unpaid"),
    patient: s("patient"), when: s("when"), duration: s("duration"), period: s("period"), reason: s("reason"),
    appointment: s("appointment"), value: s("value"), procedure: s("procedure"), type: s("type"), inPerson: s("inPerson"),
    blockedWarn: (a: string, b: string) => tr("blockedWarn", { s: a, e: b }),
    outsideWarn: (a: string, b: string) => tr("outsideWarn", { s: a, e: b }),
    dayOffWarn: (d: string) => tr("dayOffWarn", { d }),
    samePatientWarn: (n: string, t: string) => tr("samePatientWarn", { n, t }),
    blockedAsk: (a: string, b: string) => tr("blockedAsk", { s: a, e: b }),
    outsideAsk: (a: string, b: string) => tr("outsideAsk", { s: a, e: b }),
    dayOffAsk: (d: string) => tr("dayOffAsk", { d }),
    bookAnyway: s("bookAnyway"), bookLabel: s("bookLabel"),
    repeatLabel: s("repeatLabel"),
    repeatValue: (every: RepeatEvery, n: number, last: string) =>
      tr("repeatValue", { every: every === "2weeks" ? "biweekly" : every, n, last }),
    moveAppt: s("moveAppt"), from: s("from"), to: s("to"), moveAnyway: s("moveAnyway"), moveLabel: s("moveLabel"),
    notMovable: s("notMovable"),
    pastStop: s("pastStop"), archivedStop: s("archivedStop"), requestStop: s("requestStop"),
    conflict: (when: string, what: string, a: string, b: string) => tr("conflict", { when, what, s: a, e: b }),
    conflictNone: (when: string, what: string, a: string, b: string) => tr("conflictNone", { when, what, s: a, e: b }),
    slotTaken: s("slotTaken"), slotTakenNone: s("slotTakenNone"), notCancellable: s("notCancellable"),
    unblock: s("unblock"), confirmReq: s("confirmReq"), rejectReq: s("rejectReq"),
    decision: s("decision"), confirmIt: s("confirmIt"), rejectIt: s("rejectIt"), note: s("note"),
    addPatient: s("addPatient"), fullName: s("fullName"), birth: s("birth"), similar: s("similar"), archived: s("archived"),
    proposalConfirmStop: s("proposalConfirmStop"),
    seriesOther: (d: string) => tr("seriesOther", { d }),
    skippedLabel: s("skippedLabel"), skippedValue: (d: string) => tr("skippedValue", { d }),
    pickPatient: s("pickPatient"), pickAppointment: s("pickAppointment"), pickDate: s("pickDate"),
    pickSimilar: s("pickSimilar"), someoneElse: s("someoneElse"),
    born: (d: string) => tr("born", { d }),
    minutes: (n: number) => tr("minutes", { n }),
    // The one line after a card, naming the card's real button.
    pointerCard: tr("pointerCard", { button: as("confirm").replace(/\s*✓\s*$/, "") }),
    promptPayText: s("promptPayText"), promptPayOpen: s("promptPayOpen"), openScreen: s("openScreen"),
    reply: {
      language: replyLanguage(locale),
      onlySolvyMed: s("onlySolvyMed"),
      noClinical: s("noClinical"),
      labels: labelGlossary(locale, messages),
      labelMap: labelMap(locale, messages),
      buttons: [as("confirm"), as("undo", { s: 5 }), as("openItem")].map((b) => b.replace(/\s*✓\s*$/, "").replace(/\s*[(（].*$/, "")),
    } satisfies ReplyTexts,
    unavailableArticles: s("unavailableArticles"), unavailableLater: s("unavailableLater"), couldntFinish: s("couldntFinish"),
    // A time chip exactly as the client sends it when tapped (SolvyAi.tsx
    // SlotChoiceView: assistant.chipAt with the long date).
    chipAt: (date: string, time: string) =>
      as("chipAt", { date: formatDateLabel(locale, date, { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }), time }),
  };
}

export type ServerTexts = ReturnType<typeof textsFrom>;

export async function loadTexts(locale: string): Promise<ServerTexts> {
  const known = MESSAGES[locale] ? locale : routing.defaultLocale;
  const messages = (await MESSAGES[known]()).default as typeof en;
  return textsFrom(known, messages);
}
