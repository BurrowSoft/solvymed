"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";

const INTERVAL = 60;
const RADIUS = 14;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function DashboardRefresh() {
  const router = useRouter();
  const [countdown, setCountdown] = useState(INTERVAL);
  const [refreshing, setRefreshing] = useState(false);
  const countdownRef = useRef(countdown);
  countdownRef.current = countdown;

  const doRefresh = useCallback(() => {
    setRefreshing(true);
    setCountdown(INTERVAL);
    router.refresh();
    setTimeout(() => setRefreshing(false), 1200);
  }, [router]);

  useEffect(() => {
    const id = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          setTimeout(doRefresh, 0);
          return INTERVAL;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [doRefresh]);

  const progress = (countdown / INTERVAL) * CIRCUMFERENCE;

  return (
    <div className="flex items-center gap-2">
      {/* Circular countdown ring */}
      <div className="relative flex h-9 w-9 items-center justify-center" title={`Auto-refresh in ${countdown}s`}>
        <svg className="-rotate-90" width="36" height="36" viewBox="0 0 36 36">
          {/* Track */}
          <circle
            cx="18" cy="18" r={RADIUS}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth="3"
          />
          {/* Progress */}
          <circle
            cx="18" cy="18" r={RADIUS}
            fill="none"
            stroke={countdown <= 10 ? "#f59e0b" : "#0d9488"}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE - progress}
            className="transition-all duration-1000 ease-linear"
          />
        </svg>
        <span className="absolute text-[9px] font-bold text-slate-500 tabular-nums">
          {countdown}s
        </span>
      </div>

      {/* Refresh button */}
      <button
        onClick={doRefresh}
        disabled={refreshing}
        className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
        >
          <polyline points="1 4 1 10 7 10" />
          <path d="M3.51 15a9 9 0 1 0 .49-3.58" />
        </svg>
        {refreshing ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  );
}
