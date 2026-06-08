import type { CarProvider } from "./types";
import type { CarSearchParams, RentalCar, Price } from "../../types";
import { getCurrencyForCountry } from "../../geo";

const API_HOST = "booking-com15.p.rapidapi.com";

function price(amount: number, currency: string): Price {
  return {
    amount,
    currency,
    formatted: new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount),
  };
}

function buildBookingCarsUrl(params: CarSearchParams): string {
  const base = "https://cars.booking.com/index.html";
  const q = new URLSearchParams({
    label: "burrowsoft-rentacarmole",
    lang: "en-us",
    pickup_location: params.pickupLocation,
    dropoff_location: params.dropoffLocation || params.pickupLocation,
    pickup_date: params.pickupDatetime.slice(0, 10),
    pickup_time: params.pickupDatetime.slice(11, 16),
    dropoff_date: params.dropoffDatetime.slice(0, 10),
    dropoff_time: params.dropoffDatetime.slice(11, 16),
    driver_age: String(params.driverAge),
  });
  return `${base}?${q.toString()}`;
}

function affiliateCar(params: CarSearchParams, currency: string, providerName: string): RentalCar {
  return {
    id: "booking-redirect",
    supplier: "Multiple Suppliers",
    category: "All Categories",
    model: "Compare 500+ rental cars",
    seats: 0,
    transmission: "automatic",
    pricePerDay: price(0, currency),
    totalPrice: price(0, currency),
    features: [
      "Free cancellation on most bookings",
      "No credit card fees",
      "Prices include taxes",
    ],
    bookingUrl: buildBookingCarsUrl(params),
    provider: providerName,
  };
}

function calcDays(pickup: string, dropoff: string): number {
  return Math.max(
    1,
    Math.round((new Date(dropoff).getTime() - new Date(pickup).getTime()) / 86400000)
  );
}

function safeStr(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : String(v ?? fallback);
}

function safeNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCarResult(r: any, params: CarSearchParams, currency: string, days: number, providerName: string): RentalCar {
  const vehicle = r?.vehicle_info ?? {};
  const pricing = r?.pricing_info ?? {};
  const supplier = r?.supplier_info ?? r?.vendor_info ?? {};
  const photos: Array<{ url?: string }> = r?.vehicle_photos ?? r?.photos ?? [];
  const content = r?.content ?? {};

  const category = safeStr(vehicle?.class ?? vehicle?.category ?? vehicle?.sipp_code, "Economy");
  const model = safeStr(vehicle?.v_name ?? vehicle?.name ?? vehicle?.model, "Rental Car");
  const seats = safeNum(vehicle?.seats ?? vehicle?.passenger_quantity);
  const doors = vehicle?.doors != null ? safeNum(vehicle.doors) : undefined;
  const ac = vehicle?.ac === true || vehicle?.air_conditioning === true ? true : undefined;
  const luggage = vehicle?.luggage ?? {};
  const largeLuggage = luggage?.large_suitcase != null ? safeNum(luggage.large_suitcase) : undefined;
  const smallLuggage = luggage?.small_suitcase != null ? safeNum(luggage.small_suitcase) : undefined;

  const transmission: "automatic" | "manual" = safeStr(
    vehicle?.transmission_type ?? vehicle?.transmission, "automatic"
  ).toLowerCase().includes("manual") ? "manual" : "automatic";

  // Booking.com returns total price in various shapes
  const totalAmt = safeNum(
    pricing?.total_price
    ?? pricing?.base_price
    ?? (Array.isArray(pricing?.charge_info) ? pricing.charge_info[0]?.amount : undefined)
    ?? pricing?.price?.amount
    ?? 0
  );
  const perDayAmt = days > 0 ? totalAmt / days : totalAmt;

  const imageUrl = photos[0]?.url ?? undefined;
  const bookingUrl = safeStr(
    content?.booking_url ?? content?.deep_link ?? content?.url,
    buildBookingCarsUrl(params)
  ) || buildBookingCarsUrl(params);

  const id = safeStr(
    content?.vehicle_id ?? content?.offer_id ?? content?.id,
    Math.random().toString(36).slice(2)
  );

  const supplierName = safeStr(supplier?.name ?? supplier?.company_name, "Unknown");

  // Build features from structured data
  const features: string[] = [];
  const driveInfo = safeStr(pricing?.drive_info?.drive_type ?? pricing?.mileage_type);
  if (driveInfo) features.push(driveInfo);
  if (ac) features.push("Air conditioning");
  if (largeLuggage != null || smallLuggage != null) {
    features.push(`${largeLuggage ?? 0} large + ${smallLuggage ?? 0} small bags`);
  }
  // Merge any existing string features from API
  const apiFeatures: string[] = Array.isArray(r?.features) ? r.features.map(safeStr) : [];
  const merged = Array.from(new Set([...features, ...apiFeatures])).filter(Boolean);

  return {
    id,
    supplier: supplierName,
    category,
    model,
    seats,
    doors,
    ac,
    largeLuggage,
    smallLuggage,
    transmission,
    pricePerDay: price(perDayAmt, currency),
    totalPrice: price(totalAmt, currency),
    imageUrl,
    features: merged,
    bookingUrl,
    provider: providerName,
  };
}

export class BookingComCarProvider implements CarProvider {
  readonly name = "Booking.com Cars";
  readonly supportedCountries: string[] = [];

  constructor(private readonly apiKey: string) {}

  private async geocode(query: string): Promise<{ latitude: number; longitude: number } | null> {
    try {
      const url = `https://${API_HOST}/api/v1/cars/searchDestination?query=${encodeURIComponent(query)}`;
      const res = await fetch(url, {
        headers: {
          "X-RapidAPI-Key": this.apiKey,
          "X-RapidAPI-Host": API_HOST,
        },
        // Locations are stable — cache for 24 hours
        next: { revalidate: 86400 },
      });
      if (!res.ok) return null;
      const json = await res.json() as Record<string, unknown>;
      const data = json?.data as Array<Record<string, unknown>> | undefined;
      const first = Array.isArray(data) ? data[0] : undefined;
      if (!first) return null;
      // Coordinates may be nested or at root level
      const coords = (first?.coordinates ?? first) as Record<string, unknown>;
      const lat = safeNum(coords?.latitude ?? first?.latitude);
      const lng = safeNum(coords?.longitude ?? first?.longitude);
      if (lat === 0 && lng === 0) return null;
      return { latitude: lat, longitude: lng };
    } catch {
      return null;
    }
  }

  async search(params: CarSearchParams): Promise<RentalCar[]> {
    const currency = params.currency || getCurrencyForCountry(params.country);
    const fallback = affiliateCar(params, currency, this.name);

    try {
      const pickup = await this.geocode(params.pickupLocation);
      if (!pickup) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[BookingComCars] geocode failed for:", params.pickupLocation);
        }
        return [fallback];
      }

      const dropoff =
        params.dropoffLocation && params.dropoffLocation !== params.pickupLocation
          ? ((await this.geocode(params.dropoffLocation)) ?? pickup)
          : pickup;

      const sp = new URLSearchParams({
        pick_up_latitude: String(pickup.latitude),
        pick_up_longitude: String(pickup.longitude),
        drop_off_latitude: String(dropoff.latitude),
        drop_off_longitude: String(dropoff.longitude),
        pick_up_date: params.pickupDatetime.slice(0, 10),
        pick_up_time: params.pickupDatetime.slice(11, 16),
        drop_off_date: params.dropoffDatetime.slice(0, 10),
        drop_off_time: params.dropoffDatetime.slice(11, 16),
        driver_age: String(params.driverAge),
        currency_code: currency,
        units: "imperial",
      });

      const carsRes = await fetch(
        `https://${API_HOST}/api/v1/cars/searchCarRentals?${sp}`,
        {
          headers: {
            "X-RapidAPI-Key": this.apiKey,
            "X-RapidAPI-Host": API_HOST,
          },
        }
      );

      if (!carsRes.ok) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[BookingComCars] searchCarRentals HTTP", carsRes.status);
        }
        return [fallback];
      }

      const json = await carsRes.json() as Record<string, unknown>;

      if (process.env.NODE_ENV !== "production") {
        const firstKeys = Object.keys(
          (json?.data as Record<string, unknown> | undefined)
            ?.search_results instanceof Array
            ? ((json.data as Record<string, unknown>).search_results as unknown[])[0] ?? {}
            : {}
        );
        console.log("[BookingComCars] status:", json?.status, "| first result keys:", firstKeys);
      }

      const results = (json?.data as Record<string, unknown> | undefined)
        ?.search_results as unknown[] | undefined;

      if (!Array.isArray(results) || results.length === 0) {
        return [fallback];
      }

      const days = calcDays(params.pickupDatetime, params.dropoffDatetime);
      return results.slice(0, 12).map(r => mapCarResult(r, params, currency, days, this.name));
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[BookingComCars] search error:", err);
      }
      return [fallback];
    }
  }
}
