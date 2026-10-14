"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Card } from "../SettingsClient";
import { createClient } from "@/lib/supabase/client";
import { SignatureUploadError, signatureBytes, uploadSignature } from "@/lib/studio/signature";
import type { Design } from "@/lib/studio/design";

// Document Studio: the doctor's signature image (02, 10-13). Shown only
// while studio_signature_image is on for the practice (the caller doesn't
// render it otherwise). Upload → the stored path goes into the design,
// saved with "Save design". Remove → the design drops it; the file itself
// is deleted after that save (c5: design first, then the file).
// It appears only on the patient's copy made when a document is issued.

type Sig = Design["signature"];

export function StudioSignature({ uid, signature, onChange }: { uid: string; signature: Sig; onChange: (next: Sig, removeFileAfterSave: boolean) => void }) {
  const t = useTranslations("studio");
  const tb = useTranslations("brand");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // The stored image, read with the doctor's own short signed URL.
  useEffect(() => {
    let url: string | null = null;
    let alive = true;
    void (async () => {
      const bytes = signature.image ? await signatureBytes(createClient(), signature.imagePath) : null;
      if (!alive) return;
      url = bytes ? URL.createObjectURL(new Blob([bytes.slice()], { type: "image/png" })) : null;
      setPreview(url);
    })();
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [signature.image, signature.imagePath]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const path = await uploadSignature(createClient(), uid, file);
      onChange({ ...signature, image: true, imagePath: path }, false);
    } catch (e) {
      setError(e instanceof SignatureUploadError && e.code === "too_large" ? tb("tooLarge") : tb("uploadError"));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <Card title={t("signature")} description={t("signatureHint")}>
      <div className="space-y-3" data-testid="studio-signature">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={signature.image} disabled={busy || (!signature.image && !signature.imagePath)}
            onChange={(e) => onChange({ ...signature, image: e.target.checked && !!signature.imagePath }, false)} />
          {t("signatureImage")}
        </label>
        {preview && signature.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="h-16 max-w-[240px] rounded border border-slate-200 bg-white object-contain p-1" />
        )}
        <div className="flex flex-wrap items-center gap-2">
          <input ref={input} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
          <button type="button" data-testid="signature-upload" onClick={() => input.current?.click()} disabled={busy}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-teal-700 hover:bg-slate-50 disabled:opacity-60">
            {busy ? tb("uploading") : signature.imagePath ? tb("replace") : tb("upload")}
          </button>
          {signature.imagePath && (
            <button type="button" data-testid="signature-remove" disabled={busy}
              onClick={() => onChange({ ...signature, image: false, imagePath: null }, true)}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60">
              {tb("remove")}
            </button>
          )}
        </div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <ul className="list-disc space-y-1 pl-5 text-xs text-slate-500">
          <li>{t("signatureWhere")}</li>
          <li>{t("signaturePrivate")}</li>
          <li>{t("signatureNotDigital")}</li>
          <li>{t("signatureLater")}</li>
        </ul>
      </div>
    </Card>
  );
}
