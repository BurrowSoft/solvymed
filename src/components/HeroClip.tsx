"use client";

import { useEffect, useRef, useState } from "react";

// The landing hero's silent product clip in a phone frame. Decorative
// (aria-hidden, no controls). The poster is a lazy <img> under the video
// (not the video's poster attribute, which loads eagerly): on a phone the
// frame is below the fold and the poster would compete with the hero text
// for the first paint (Lighthouse mobile LCP). The video's sources are added
// only once the page is idle AND the frame is in view; it then covers the
// poster. Paused while off screen. Reduced motion or Save-Data: the poster
// only, the video never loads.
export function HeroClip({ poster, mp4, webm }: { poster: string; mp4: string; webm: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [load, setLoad] = useState(false);
  const loaded = useRef(false);
  const visible = useRef(false);
  const stopped = useRef(false);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    if (reduce?.matches || saveData) return;

    let idle = false;
    const tryLoad = () => {
      if (idle && visible.current && !stopped.current && !loaded.current) {
        loaded.current = true;
        setLoad(true);
      }
    };
    const onIdle = () => {
      idle = true;
      tryLoad();
    };
    // Safari has no requestIdleCallback: a short timeout instead.
    const hasIdle = typeof window.requestIdleCallback === "function";
    const idleId = hasIdle ? window.requestIdleCallback(onIdle, { timeout: 4000 }) : window.setTimeout(onIdle, 2000);

    const io = new IntersectionObserver(
      ([e]) => {
        visible.current = e.isIntersecting;
        if (!e.isIntersecting) v.pause();
        else if (loaded.current && !stopped.current) v.play().catch(() => {});
        else tryLoad();
      },
      { threshold: 0.25 },
    );
    io.observe(v);

    const onReduce = (e: MediaQueryListEvent) => {
      if (!e.matches) return;
      stopped.current = true;
      v.pause();
    };
    reduce?.addEventListener?.("change", onReduce);

    return () => {
      if (hasIdle) window.cancelIdleCallback(idleId);
      else window.clearTimeout(idleId);
      io.disconnect();
      reduce?.removeEventListener?.("change", onReduce);
    };
  }, []);

  useEffect(() => {
    const v = ref.current;
    if (!load || !v) return;
    v.muted = true;
    v.load();
    if (visible.current) v.play().catch(() => {});
  }, [load]);

  return (
    <div
      aria-hidden="true"
      data-testid="hero-clip"
      className="relative w-52 shrink-0 overflow-hidden rounded-[2.25rem] border-[6px] border-slate-800 bg-slate-900 shadow-2xl ring-1 ring-white/10 md:w-64"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a static poster; next/image would add a wrapper and srcset for one size */}
      <img src={poster} alt="" width={540} height={960} loading="lazy" decoding="async" className="block aspect-[9/16] h-auto w-full object-cover" />
      <video
        ref={ref}
        className="absolute inset-0 h-full w-full object-cover"
        width={540}
        height={960}
        autoPlay={load}
        muted
        loop
        playsInline
        preload="none"
        disablePictureInPicture
        tabIndex={-1}
      >
        {load && (
          <>
            <source src={mp4} type="video/mp4" />
            <source src={webm} type="video/webm" />
          </>
        )}
      </video>
    </div>
  );
}
