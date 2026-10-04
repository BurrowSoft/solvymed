"use client";

import { useRouter } from "next/navigation";
import { SetAmountButton } from "../../PaymentsClient";
import type { Currency } from "@/lib/country";

// No recibo without an amount (UX, 1.6.0; the app does the same): the
// message and "Definir valor"; once saved, the page shows the recibo.
export function ReceiptNeedsAmount({ id, currency, text }: { id: string; currency: Currency; text: string }) {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-[680px] rounded-2xl bg-white p-6 shadow-sm" data-testid="receipt-needs-amount">
      <p className="mb-3 text-sm text-slate-600">{text}</p>
      <SetAmountButton id={id} currency={currency} onSaved={() => router.refresh()} />
    </div>
  );
}
