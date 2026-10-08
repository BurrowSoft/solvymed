"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { CountryChoice } from "@/lib/signupCountry";

// The country step's suggestion (lib/signupCountry guessSignupCountry),
// worked out by the layout on the server from the request: no round trip,
// and the step renders in its final order from the first paint.
const CountryGuessContext = createContext<CountryChoice | null>(null);

export function CountryGuessProvider({ guess, children }: { guess: CountryChoice | null; children: ReactNode }) {
  return <CountryGuessContext.Provider value={guess}>{children}</CountryGuessContext.Provider>;
}

export const useCountryGuess = () => useContext(CountryGuessContext);
