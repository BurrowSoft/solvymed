export { BookingComCarProvider } from "./booking";
export type { CarProvider } from "./types";

import { ProviderRouter } from "../base";
import { BookingComCarProvider } from "./booking";
import type { CarSearchParams, RentalCar } from "../../types";

export function createCarRouter(): ProviderRouter<CarSearchParams, RentalCar> {
  const providers = [];

  if (process.env.RAPIDAPI_KEY) {
    providers.push(new BookingComCarProvider(process.env.RAPIDAPI_KEY));
  }

  return new ProviderRouter(providers);
}
