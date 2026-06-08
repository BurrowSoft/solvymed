import type { Provider } from "../base";
import type { HotelSearchParams, Hotel } from "../../types";

export type HotelProvider = Provider<HotelSearchParams, Hotel>;
