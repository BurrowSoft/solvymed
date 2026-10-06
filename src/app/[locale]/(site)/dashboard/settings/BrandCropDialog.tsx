"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  BRAND_IMAGE_SHAPES, ZOOM_MAX, ZOOM_MIN, clampView, cropRect, cropToFile, initialView, isSmall, zoomTo, type CropView,
} from "@/lib/brandCrop";
import type { BrandImageKind } from "@/lib/brandImage";

// 1.8.0 G: "Ajustar imagem" before a brand image is uploaded (the app's
// shapes and copy). Drag to move; the slider, the buttons or the mouse wheel
// zoom (1–4 from cover). On a touch screen the hint is the app's.
export function BrandCropDialog({ kind, src, fileName, onUse, onCancel }: {
  kind: BrandImageKind;
  src: string; // an object URL of the picked original (kept in memory only)
  fileName: string;
  onUse: (file: File) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("brandCrop");
  const tb = useTranslations("brand");
  const shape = BRAND_IMAGE_SHAPES[kind];
  // The frame on screen: 280 px wide for the square shapes, 360 for the wide.
  const frameW = shape.aspect > 1 ? 360 : 280;
  const frameH = Math.round(frameW / shape.aspect);
  const img = useRef<HTMLImageElement | null>(null);
  const [view, setView] = useState<CropView | null>(null);
  const [failed, setFailed] = useState(false);
  const [touch, setTouch] = useState(false);
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  // The wheel zooms without scrolling the page: a non-passive listener (React's
  // onWheel is passive, so it can't stop the scroll; c6).
  const frame = useRef<HTMLDivElement>(null);
  const viewRef = useRef<CropView | null>(null);
  viewRef.current = view;
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const v = viewRef.current;
      if (!v) return;
      e.preventDefault();
      setView(zoomTo(v, v.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    setTouch(typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches);
    const i = new Image();
    i.onload = () => { img.current = i; setView(initialView(frameW, frameH, i.naturalWidth, i.naturalHeight)); };
    i.onerror = () => setFailed(true);
    i.src = src;
  }, [src, frameW, frameH]);

  const rect = view ? cropRect(view) : null;
  const small = rect ? isSmall(rect, shape) : false;
  const scale = view ? (Math.max(view.frameW / view.imgW, view.frameH / view.imgH) * view.zoom) : 1;

  async function use() {
    if (!img.current || !rect) return;
    onUse(await cropToFile(img.current, rect, shape, fileName));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center" onClick={onCancel}>
      <div role="dialog" aria-modal="true" aria-labelledby="crop-title" data-testid="brand-crop"
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 id="crop-title" className="text-base font-bold text-slate-900">{t("title")}</h2>
        <p className="mt-1 text-xs text-slate-500">{touch ? t("hintTouch") : t("hint")}</p>
        <div className="mt-3 flex justify-center">
          <div
            ref={frame}
            data-testid="brand-crop-frame"
            className={`relative touch-none select-none overflow-hidden bg-slate-100 ${shape.round ? "rounded-full" : "rounded-lg"}`}
            style={{ width: frameW, height: frameH, cursor: view ? "grab" : "default" }}
            onPointerDown={(e) => { if (!view) return; (e.target as Element).setPointerCapture?.(e.pointerId); drag.current = { px: e.clientX, py: e.clientY, x: view.x, y: view.y }; }}
            onPointerMove={(e) => { const d = drag.current; if (!d || !view) return; setView(clampView({ ...view, x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py })); }}
            onPointerUp={() => { drag.current = null; }}
            onPointerCancel={() => { drag.current = null; }}
          >
            {view && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt="" draggable={false} className="pointer-events-none absolute max-w-none"
                style={{ left: view.x, top: view.y, width: view.imgW * scale, height: view.imgH * scale }} />
            )}
          </div>
        </div>
        {view && (
          <div className="mt-3 flex items-center gap-2">
            <button type="button" aria-label={t("zoomOut")} onClick={() => setView(zoomTo(view, view.zoom - 0.25))} className="rounded-lg border border-slate-200 px-2.5 py-1 text-sm font-bold">−</button>
            <input type="range" aria-label={`${t("zoomOut")} / ${t("zoomIn")}`} min={ZOOM_MIN} max={ZOOM_MAX} step={0.01} value={view.zoom}
              onChange={(e) => setView(zoomTo(view, Number(e.target.value)))} className="flex-1" />
            <button type="button" aria-label={t("zoomIn")} onClick={() => setView(zoomTo(view, view.zoom + 0.25))} className="rounded-lg border border-slate-200 px-2.5 py-1 text-sm font-bold">+</button>
          </div>
        )}
        {small && <p role="status" data-testid="brand-crop-small" className="mt-2 text-xs font-semibold text-amber-700">{t("small")}</p>}
        {failed && <p role="alert" className="mt-2 text-xs text-red-600">{tb("uploadError")}</p>}
        <div className="mt-4 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="text-sm text-slate-500 hover:text-slate-700">{tb("cancel")}</button>
          <button type="button" disabled={!view} onClick={() => void use()}
            className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-60">{t("use")}</button>
        </div>
      </div>
    </div>
  );
}
