export interface HotelAffiliateLink {
  id: string;
  name: string;
  description: string;
  url: string;
}

interface HotelSearchParams {
  destination: string;   // city name e.g. "Bangkok"
  checkin: string;       // YYYY-MM-DD
  checkout: string;      // YYYY-MM-DD
  guests: number;
  rooms: number;
  country: string;       // ISO-3166-1 visitor country (kept for future use)
}

// Asian city names — Trip.com has real hotel inventory for these destinations
const ASIAN_CITIES = new Set([
  // Thailand
  "bangkok","phuket","chiang mai","pattaya","hua hin","koh samui","krabi","koh phi phi",
  "ayutthaya","chiang rai","kanchanaburi","sukhothai","pai","udon thani","khon kaen",
  // Japan
  "tokyo","osaka","kyoto","hiroshima","nagoya","sapporo","fukuoka","nara","okinawa",
  "hakone","nikko","yokohama","kobe","sendai","nagasaki","kumamoto","kanazawa",
  // South Korea
  "seoul","busan","jeju","incheon","daegu","gyeongju","jeonju",
  // Singapore
  "singapore",
  // Malaysia
  "kuala lumpur","penang","langkawi","kota kinabalu","malacca","johor bahru","ipoh",
  // Indonesia
  "bali","jakarta","yogyakarta","lombok","surabaya","medan","makassar","bandung","ubud",
  // Philippines
  "manila","cebu","boracay","palawan","davao","el nido","coron",
  // Vietnam
  "ho chi minh city","hanoi","da nang","hoi an","nha trang","phu quoc","hue","ha long",
  "sapa","da lat","can tho","vung tau",
  // Cambodia / Laos / Myanmar
  "siem reap","phnom penh","vientiane","luang prabang","yangon","mandalay","bagan",
  // China
  "beijing","shanghai","guangzhou","shenzhen","chengdu","xian","hangzhou","guilin",
  "chongqing","kunming","zhangjiajie","huangshan","suzhou","nanjing","wuhan","qingdao",
  // Taiwan
  "taipei","taichung","kaohsiung","tainan",
  // Hong Kong / Macau
  "hong kong","macau",
  // India
  "mumbai","delhi","new delhi","goa","jaipur","agra","varanasi","bangalore","chennai",
  "hyderabad","kolkata","cochin","amritsar","udaipur","mysore","pondicherry",
  // Sri Lanka / Nepal / Bangladesh / Pakistan
  "colombo","kandy","kathmandu","pokhara","dhaka","lahore","islamabad","karachi",
]);

function isAsianDestination(destination: string): boolean {
  return ASIAN_CITIES.has(destination.toLowerCase().trim());
}

// ── Affiliate configs ──────────────────────────────────────────────────────────

const AFFILIATES: Array<HotelAffiliateLink & {
  showFor: (p: HotelSearchParams) => boolean;
  buildUrl: (p: HotelSearchParams) => string;
}> = [
  {
    id: "expedia",
    name: "Expedia",
    description: "Compare hotels with free cancellation options",
    url: "",
    showFor: () => true,
    buildUrl: ({ destination, checkin, checkout, guests, rooms }) => {
      const params = new URLSearchParams({
        destination,
        startDate: checkin,
        endDate: checkout,
        d1: checkin,
        d2: checkout,
        rooms: String(rooms),
        adults: String(guests),
        sort: "RECOMMENDED",
        useRewards: "false",
        clickref: "1101lDpu7jFI",
        affcid: "AU.DIRECT.PHG.1011l432356.1100l86802",
        ref_id: "1101lDpu7jFI",
        my_ad: "AFF.AU.DIRECT.PHG.1011l432356.1100l86802",
        afflid: "1101lDpu7jFI",
        affdtl: "PHG.1101lDpu7jFI.PZGjHMQLvC",
      });
      return `https://www.expedia.com/Hotel-Search?${params}`;
    },
  },
  {
    id: "tripcom",
    name: "Trip.com",
    description: "Great deals on hotels across Asia",
    url: "",
    // Only show for Asian destinations — Trip.com has thin inventory for EU/US cities
    showFor: ({ destination }) => isAsianDestination(destination),
    buildUrl: ({ destination, checkin, checkout, guests, rooms }) => {
      const params = new URLSearchParams({
        display: destination,
        optionType: "City",
        optionName: destination,
        checkIn: checkin,
        checkOut: checkout,
        adult: String(guests),
        room: String(rooms),
        Allianceid: "8495775",
        SID: "316966000",
        trip_sub1: "",
        trip_sub3: "D17566096",
      });
      return `https://www.trip.com/hotels/list?${params}`;
    },
  },

  // ── Country-specific partners (add future ones here) ──────────────────────
  // {
  //   id: "agoda",
  //   name: "Agoda",
  //   description: "Best prices in Asia",
  //   url: "",
  //   showFor: ({ destination }) => isAsianDestination(destination),
  //   buildUrl: (...) => ...
  // },
];

// ── Public API ─────────────────────────────────────────────────────────────────

export function buildHotelAffiliateLinks(params: HotelSearchParams): HotelAffiliateLink[] {
  return AFFILIATES
    .filter(a => a.showFor(params))
    .map(({ showFor, buildUrl, ...rest }) => ({
      ...rest,
      url: buildUrl(params),
    }));
}
