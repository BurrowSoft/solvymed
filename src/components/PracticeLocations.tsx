"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { PracticeLocation } from "@/lib/locations";

// 1.8.0 F (flag 'practice_locations'): the practice's locations (2+, else
// none) and its working hours (each day's location_id), for the Agenda's
// create form. Set by the Agenda page; empty = locations aren't shown.
export type PracticeLocationsValue = {
  list: PracticeLocation[];
  hours: Partial<Record<string, { location_id?: string | null } | null>> | null;
};

const PracticeLocationsContext = createContext<PracticeLocationsValue>({ list: [], hours: null });

export function PracticeLocationsProvider({ value, children }: { value: PracticeLocationsValue; children: ReactNode }) {
  return <PracticeLocationsContext.Provider value={value}>{children}</PracticeLocationsContext.Provider>;
}

export function usePracticeLocations(): PracticeLocationsValue {
  return useContext(PracticeLocationsContext);
}
