export interface FlightAffiliateLink {
  id: string;
  name: string;
  description: string;
  url: string;
}

interface FlightSearchParams {
  from: string;         // IATA origin e.g. "BKK"
  to: string;           // IATA destination e.g. "HKT"
  date: string;         // YYYY-MM-DD departure
  returnDate?: string;  // YYYY-MM-DD return — omit for one-way
  adults: number;
  country: string;      // ISO-3166-1 visitor country (unused for now, kept for future use)
}

// Major Asian airport IATA codes — Trip.com has real inventory for these routes
const ASIAN_AIRPORTS = new Set([
  // Thailand
  "BKK","DMK","HKT","CNX","HDY","UTP","CEI","NST","KBV","UBP","LOE","KKC","HHQ",
  // Singapore
  "SIN",
  // Malaysia
  "KUL","PEN","BKI","LGK","KBR","JHB",
  // Indonesia
  "CGK","DPS","SUB","UPG","MES","BPN","PKU",
  // Philippines
  "MNL","CEB","DVO","ILO","CRK",
  // Vietnam
  "SGN","HAN","DAD","HPH","CXR","PQC","VCA",
  // Cambodia / Laos / Myanmar
  "REP","PNH","KOS","RGN","MDL","VTE","LPQ",
  // Japan
  "NRT","HND","KIX","NGO","CTS","FUK","OKA","ITM",
  // South Korea
  "ICN","GMP","PUS","CJU",
  // China
  "PEK","PKX","PVG","SHA","CAN","SZX","CTU","CKG","WUH","XMN","CSX","HGH","KMG","URC","HAK",
  // Taiwan / Hong Kong / Macau
  "TPE","KHH","TSA","HKG","MFM",
  // India
  "BOM","DEL","MAA","BLR","CCU","HYD","AMD","GOI","COK","TRV","PAT","LKO","IXC","ATQ","BBI",
  // Sri Lanka / Bangladesh / Nepal / Pakistan
  "CMB","DAC","CGP","KTM","KHI","LHE","ISB","PEW",
]);

// Show Trip.com only when the route involves an Asian airport
function isAsianRoute(from: string, to: string): boolean {
  return ASIAN_AIRPORTS.has(from.toUpperCase()) || ASIAN_AIRPORTS.has(to.toUpperCase());
}

// Trip.com uses primary city-airport codes — map secondary airports to their city hub
const TRIP_COM_CODE: Record<string, string> = {
  // Bangkok — DMK (Don Mueang) → BKK (Suvarnabhumi)
  DMK: "BKK",
  // London secondary airports → Heathrow
  LGW: "LHR", LCY: "LHR", STN: "LHR", LTN: "LHR", SEN: "LHR",
  // New York — EWR/LGA → JFK
  EWR: "JFK", LGA: "JFK",
  // Paris — Orly → CDG
  ORY: "CDG",
  // Milan secondary → MXP
  BGY: "MXP", LIN: "MXP",
  // Rome — Ciampino → FCO
  CIA: "FCO",
  // Tokyo — NRT and HND both work but map HND → NRT for consistency
  HND: "NRT",
  // Osaka — ITM → KIX
  ITM: "KIX",
  // Kuala Lumpur — SZB → KUL
  SZB: "KUL",
  // Jakarta — HLP → CGK
  HLP: "CGK",
};

function toTripComCode(iata: string): string {
  return TRIP_COM_CODE[iata.toUpperCase()] ?? iata.toUpperCase();
}

// ── Affiliate configs ──────────────────────────────────────────────────────────

const AFFILIATES: Array<FlightAffiliateLink & {
  showFor: (p: FlightSearchParams) => boolean;
  buildUrl: (p: FlightSearchParams) => string;
}> = [
  {
    id: "tripcom",
    name: "Trip.com",
    description: "Compare hundreds of airlines worldwide",
    url: "",
    // Only show when the route involves Asia — Trip.com has thin inventory elsewhere
    showFor: ({ from, to }) => isAsianRoute(from, to),
    buildUrl: ({ from, to, date, returnDate, adults }) => {
      const tripType = returnDate ? "D" : "S";
      const tcFrom = toTripComCode(from);
      const tcTo = toTripComCode(to);
      const params = new URLSearchParams({
        flighttype: tripType,
        dcity: tcFrom,
        acity: tcTo,
        ddate: date,
        adult: String(adults),
        Allianceid: "8495775",
        SID: "316966000",
        trip_sub1: "",
        trip_sub3: "D17566096",
        ...(returnDate ? { rdate: returnDate } : {}),
      });
      return `https://www.trip.com/flights/${tcFrom}-${tcTo}/tickets-${tcFrom}-${tcTo}?${params}`;
    },
  },
  {
    id: "expedia",
    name: "Expedia",
    description: "Book flights with free cancellation options",
    url: "",
    showFor: () => true,
    buildUrl: ({ from, to, date, returnDate, adults }) => {
      const isRoundtrip = !!returnDate;
      const toExpediaDate = (iso: string) => {
        const [y, m, d] = iso.split("-");
        return `${parseInt(m!)}/${parseInt(d!)}/${y}`;
      };
      const leg1 = `from:${from},to:${to},departure:${toExpediaDate(date)}TANYT`;
      const params = new URLSearchParams({
        "flight-type": "on",
        mode: "search",
        trip: isRoundtrip ? "roundtrip" : "oneway",
        leg1,
        ...(isRoundtrip && returnDate ? {
          leg2: `from:${to},to:${from},departure:${toExpediaDate(returnDate)}TANYT`,
          toDate: toExpediaDate(returnDate),
          d2: returnDate,
        } : {}),
        fromDate: toExpediaDate(date),
        d1: date,
        passengers: `children:0,adults:${adults},seniors:0,infantinlap:Y`,
        options: "cabinclass:economy",
        clickref: "1011lDafjZ8I",
        affcid: "AU.DIRECT.PHG.1011l432356.1100l86802",
        ref_id: "1011lDafjZ8I",
        my_ad: "AFF.AU.DIRECT.PHG.1011l432356.1100l86802",
        afflid: "1011lDafjZ8I",
        affdtl: "PHG.1011lDafjZ8I.PZp1tdJx5a",
      });
      return `https://www.expedia.com/Flights-Search?${params}`;
    },
  },

  // ── Country-specific partners (add future ones here) ──────────────────────
  // {
  //   id: "milhas",
  //   name: "123milhas",
  //   description: "Voos nacionais e internacionais",
  //   url: "",
  //   showFor: ({ country }) => country === "BR",
  //   buildUrl: ({ from, to, date }) =>
  //     `https://123milhas.com/v2/passagens/${from}/${to}/${date}/1/0/0/E?utm_source=burrowsoft`,
  // },
];

// ── Public API ─────────────────────────────────────────────────────────────────

export function buildFlightAffiliateLinks(params: FlightSearchParams): FlightAffiliateLink[] {
  return AFFILIATES
    .filter(a => a.showFor(params))
    .map(({ showFor, buildUrl, ...rest }) => ({
      ...rest,
      url: buildUrl(params),
    }));
}
