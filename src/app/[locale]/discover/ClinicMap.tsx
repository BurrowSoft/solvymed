"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { useTranslations } from "next-intl";
import type { ClinicListing } from "./page";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

type Props = {
  clinics: ClinicListing[];
  onSelect: (clinic: ClinicListing) => void;
};

export function ClinicMap({ clinics, onSelect }: Props) {
  const t = useTranslations("discover");
  useEffect(() => {
    // Leaflet bundles its marker images relative to the JS file — fix for Next.js
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });
  }, []);

  const pinned = clinics.filter((c) => c.lat != null && c.lng != null);
  const center: [number, number] =
    pinned.length > 0 ? [pinned[0].lat!, pinned[0].lng!] : [-14.235, -51.925];
  const zoom = pinned.length > 0 ? 13 : 4;

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      style={{ height: "100%", width: "100%", minHeight: 480 }}
      className="rounded-2xl z-0"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {pinned.map((clinic) => (
        <Marker key={clinic.id} position={[clinic.lat!, clinic.lng!]}>
          <Popup>
            <div className="text-sm">
              <p className="font-bold text-slate-900 mb-0.5">{clinic.name}</p>
              {clinic.city && (
                <p className="text-slate-500 mb-1">{[clinic.city, clinic.state].filter(Boolean).join(", ")}</p>
              )}
              <button
                onClick={() => onSelect(clinic)}
                className="text-teal-600 font-semibold hover:underline text-xs"
              >
                {t("viewDetails")}
              </button>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
