"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import HomeSidebar from "@/components/home/HomeSidebar";

type MapboxMap = import("mapbox-gl").Map;
type MapboxMarker = import("mapbox-gl").Marker;
type MapboxModule = typeof import("mapbox-gl")["default"];

type MapPin = {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
  date: string;
  signup_count: number;
  max_volunteers: number | null;
  status: string;
};

type FoodPantryPin = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  address?: string;
};

type GeocodeSuggestion = {
  place_name: string;
  center: [number, number]; // [lng, lat]
};

type LngLat = { lat: number; lng: number };

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
const MAPBOX_TOKEN = (process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || "").trim();
const DEFAULT_CENTER: LngLat = { lat: 40.7128, lng: -74.006 };
const DEFAULT_ZOOM = 11;
const USER_ZOOM = 14;
const DEFAULT_RADIUS_KM = 5;

const parseArrayData = <T,>(payload: unknown): T[] => {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  if (Array.isArray(root.data)) return root.data as T[];
  if (Array.isArray(root.items)) return root.items as T[];
  if (Array.isArray(payload)) return payload as T[];
  return [];
};

// Campaign pin — green teardrop. No inner translateY: Mapbox anchor="bottom" handles placement.
const createCampaignPin = (): HTMLDivElement => {
  const el = document.createElement("div");
  el.style.cursor = "pointer";
  el.innerHTML = `
    <div style="width:36px;height:44px;filter:drop-shadow(0 3px 6px rgba(0,0,0,0.28));">
      <svg viewBox="0 0 36 44" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
        <path d="M18 2C10.268 2 4 8.268 4 16c0 10.5 14 26 14 26S32 26.5 32 16C32 8.268 25.732 2 18 2z" fill="#16a34a" stroke="#fff" stroke-width="1.5"/>
        <circle cx="18" cy="16" r="7" fill="rgba(255,255,255,0.2)"/>
        <text x="18" y="20.5" text-anchor="middle" font-size="11" fill="white">🌱</text>
      </svg>
    </div>
  `;
  return el;
};

// User location pin — bold blue beacon, clearly distinct from campaign/pantry pins.
const createUserLocationPin = (): HTMLDivElement => {
  const el = document.createElement("div");
  el.style.cursor = "default";
  el.innerHTML = `
    <div style="position:relative;width:36px;height:36px;">
      <div style="
        position:absolute;inset:-8px;border-radius:50%;
        border:2.5px solid rgba(59,130,246,0.35);
        animation:tracka-pulse 2s ease-out infinite;
      "></div>
      <div style="
        position:absolute;inset:0;border-radius:50%;
        background:#2563eb;
        border:4px solid #fff;
        box-shadow:0 3px 12px rgba(37,99,235,0.55);
      "></div>
      <div style="
        position:absolute;inset:10px;border-radius:50%;
        background:rgba(255,255,255,0.85);
      "></div>
    </div>
  `;
  return el;
};

// Pantry pin — amber teardrop. No inner translateY.
const createPantryPin = (): HTMLDivElement => {
  const el = document.createElement("div");
  el.style.cursor = "pointer";
  el.innerHTML = `
    <div style="width:32px;height:39px;filter:drop-shadow(0 3px 6px rgba(0,0,0,0.22));">
      <svg viewBox="0 0 32 39" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
        <path d="M16 2C9.373 2 4 7.373 4 14c0 9.333 12 23 12 23S28 23.333 28 14C28 7.373 22.627 2 16 2z" fill="#f59e0b" stroke="#fff" stroke-width="1.5"/>
        <circle cx="16" cy="14" r="6" fill="rgba(255,255,255,0.2)"/>
        <text x="16" y="18" text-anchor="middle" font-size="10" fill="white">🍎</text>
      </svg>
    </div>
  `;
  return el;
};

export default function HomeDiscoverPage() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<MapboxMarker[]>([]);
  const userMarkerRef = useRef<MapboxMarker | null>(null);

  const [mapReady, setMapReady] = useState(false);
  const [searchCenter, setSearchCenter] = useState<LngLat>(DEFAULT_CENTER);
  const [userLocation, setUserLocation] = useState<LngLat | null>(null);
  const [hasMoved, setHasMoved] = useState(false);
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM);
  const [campaignPins, setCampaignPins] = useState<MapPin[]>([]);
  const [pantryPins, setPantryPins] = useState<FoodPantryPin[]>([]);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");

  // Location search state
  const [locationQuery, setLocationQuery] = useState("");
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([]);
  const [geocoding, setGeocoding] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement | null>(null);

  const totalCampaigns = useMemo(() => campaignPins.length, [campaignPins]);
  const totalPantries = useMemo(() => pantryPins.length, [pantryPins]);

  // ── Geolocation ────────────────────────────────────────────────────────────
  const requestLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const loc: LngLat = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setUserLocation(loc);
        setSearchCenter(loc);
        setLocating(false);
        mapRef.current?.flyTo({ center: [loc.lng, loc.lat], zoom: USER_ZOOM, duration: 1200 });
      },
      () => setLocating(false),
      // maximumAge: 0 forces a fresh GPS fix every time, ignoring cached position
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  useEffect(() => {
    requestLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Geocoding search ───────────────────────────────────────────────────────
  const fetchSuggestions = async (q: string) => {
    if (!q.trim() || !MAPBOX_TOKEN) { setSuggestions([]); return; }
    setGeocoding(true);
    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
        `?access_token=${MAPBOX_TOKEN}&types=place,postcode,address,neighborhood&country=US&limit=5`
      );
      const data = await res.json();
      setSuggestions((data.features ?? []) as GeocodeSuggestion[]);
      setShowSuggestions(true);
    } catch {
      setSuggestions([]);
    } finally {
      setGeocoding(false);
    }
  };

  const applyGeocodedLocation = (suggestion: GeocodeSuggestion) => {
    const [lng, lat] = suggestion.center;
    const loc: LngLat = { lat, lng };
    setSearchCenter(loc);
    setLocationQuery(suggestion.place_name);
    setSuggestions([]);
    setShowSuggestions(false);
    setHasMoved(false);
    mapRef.current?.flyTo({ center: [lng, lat], zoom: USER_ZOOM, duration: 1000 });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (suggestions.length > 0) {
      applyGeocodedLocation(suggestions[0]);
    } else {
      fetchSuggestions(locationQuery);
    }
  };

  // Close suggestions when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Initialise Mapbox once ─────────────────────────────────────────────────
  useEffect(() => {
    if (!MAPBOX_TOKEN || !mapContainerRef.current || mapRef.current) return;
    let cancelled = false;

    const initMap = async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled || !mapContainerRef.current) return;

      mapboxgl.accessToken = MAPBOX_TOKEN;
      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat],
        zoom: DEFAULT_ZOOM,
      });

      map.on("load", () => { if (!cancelled) setMapReady(true); });
      map.on("moveend", () => setHasMoved(true));
      mapRef.current = map;
    };

    void initMap();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  // ── Fetch pins whenever searchCenter or radius changes ─────────────────────
  useEffect(() => {
    const fetchPins = async () => {
      setLoading(true);
      setError("");
      try {
        const [campaignRes, pantryRes] = await Promise.allSettled([
          fetch(`${API_BASE}/map/campaigns?lat=${searchCenter.lat}&lng=${searchCenter.lng}&radius_km=${radiusKm}&status=published`),
          fetch(`${API_BASE}/map/food-pantries?lat=${searchCenter.lat}&lng=${searchCenter.lng}&radius_km=${radiusKm}`),
        ]);

        const issues: string[] = [];
        let nextCampaignPins: MapPin[] = [];
        if (campaignRes.status === "fulfilled" && campaignRes.value.ok) {
          nextCampaignPins = parseArrayData<MapPin>(await campaignRes.value.json());
        } else {
          issues.push("Campaigns unavailable");
        }

        let backendPantries: FoodPantryPin[] = [];
        if (pantryRes.status === "fulfilled" && pantryRes.value.ok) {
          backendPantries = parseArrayData<FoodPantryPin>(await pantryRes.value.json());
        } else {
          issues.push("Pantries unavailable");
        }

        // Deduplicate pantries that share the same name + coords
        const dedupedPantries = backendPantries.filter(
          (pin, index, all) =>
            all.findIndex(
              (c) =>
                c.name.toLowerCase() === pin.name.toLowerCase() &&
                Math.abs(c.latitude - pin.latitude) < 0.0001 &&
                Math.abs(c.longitude - pin.longitude) < 0.0001
            ) === index
        );

        setCampaignPins(nextCampaignPins);
        setPantryPins(dedupedPantries);
        if (issues.length) setError(`Partial data: ${issues.join(" | ")}`);
      } catch (err) {
        setCampaignPins([]);
        setPantryPins([]);
        setError(err instanceof Error ? err.message : "Unable to load map data.");
      } finally {
        setLoading(false);
      }
    };
    void fetchPins();
  }, [searchCenter.lat, searchCenter.lng, radiusKm]);

  // ── Draw campaign + pantry markers ─────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !MAPBOX_TOKEN) return;

    const drawMarkers = async () => {
      const mapboxgl: MapboxModule = (await import("mapbox-gl")).default;
      const map = mapRef.current;
      if (!map) return;

      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      campaignPins.forEach((pin) => {
        const popup = new mapboxgl.Popup({ offset: 20, className: "tracka-popup" }).setHTML(`
          <div style="font-family:system-ui;min-width:200px;padding:4px 2px">
            <div style="font-weight:700;font-size:14px;color:#0f172a;margin-bottom:4px">${pin.title}</div>
            <div style="font-size:12px;color:#64748b;margin-bottom:4px">📅 ${pin.date}</div>
            <div style="font-size:12px;color:#16a34a;font-weight:600">
              ${pin.signup_count}${pin.max_volunteers ? `/${pin.max_volunteers}` : ""} volunteers joined
            </div>
          </div>
        `);
        markersRef.current.push(
          new mapboxgl.Marker({ element: createCampaignPin(), anchor: "bottom" })
            .setLngLat([pin.longitude, pin.latitude])
            .setPopup(popup)
            .addTo(map)
        );
      });

      pantryPins.forEach((pin) => {
        const popup = new mapboxgl.Popup({ offset: 18, className: "tracka-popup" }).setHTML(`
          <div style="font-family:system-ui;min-width:200px;padding:4px 2px">
            <div style="font-weight:700;font-size:14px;color:#0f172a;margin-bottom:4px">${pin.name}</div>
            <div style="font-size:12px;color:#64748b">📍 ${pin.address ?? "Food pantry"}</div>
          </div>
        `);
        markersRef.current.push(
          new mapboxgl.Marker({ element: createPantryPin(), anchor: "bottom" })
            .setLngLat([pin.longitude, pin.latitude])
            .setPopup(popup)
            .addTo(map)
        );
      });
    };

    void drawMarkers();
  }, [campaignPins, pantryPins, mapReady]);

  // ── Place / update "You are here" pin ─────────────────────────────────────
  useEffect(() => {
    if (!userLocation || !mapReady || !MAPBOX_TOKEN) return;

    const placeUserPin = async () => {
      const mapboxgl: MapboxModule = (await import("mapbox-gl")).default;
      const map = mapRef.current;
      if (!map) return;

      if (userMarkerRef.current) {
        userMarkerRef.current.setLngLat([userLocation.lng, userLocation.lat]);
      } else {
        const popup = new mapboxgl.Popup({ offset: 18, className: "tracka-popup" }).setHTML(
          `<div style="font-family:system-ui;padding:4px 2px;font-size:13px;font-weight:600;color:#1e40af">📍 You are here</div>`
        );
        userMarkerRef.current = new mapboxgl.Marker({
          element: createUserLocationPin(),
          anchor: "center",
        })
          .setLngLat([userLocation.lng, userLocation.lat])
          .setPopup(popup)
          .addTo(map);
      }
    };

    void placeUserPin();
  }, [userLocation, mapReady]);

  return (
    <>
      <HomeSidebar />
      <main className="min-h-screen bg-[#FFFEF5] px-6 py-10 text-slate-700 md:ml-24 lg:ml-72">
        <div className="mx-auto max-w-6xl space-y-5">

          {/* Header row */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-[#0F172A]">Discover Nearby Impact</h1>
              <p className="mt-1 text-sm text-slate-500">Campaigns and food pantries near you.</p>
            </div>
            <button
              onClick={requestLocation}
              disabled={locating}
              className="flex shrink-0 items-center gap-1.5 self-start rounded-full bg-blue-50 px-4 py-2 text-xs font-medium text-blue-700 ring-1 ring-blue-200 transition hover:bg-blue-100 disabled:opacity-60 sm:self-auto"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <circle cx="12" cy="12" r="3" />
                <path strokeLinecap="round" d="M12 2v3M12 19v3M2 12h3M19 12h3" />
              </svg>
              {locating ? "Locating…" : "Locate me"}
            </button>
          </div>

          {/* Search + filter bar */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {/* Address / zipcode search */}
            <div ref={searchRef} className="relative flex-1">
              <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
                <div className="relative flex-1">
                  <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search by address, zipcode, or neighborhood…"
                    value={locationQuery}
                    onChange={(e) => {
                      setLocationQuery(e.target.value);
                      if (e.target.value.length > 2) fetchSuggestions(e.target.value);
                      else { setSuggestions([]); setShowSuggestions(false); }
                    }}
                    onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                    className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 shadow-sm placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                  />
                </div>
                <button
                  type="submit"
                  disabled={geocoding || !locationQuery.trim()}
                  className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-600 disabled:opacity-50"
                >
                  {geocoding ? "…" : "Go"}
                </button>
              </form>

              {/* Autocomplete dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <ul className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                  {suggestions.map((s, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => applyGeocodedLocation(s)}
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-700"
                      >
                        <svg className="h-3.5 w-3.5 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                          <circle cx="12" cy="9" r="2.5" />
                        </svg>
                        <span className="truncate">{s.place_name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Radius filter */}
            <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <span className="mr-1 text-xs text-slate-500">Radius:</span>
              {[1, 3, 5, 10].map((km) => (
                <button
                  key={km}
                  onClick={() => setRadiusKm(km)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    radiusKm === km ? "bg-emerald-500 text-white" : "text-slate-500 hover:bg-slate-100"
                  }`}
                >
                  {km}km
                </button>
              ))}
            </div>
          </div>

          {/* Stats bar */}
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">🌱 {totalCampaigns} campaign{totalCampaigns !== 1 ? "s" : ""}</span>
            <span className="rounded-full bg-yellow-100 px-3 py-1 text-yellow-700">🍎 {totalPantries} pantr{totalPantries !== 1 ? "ies" : "y"}</span>
            {loading && <span className="text-slate-400">Refreshing…</span>}
          </div>

          {!MAPBOX_TOKEN && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              Add NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN to your frontend .env to render the map.
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          {/* Map */}
          <section className="overflow-hidden rounded-3xl border border-yellow-100 bg-white shadow-lg shadow-yellow-100/60">
            <div className="relative h-[580px]">
              <div ref={mapContainerRef} className="h-full w-full" />

              {/* Search this area pill */}
              {hasMoved && !loading && (
                <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2">
                  <button
                    onClick={() => {
                      const map = mapRef.current;
                      if (!map) return;
                      const c = map.getCenter();
                      setSearchCenter({ lat: c.lat, lng: c.lng });
                      setHasMoved(false);
                    }}
                    className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-lg ring-1 ring-slate-200 transition hover:bg-slate-50"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35" />
                    </svg>
                    Search this area
                  </button>
                </div>
              )}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-5 border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
              <span className="inline-flex items-center gap-2">
                <span className="h-3.5 w-3.5 rounded-full border-2 border-white bg-blue-600 shadow" />
                You
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-3.5 w-3.5 rounded-full bg-emerald-600" />
                Campaign
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-3.5 w-3.5 rounded-full bg-yellow-500" />
                Food Pantry
              </span>
            </div>
          </section>
        </div>
      </main>

      <style>{`
        @keyframes tracka-pulse {
          0%   { transform: scale(1);   opacity: 0.8; }
          70%  { transform: scale(2.2); opacity: 0; }
          100% { transform: scale(2.2); opacity: 0; }
        }
      `}</style>
    </>
  );
}
