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
  // handle { data: { pantries: [...] } } shape
  if (root.data && typeof root.data === "object") {
    const inner = root.data as Record<string, unknown>;
    for (const val of Object.values(inner)) {
      if (Array.isArray(val)) return val as T[];
    }
  }
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

  // Campaign keyword search
  const [campaignQuery, setCampaignQuery] = useState("");
  const [showList, setShowList] = useState(false);

  const filteredCampaignPins = useMemo(() => {
    const q = campaignQuery.trim().toLowerCase();
    if (!q) return campaignPins;
    return campaignPins.filter((p) => p.title.toLowerCase().includes(q));
  }, [campaignPins, campaignQuery]);

  const totalCampaigns = useMemo(() => filteredCampaignPins.length, [filteredCampaignPins]);
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

      filteredCampaignPins.forEach((pin) => {
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
  }, [filteredCampaignPins, pantryPins, mapReady]);

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
      <main className="min-h-screen bg-[#FFF8E1] px-6 py-10 text-[#1A1A1A] md:ml-24 lg:ml-72">
        <div className="mx-auto max-w-6xl space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <span className="rounded-full bg-[#FEF3C7] px-3 py-1 text-[#92400E]">Events: {totalCampaigns}</span>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-[#6B7280]">Pantries: {totalPantries}</span>
              <div className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 text-[#6B7280]">
                <span>Radius:</span>
                {[1, 3, 5, 10].map((km) => (
                  <button
                    key={km}
                    onClick={() => setRadiusKm(km)}
                    className={`rounded-full px-2 py-0.5 font-medium transition-colors ${
                      radiusKm === km ? "bg-[#F5C542] text-[#1A1A1A]" : "hover:bg-gray-50 text-[#6B7280]"
                    }`}
                  >
                    {km}km
                  </button>
                ))}
              </div>
            </div>
          </div>

          <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-[#1A1A1A]">Discover Nearby Impact</h1>
              <p className="mt-1 text-sm text-[#6B7280]">
                Flyering campaigns and food pantries near you.
              </p>
            </div>
            <button
              onClick={requestLocation}
              disabled={locating}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#FEF3C7] px-4 py-2 text-xs font-medium text-[#1A1A1A] ring-1 ring-[#F5C542]/50 transition hover:bg-[#FDE68A] disabled:opacity-60"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <circle cx="12" cy="12" r="3" /><path strokeLinecap="round" d="M12 2v3M12 19v3M2 12h3M19 12h3" />
              </svg>
              {locating ? "Locating…" : userLocation ? "Re-locate me" : "Locate me"}
            </button>
          </div>

          {/* ── Search row ── */}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            {/* Location address search */}
            <div ref={searchRef} className="relative flex-1">
              <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]">📍</span>
                  <input
                    type="text"
                    value={locationQuery}
                    onChange={(e) => {
                      setLocationQuery(e.target.value);
                      fetchSuggestions(e.target.value);
                    }}
                    placeholder="Search location…"
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-8 pr-3 text-sm text-[#1A1A1A] placeholder-[#9CA3AF] outline-none focus:border-[#F5C542] focus:ring-1 focus:ring-[#F5C542]/50"
                  />
                  {geocoding && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#9CA3AF]">…</span>
                  )}
                </div>
                <button
                  type="submit"
                  className="rounded-xl bg-[#F5C542] px-4 py-2 text-sm font-semibold text-[#1A1A1A] transition hover:bg-[#FDE68A]"
                >
                  Go
                </button>
              </form>
              {showSuggestions && suggestions.length > 0 && (
                <ul className="absolute z-30 mt-1 w-full rounded-xl border border-gray-100 bg-white py-1 shadow-lg">
                  {suggestions.map((s, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        onMouseDown={() => applyGeocodedLocation(s)}
                        className="w-full px-4 py-2 text-left text-sm text-[#1A1A1A] hover:bg-[#FEF3C7]"
                      >
                        {s.place_name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Campaign keyword search */}
            <div className="relative sm:w-64">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]">🔍</span>
              <input
                type="text"
                value={campaignQuery}
                onChange={(e) => {
                  setCampaignQuery(e.target.value);
                  setShowList(e.target.value.trim().length > 0);
                }}
                placeholder="Search campaigns…"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-8 pr-3 text-sm text-[#1A1A1A] placeholder-[#9CA3AF] outline-none focus:border-[#F5C542] focus:ring-1 focus:ring-[#F5C542]/50"
              />
            </div>
          </div>

          {/* Campaign search results list */}
          {showList && (
            <div className="mt-3 max-h-52 overflow-y-auto rounded-2xl border border-gray-100 bg-gray-50 p-2">
              {filteredCampaignPins.length === 0 ? (
                <p className="px-3 py-2 text-sm text-[#6B7280]">No campaigns match "{campaignQuery}"</p>
              ) : (
                filteredCampaignPins.map((pin) => (
                  <button
                    key={pin.id}
                    type="button"
                    onClick={() => {
                      mapRef.current?.flyTo({ center: [pin.longitude, pin.latitude], zoom: 15, duration: 900 });
                      setShowList(false);
                    }}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-[#1A1A1A] transition hover:bg-[#FEF3C7]"
                  >
                    <span className="font-medium">🌱 {pin.title}</span>
                    <span className="text-xs text-[#6B7280]">{pin.date}</span>
                  </button>
                ))
              )}
            </div>
          )}

          {!MAPBOX_TOKEN && (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              Add NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN to your frontend .env to render the map.
            </div>
          )}

          {error && (
            <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          <div className="relative mt-5 h-[560px] overflow-hidden rounded-2xl border border-gray-200 bg-white">
            <div ref={mapContainerRef} className="h-full w-full" />
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
                  className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-[#1A1A1A] shadow-sm ring-1 ring-gray-200 hover:bg-gray-50 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-[#1A1A1A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35" />
                  </svg>
                  Search this area
                </button>
              </div>
            )}
          </div>

          <style>{`
            @keyframes tracka-pulse {
              0%   { transform: scale(1);   opacity: 0.7; }
              70%  { transform: scale(2.4); opacity: 0; }
              100% { transform: scale(2.4); opacity: 0; }
            }
          `}</style>
          <div className="mt-3 flex items-center gap-4 text-xs text-[#6B7280]">
            <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-blue-500" /> You</span>
            <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-[#EA580C]" /> Campaign</span>
            <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-[#F5C542]" /> Food Pantry</span>
            {loading ? <span className="text-[#9CA3AF]">Refreshing pins…</span> : null}
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
