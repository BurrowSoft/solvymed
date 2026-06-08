export { BookingComHotelProvider } from "./booking";
export type { HotelProvider } from "./types";

import { ProviderRouter } from "../base";
import { BookingComHotelProvider } from "./booking";
import type { HotelSearchParams, Hotel } from "../../types";

export function createHotelRouter(): ProviderRouter<HotelSearchParams, Hotel> {
  const providers = [];

  if (process.env.RAPIDAPI_KEY) {
    providers.push(new BookingComHotelProvider(process.env.RAPIDAPI_KEY));
  }

  return new ProviderRouter(providers);
}
