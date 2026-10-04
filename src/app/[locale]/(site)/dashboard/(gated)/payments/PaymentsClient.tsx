"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition, useCallback, useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { markPaid, markUnpaid, setPaymentAmount } from "./actions";
import { currencySymbol, formatMoney, parseMoney } from "@/lib/money";
import type { Currency } from "@/lib/country";


const ERROR_CODE_KEY: Record<string, string> = {
  invalid_amount: "errorInvalidAmount",
  no_amount: "amountFirst",
  generic: "errorGeneric",
};

// Particular / convênio (Help G6, like the app's report filter): anything
// not private counts as insurance.
export function TypeFilter({ current }: { current: "all" | "private" | "insurance" }) {
  const t = useTranslations("payments");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const TYPES = [
    { key: "all", label: t("typeAll") },
    { key: "private", label: t("typePrivate") },
    { key: "insurance", label: t("typeInsurance") },
  ] as const;
  const set = useCallback((type: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (type === "all") params.delete("type"); else params.set("type", type);
    router.push(`${pathname}?${params.toString()}`);
  }, [router, pathname, searchParams]);
  return (
    <div role="group" aria-label={t("typeFilterLabel")} className="flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
      {TYPES.map(p => (
        <button
          key={p.key}
          type="button"
          aria-pressed={current === p.key}
          onClick={() => set(p.key)}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-all ${
            current === p.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

export function PeriodFilter({ current }: { current: string }) {
  const t = useTranslations("payments");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const PERIODS = [
    { key: "week", label: t("thisWeek") },
    { key: "month", label: t("thisMonth") },
    { key: "last_month", label: t("lastMonth") },
    { key: "all", label: t("allTime") },
  ] as const;

  const set = useCallback((period: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", period);
    router.push(`${pathname}?${params.toString()}`);
  }, [router, pathname, searchParams]);

  return (
    <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
      {PERIODS.map(p => (
        <button
          key={p.key}
          onClick={() => set(p.key)}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-all ${
            current === p.key
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

// currency: the practice's (its country), for the "= …" echo.
export function MarkPaidButton({ id, amount, currency = "BRL" }: { id: string; amount?: number; currency?: Currency }) {
  const t = useTranslations("payments");
  const [pending, startTransition] = useTransition();
  const [showAmount, setShowAmount] = useState(false);
  const [inputVal, setInputVal] = useState(amount?.toString() ?? "");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // The typed amount, read by one rule (lib/money parseMoney; "150,50" and
  // "150.50" both = 150.50). Invalid text is an error, never a fallback to
  // another amount.
  const parsed = parseMoney(inputVal);

  function handlePaid() {
    if (!amount && !inputVal.trim()) { setShowAmount(true); return; }
    if (inputVal.trim() && parsed === null) {
      setShowAmount(true);
      setError(t("errorInvalidAmount"));
      return;
    }
    // Never paid without an amount above zero (the app's #216).
    if (inputVal.trim() && parsed !== null && parsed <= 0) {
      setShowAmount(true);
      setError(t("amountFirst"));
      return;
    }
    const finalAmount = inputVal.trim() ? parsed! : amount ?? 0;
    setError("");
    startTransition(async () => {
      const result = await markPaid(id, finalAmount);
      if (result?.error) setError(t((ERROR_CODE_KEY[result.code ?? ""] ?? "errorGeneric") as Parameters<typeof t>[0]));
    });
  }

  if (showAmount) {
    return (
      <div className="flex flex-col items-start gap-1">
        <div className="flex items-center gap-2">
          {/* Text, not type="number": Chrome reads "150,50" as 15050. */}
          <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={inputVal}
            onChange={e => { setInputVal(e.target.value); setError(""); }}
            placeholder={currencySymbol(currency) ? t("amountPlaceholder", { symbol: currencySymbol(currency) }) : t("amountPlaceholderPlain")}
            className="w-28 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none"
            autoFocus
          />
          <button
            onClick={handlePaid}
            disabled={pending}
            className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-700 transition disabled:opacity-60"
          >
            {pending ? "…" : t("confirm")}
          </button>
          <button onClick={() => setShowAmount(false)} className="rounded-lg px-2 py-1.5 text-xs text-slate-400 hover:text-slate-600">
            {t("cancel")}
          </button>
        </div>
        {/* What will be saved, so a misread amount is visible before confirming. */}
        {parsed !== null && !error && <p className="text-xs text-slate-500">= {formatMoney(parsed, currency)}</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={handlePaid}
        disabled={pending}
        className="rounded-lg bg-green-50 border border-green-200 px-3 py-1.5 text-xs font-bold text-green-700 hover:bg-green-100 transition disabled:opacity-60"
      >
        {pending ? "…" : t("markPaid")}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

// "Sem valor · Definir valor" (the app's #216, UX): an appointment without an
// amount isn't to-receive yet; this sets one (above zero), prefilled with the
// price of the active procedure of the same name. Nothing else changes.
// onSaved: the recibo page re-renders with the amount (UX, 1.6.0).
export function SetAmountButton({ id, suggested, currency = "BRL", onSaved }: { id: string; suggested?: number | null; currency?: Currency; onSaved?: () => void }) {
  const t = useTranslations("payments");
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [inputVal, setInputVal] = useState(suggested && suggested > 0 ? String(suggested) : "");
  const [error, setError] = useState("");
  const parsed = parseMoney(inputVal);

  function save() {
    if (parsed === null) { setError(t(inputVal.trim() ? "errorInvalidAmount" : "amountFirst")); return; }
    if (parsed <= 0) { setError(t("amountFirst")); return; }
    setError("");
    startTransition(async () => {
      const r = await setPaymentAmount(id, parsed);
      if (r?.error) setError(t((ERROR_CODE_KEY[r.code ?? ""] ?? "errorGeneric") as Parameters<typeof t>[0]));
      else { setOpen(false); onSaved?.(); }
    });
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <span className="text-xs font-semibold text-slate-500">
        {t("noAmount")}
        {!open && (
          <>
            {" · "}
            <button type="button" onClick={() => setOpen(true)} className="font-bold text-teal-700 hover:underline">{t("setAmount")}</button>
          </>
        )}
      </span>
      {open && (
        <span className="flex items-center gap-2">
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            autoFocus
            value={inputVal}
            onChange={(e) => { setInputVal(e.target.value); setError(""); }}
            placeholder={currencySymbol(currency) ? t("amountPlaceholder", { symbol: currencySymbol(currency) }) : t("amountPlaceholderPlain")}
            aria-label={t("setAmount")}
            className="w-28 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none"
          />
          <button type="button" onClick={save} disabled={pending} className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-60">
            {pending ? "…" : t("confirm")}
          </button>
          <button type="button" onClick={() => { setOpen(false); setError(""); }} className="rounded-lg px-2 py-1.5 text-xs text-slate-400 hover:text-slate-600">{t("cancel")}</button>
        </span>
      )}
      {open && parsed !== null && parsed > 0 && !error && <span className="text-xs text-slate-500">= {formatMoney(parsed, currency)}</span>}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}

export function MarkUnpaidButton({ id }: { id: string }) {
  const t = useTranslations("payments");
  const [pending, startTransition] = useTransition();

  return (
    <button
      onClick={() => {
        if (!confirm(t("revertConfirm"))) return;
        startTransition(async () => { await markUnpaid(id); });
      }}
      disabled={pending}
      className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 transition disabled:opacity-60"
    >
      {pending ? "…" : t("revert")}
    </button>
  );
}
