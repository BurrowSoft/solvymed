import type { Provider } from "../base";
import type { CarSearchParams, RentalCar } from "../../types";

export type CarProvider = Provider<CarSearchParams, RentalCar>;
