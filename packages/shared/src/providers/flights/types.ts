import type { Provider } from "../base";
import type { FlightSearchParams, Flight } from "../../types";

export type FlightProvider = Provider<FlightSearchParams, Flight>;
