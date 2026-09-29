import Link from "next/link";

// Printing or exporting patient data happens only once its access-log
// write succeeded (UX 36, both platforms; migration 111). Each entry is
// logged with the applied per-object RPC; any failure (an error or a
// throw) means no document.
type Rpc = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: unknown }> };

export async function logAccesses(db: unknown, patientId: string, items: { kind: string; ref?: string }[]): Promise<boolean> {
  try {
    const results = await Promise.all(
      items.map((i) =>
        (db as Rpc).rpc("log_record_access", { p_patient_id: patientId, p_kind: i.kind, ...(i.ref ? { p_object_ref: i.ref } : {}) }),
      ),
    );
    return results.every((r) => !r.error);
  } catch {
    return false;
  }
}

// Instead of the document: "Não foi possível registrar o acesso. Tente
// novamente." and the way back.
export function AccessLogFailed({ backHref, text, backLabel }: { backHref: string; text: string; backLabel: string }) {
  return (
    <div data-theme="light" className="min-h-screen bg-slate-50 px-4 py-8">
      <div role="alert" className="mx-auto max-w-[680px] rounded-2xl bg-white p-6 text-sm text-slate-700 shadow-sm">
        <p>{text}</p>
        <Link href={backHref} className="mt-4 inline-block font-semibold text-teal-700 hover:underline">← {backLabel}</Link>
      </div>
    </div>
  );
}
