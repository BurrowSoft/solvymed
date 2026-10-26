"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { COVER_INPUT_TYPES, CoverError, coverUrl, removeCover, renderCover, uploadCover, type CoverErrorCode } from "@/lib/patientChannel/cover";

// The channel page's cover image (246; 01's design and strings, 10-27): a 3:1
// banner, cropped in the browser, previewed before it's sent, public once saved
// (privacy PC-9). Doctors only; shown while pc_cover_upload is on (the page decides).

const CARD = "min-w-0 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6";
const SUB = "text-xs leading-relaxed text-slate-500";
const PRIMARY = "rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50";
const GHOST = "rounded-xl border border-teal-600 px-4 py-2 text-sm font-bold text-teal-700 hover:bg-teal-50 disabled:opacity-50";
const DANGER = "rounded-xl border border-red-300 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50";

export function CoverCard({ professionalId, initialPath }: { professionalId: string; initialPath: string | null }) {
  const t = useTranslations("patientChannel.cover");
  const tChannel = useTranslations("patientChannel.channel");
  const tReasons = useTranslations("patientChannel.reasons");
  const [path, setPath] = useState(initialPath);
  const [preview, setPreview] = useState<{ blob: Blob; url: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CoverErrorCode | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // The preview's object URL is released when it's replaced or the card goes.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  const message = (code: CoverErrorCode) =>
    code === "too_large" ? t("errorSize") : code === "bad_type" ? t("errorType") : code === "not_set_up" ? t("errorNotSetUp") : tChannel("saveError");

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setConfirmRemove(false);
    try {
      const blob = await renderCover(file);
      setPreview({ blob, url: URL.createObjectURL(blob) });
    } catch (e) {
      setError(e instanceof CoverError ? e.code : "bad_type");
    } finally {
      if (input.current) input.current.value = "";
    }
  };

  const send = async () => {
    if (!preview || busy) return;
    setBusy(true);
    setError(null);
    try {
      setPath(await uploadCover(createClient(), professionalId, preview.blob));
      setPreview(null);
    } catch (e) {
      setError(e instanceof CoverError ? e.code : "generic");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await removeCover(createClient());
      setPath(null);
      setConfirmRemove(false);
    } catch (e) {
      setError(e instanceof CoverError ? e.code : "generic");
    } finally {
      setBusy(false);
    }
  };

  const current = coverUrl(createClient(), path);
  const shown = preview?.url ?? current;

  return (
    <section className={CARD} aria-labelledby="pc-cover">
      <h2 id="pc-cover" className="text-base font-bold text-slate-900">{t("title")}</h2>
      <p className={`${SUB} mt-1`}>{t("hint")}</p>
      {shown && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={shown} alt="" data-testid="pc-cover-image" className="mt-3 aspect-[3/1] w-full rounded-xl border border-slate-100 object-cover" />
      )}
      <input ref={input} type="file" accept={COVER_INPUT_TYPES.join(",")} className="sr-only" data-testid="pc-cover-file"
        onChange={(e) => void choose(e.target.files?.[0])} />

      {preview ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={PRIMARY} disabled={busy} onClick={() => void send()}>{t("useThis")}</button>
          <button type="button" className={GHOST} disabled={busy} onClick={() => setPreview(null)}>{tReasons("cancel")}</button>
        </div>
      ) : confirmRemove ? (
        <div className="mt-3">
          <p className="text-sm font-semibold text-slate-800">{t("removeConfirm")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={DANGER} disabled={busy} onClick={() => void remove()}>{t("remove")}</button>
            <button type="button" className={GHOST} disabled={busy} onClick={() => setConfirmRemove(false)}>{tReasons("cancel")}</button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={GHOST} disabled={busy} onClick={() => input.current?.click()}>{path ? t("change") : t("upload")}</button>
          {path && <button type="button" className={DANGER} disabled={busy} onClick={() => { setError(null); setConfirmRemove(true); }}>{t("remove")}</button>}
        </div>
      )}
      {/* Below the buttons, so an error never moves them (destructive confirms). */}
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{message(error)}</p>}
    </section>
  );
}
