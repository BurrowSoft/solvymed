"use client";

import { createContext, useContext, type ReactNode } from "react";
import { actForRow, type RowActionName, type RowActions } from "@/app/[locale]/(site)/dashboard/(gated)/schedule/row-actions";

// The "All" schedule (166): the doctor a row belongs to. Inside it, row
// components call their actions through actForRow, which acts for that
// doctor for that call only; outside (every other view), they call the
// action as before.
const RowPracticeContext = createContext<string | null>(null);

export function RowPractice({ id, children }: { id: string | null; children: ReactNode }) {
  return <RowPracticeContext.Provider value={id}>{children}</RowPracticeContext.Provider>;
}

export function useRowPractice(): string | null {
  return useContext(RowPracticeContext);
}

export function forRow<K extends RowActionName>(practiceId: string | null | undefined, name: K, fn: RowActions[K]): RowActions[K] {
  if (!practiceId) return fn;
  return ((...args: unknown[]) => actForRow(practiceId, name, args)) as unknown as RowActions[K];
}

export function useRowAction<K extends RowActionName>(name: K, fn: RowActions[K]): RowActions[K] {
  return forRow(useContext(RowPracticeContext), name, fn);
}
