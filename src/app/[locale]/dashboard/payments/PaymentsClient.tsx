"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition, useCallback, useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { markPaid, markUnpaid, setPaymentAmount } from "./actions";

function formatBRL(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
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

export function MarkPaidButton({ id, amount }: { id: string; amount?: number }) {
  const t = useTranslations("payments");
  const [pending, startTransition] = useTransition();
  const [showAmount, setShowAmount] = useState(false);
  const [inputVal, setInputVal] = useState(amount?.toString() ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  function handlePaid() {
    if (!amount && !inputVal) { setShowAmount(true); return; }
    const finalAmount = parseFloat(inputVal) || amount || 0;
    startTransition(async () => { await markPaid(id, finalAmount); });
  }

  if (showAmount) {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="number"
          min="0"
          step="0.01"
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          placeholder={t("amountPlaceholder")}
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
    );
  }

  return (
    <button
      onClick={handlePaid}
      disabled={pending}
      className="rounded-lg bg-green-50 border border-green-200 px-3 py-1.5 text-xs font-bold text-green-700 hover:bg-green-100 transition disabled:opacity-60"
    >
      {pending ? "…" : t("markPaid")}
    </button>
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
