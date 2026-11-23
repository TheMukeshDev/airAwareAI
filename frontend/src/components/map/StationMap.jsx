import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import { useEffect } from "react";
import { classifyAqi } from "../../lib/aqi";
import { formatNumber } from "../../lib/utils";
import { DEFAULT_COORDS } from "../../lib/constants";

const TILE_URL = "/api/map/tiles/dark_all/{z}/{x}/{y}.png";

function Recenter({ center }) {

  const map = useMap();
  useEffect(() => {
    if (center?.latitude && center?.longitude) {
      const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      map.setView([center.latitude, center.longitude], map.getZoom(), { animate: !reduceMotion });
    }
  }, [center?.latitude, center?.longitude, map]);
  return null;
}

export function StationMap({ center, stations = [], height = 380, activeId, onSelect, label = "Air quality map" }) {
  const lat = center?.latitude ?? DEFAULT_COORDS.latitude;
  const lng = center?.longitude ?? DEFAULT_COORDS.longitude;

  return (
    <div
      className="overflow-hidden rounded-2xl border border-hairline"
      style={{ height }}
      role="region"
      aria-label={`${label}. Use the station list below for detailed readings.`}
    >
      <MapContainer
        center={[lat, lng]}
        zoom={10}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%" }}
        attributionControl
      >
        <TileLayer
          url={TILE_URL}

          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          maxZoom={19}
        />
        <Recenter center={{ latitude: lat, longitude: lng }} />
        {stations.map((station) => {
          const category = classifyAqi(station.aqi, station.scale ?? "us");
          const active = station.id === activeId;
          return (
            <CircleMarker
              key={station.id ?? `${station.latitude}-${station.longitude}`}
              center={[station.latitude, station.longitude]}
              radius={active ? 13 : 9}
              pathOptions={{
                color: category.style.hex,
                fillColor: category.style.hex,
                fillOpacity: active ? 0.55 : 0.3,
                weight: active ? 3 : 2,
              }}
              eventHandlers={{ click: () => onSelect?.(station) }}
            >
              <Popup>
                <div className="min-w-[150px]">
                  <p className="text-[12.5px] font-semibold text-white">{station.name}</p>
                  <p className="mt-1 text-[12px] text-slate-300">
                    AQI {station.aqi ?? "—"} · {category.label}
                  </p>
                  {station.pm2_5 !== undefined ? (
                    <p className="mt-0.5 text-[12px] text-slate-300">PM2.5 {formatNumber(station.pm2_5)} µg/m³</p>
                  ) : null}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
        <CircleMarker
          center={[lat, lng]}
          radius={5}
          pathOptions={{ color: "#38bdf8", fillColor: "#38bdf8", fillOpacity: 0.9, weight: 2 }}
        >
          <Popup>
            <span className="text-[12px] text-slate-200">Your selected location</span>
          </Popup>
        </CircleMarker>
      </MapContainer>
    </div>
  );
}

export default StationMap;
