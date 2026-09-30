"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";

// A CSS pin (no image assets, which bundlers don't resolve for Leaflet's
// default marker).
const PIN = L.divIcon({
  className: "",
  html: '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:#0d9488;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);transform:rotate(-45deg)"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 22],
});

// A click on the map also moves the pin there.
function ClickToMove({ onMove }: { onMove: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onMove(e.latlng.lat, e.latlng.lng) });
  return null;
}

// OpenStreetMap tiles, loaded only while this dialog is open. Per OSM's tile
// usage policy: the attribution is shown and requests carry a Referer.
export default function ClinicPinMap({
  lat,
  lng,
  zoom,
  onMove,
}: {
  lat: number;
  lng: number;
  zoom: number;
  onMove: (lat: number, lng: number) => void;
}) {
  return (
    <MapContainer center={[lat, lng]} zoom={zoom} scrollWheelZoom className="h-72 w-full rounded-xl" style={{ zIndex: 0 }}>
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        maxZoom={19}
        referrerPolicy="strict-origin-when-cross-origin"
      />
      <Marker
        position={[lat, lng]}
        icon={PIN}
        draggable
        eventHandlers={{
          dragend: (e) => {
            const p = (e.target as L.Marker).getLatLng();
            onMove(p.lat, p.lng);
          },
        }}
      />
      <ClickToMove onMove={onMove} />
    </MapContainer>
  );
}
