export { BookingComFlightProvider } from "./booking";
export { SkyscannerFlightProvider } from "./skyscanner";
export { KiwiFlightProvider } from "./kiwi";
export { FlightScraperSkyProvider } from "./flightscrapersky";
export type { FlightProvider } from "./types";

import { ProviderRouter } from "../base";
import { FlightScraperSkyProvider } from "./flightscrapersky";
import { BookingComFlightProvider } from "./booking";
import type { FlightSearchParams, Flight } from "../../types";

function cleanKey(raw: string | undefined): string | undefined {
  const s = raw?.replace(/^﻿/, "").trim();
  return s || undefined;
}

export function createFlightRouter(): ProviderRouter<FlightSearchParams, Flight> {
  const providers = [];

  // Flights Scraper Sky (Skyscanner data via RAPIDAPI_KEY) — primary provider
  const rapidKey = cleanKey(process.env.RAPIDAPI_KEY);
  if (rapidKey) {
    providers.push(new FlightScraperSkyProvider(rapidKey));
  }

  // Booking.com flights as fallback
  if (rapidKey) {
    providers.push(new BookingComFlightProvider(rapidKey));
  }

  return new ProviderRouter(providers);
}
