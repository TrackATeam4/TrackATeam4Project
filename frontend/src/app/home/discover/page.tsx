"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

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

type LngLat = { lat: number; lng: number };

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
const MAPBOX_TOKEN = (process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || "").trim();
const DEFAULT_CENTER: LngLat = { lat: 40.7128, lng: -74.006 };
const DEFAULT_RADIUS_KM = 5;

const parseArrayData = <T,>(payload: unknown): T[] => {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  if (Array.isArray(root.data)) return root.data as T[];
  if (Array.isArray(root.items)) return root.items as T[];
  if (Array.isArray(payload)) return payload as T[];
  return [];
};

// Campaign pin — green teardrop with a leaf icon
const createCampaignPin = (): HTMLDivElement => {
  const el = document.createElement("div");
  el.style.cursor = "pointer";
  el.innerHTML = `
    <div style="
      position:relative;
      width:36px;
      height:44px;
      filter:drop-shadow(0 3px 6px rgba(0,0,0,0.22));
      transform:translateY(-100%);
    ">
      <svg viewBox="0 0 36 44" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
        <path d="M18 2C10.268 2 4 8.268 4 16c0 10.5 14 26 14 26S32 26.5 32 16C32 8.268 25.732 2 18 2z" fill="#16a34a" stroke="#fff" stroke-width="1.5"/>
        <circle cx="18" cy="16" r="7" fill="rgba(255,255,255,0.2)"/>
        <text x="18" y="20.5" text-anchor="middle" font-size="11" fill="white">🌱</text>
      </svg>
    </div>
  `;
  return el;
};

// User location pin — blue pulsing dot
const createUserLocationPin = (): HTMLDivElement => {
  const el = document.createElement("div");
  el.innerHTML = `
    <div style="position:relative;width:20px;height:20px;">
      <div style="
        position:absolute;inset:0;border-radius:50%;
        background:rgba(59,130,246,0.25);
        animation:tracka-pulse 2s ease-out infinite;
      "></div>
      <div style="
        position:absolute;inset:4px;border-radius:50%;
        background:#3b82f6;border:2.5px solid #fff;
        box-shadow:0 2px 6px rgba(59,130,246,0.5);
      "></div>
    </div>
  `;
  return el;
};

// Pantry pin — amber teardrop with apple icon
const createPantryPin = (): HTMLDivElement => {
  const el = document.createElement("div");
  el.style.cursor = "pointer";
  el.innerHTML = `
    <div style="
      position:relative;
      width:32px;
      height:39px;
      filter:drop-shadow(0 3px 6px rgba(0,0,0,0.18));
      transform:translateY(-100%);
    ">
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

  const totalCampaigns = useMemo(() => campaignPins.length, [campaignPins]);
  const totalPantries = useMemo(() => pantryPins.length, [pantryPins]);

  // ── Request geolocation on mount ──────────────────────────────────────────
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
        // Fly the map to user's location
        if (mapRef.current) {
          mapRef.current.flyTo({ center: [loc.lng, loc.lat], zoom: 13, duration: 1200 });
        }
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  useEffect(() => {
    requestLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        zoom: 11,
      });

      map.on("load", () => {
        if (!cancelled) setMapReady(true);
      });

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
  }, []); // intentionally empty — map is only ever created once

  // ── Fetch pins whenever searchCenter or radius changes ─────────────────────
  useEffect(() => {
    const fetchPins = async () => {
      setLoading(true);
      setError("");

      try {
        const [campaignRes, pantryRes] = await Promise.allSettled([
          fetch(
            `${API_BASE}/map/campaigns?lat=${searchCenter.lat}&lng=${searchCenter.lng}&radius_km=${radiusKm}&status=published`
          ),
          fetch(
            `${API_BASE}/map/food-pantries?lat=${searchCenter.lat}&lng=${searchCenter.lng}&radius_km=${radiusKm}`
          ),
        ]);

        const issues: string[] = [];

        let nextCampaignPins: MapPin[] = [];
        if (campaignRes.status === "fulfilled" && campaignRes.value.ok) {
          const payload = await campaignRes.value.json();
          nextCampaignPins = parseArrayData<MapPin>(payload);
        } else {
          issues.push("Campaign endpoint unavailable");
        }

        let backendPantries: FoodPantryPin[] = [];
        if (pantryRes.status === "fulfilled" && pantryRes.value.ok) {
          const payload = await pantryRes.value.json();
          backendPantries = parseArrayData<FoodPantryPin>(payload);
        } else {
          issues.push("Pantry endpoint unavailable");
        }

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
        if (issues.length > 0) setError(`Partial map data: ${issues.join(" | ")}`);
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

  // ── Draw campaign + pantry markers once map is ready ──────────────────────
  useEffect(() => {
    if (!mapReady || !MAPBOX_TOKEN) return;

    const drawMarkers = async () => {
      const mapboxglModule: MapboxModule = (await import("mapbox-gl")).default;
      const map = mapRef.current;
      if (!map) return;

      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      const allPoints: Array<[number, number]> = [];

      campaignPins.forEach((pin) => {
        const popup = new mapboxglModule.Popup({ offset: 20, className: "tracka-popup" }).setHTML(`
          <div style="font-family:system-ui;min-width:200px;padding:4px 2px">
            <div style="font-weight:700;font-size:14px;color:#0f172a;margin-bottom:4px">${pin.title}</div>
            <div style="font-size:12px;color:#64748b;margin-bottom:4px">📅 ${pin.date}</div>
            <div style="font-size:12px;color:#16a34a;font-weight:600">${pin.signup_count}${pin.max_volunteers ? `/${pin.max_volunteers}` : ""} volunteers joined</div>
          </div>
        `);
        const marker = new mapboxglModule.Marker({ element: createCampaignPin(), anchor: "bottom" })
          .setLngLat([pin.longitude, pin.latitude])
          .setPopup(popup)
          .addTo(map);
        markersRef.current.push(marker);
        allPoints.push([pin.longitude, pin.latitude]);
      });

      pantryPins.forEach((pin) => {
        const popup = new mapboxglModule.Popup({ offset: 18, className: "tracka-popup" }).setHTML(`
          <div style="font-family:system-ui;min-width:200px;padding:4px 2px">
            <div style="font-weight:700;font-size:14px;color:#0f172a;margin-bottom:4px">${pin.name}</div>
            <div style="font-size:12px;color:#64748b">📍 ${pin.address ?? "Food pantry"}</div>
          </div>
        `);
        const marker = new mapboxglModule.Marker({ element: createPantryPin(), anchor: "bottom" })
          .setLngLat([pin.longitude, pin.latitude])
          .setPopup(popup)
          .addTo(map);
        markersRef.current.push(marker);
        allPoints.push([pin.longitude, pin.latitude]);
      });

      if (allPoints.length > 1) {
        const bounds = allPoints.reduce(
          (b, point) => b.extend(point as [number, number]),
          new mapboxglModule.LngLatBounds(allPoints[0], allPoints[0])
        );
        map.fitBounds(bounds, { padding: 70, duration: 700 });
      }
    };

    void drawMarkers();
  }, [campaignPins, pantryPins, mapReady]);

  // ── Place / update "You are here" pin ─────────────────────────────────────
  useEffect(() => {
    if (!userLocation || !mapReady || !MAPBOX_TOKEN) return;

    const placeUserPin = async () => {
      const mapboxglModule: MapboxModule = (await import("mapbox-gl")).default;
      const map = mapRef.current;
      if (!map) return;

      if (userMarkerRef.current) {
        userMarkerRef.current.setLngLat([userLocation.lng, userLocation.lat]);
      } else {
        const popup = new mapboxglModule.Popup({ offset: 14, className: "tracka-popup" }).setHTML(
          `<div style="font-family:system-ui;padding:4px 2px;font-size:13px;font-weight:600;color:#1e40af">📍 You are here</div>`
        );
        userMarkerRef.current = new mapboxglModule.Marker({
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
    <main className="min-h-screen bg-[#FFFEF5] px-6 py-10 text-slate-700">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex items-center justify-between">
          <Link href="/home" className="inline-flex items-center text-sm text-emerald-700 hover:underline">
            ← Back to Home
          </Link>
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">Events: {totalCampaigns}</span>
            <span className="rounded-full bg-yellow-100 px-3 py-1 text-yellow-700">Pantries: {totalPantries}</span>
            <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600">
              <span>Radius:</span>
              {[1, 3, 5, 10].map((km) => (
                <button
                  key={km}
                  onClick={() => setRadiusKm(km)}
                  className={`rounded-full px-2 py-0.5 font-medium transition-colors ${
                    radiusKm === km ? "bg-emerald-500 text-white" : "hover:bg-slate-100 text-slate-500"
                  }`}
                >
                  {km}km
                </button>
              ))}
            </div>
          </div>
        </div>

        <section className="rounded-3xl border border-yellow-100 bg-white p-5 shadow-lg shadow-yellow-100/60">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-[#0F172A]">Discover Nearby Impact</h1>
              <p className="mt-1 text-sm text-slate-500">
                Flyering campaigns and food pantries near you.
              </p>
            </div>
            <button
              onClick={requestLocation}
              disabled={locating}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-blue-50 px-4 py-2 text-xs font-medium text-blue-700 ring-1 ring-blue-200 transition hover:bg-blue-100 disabled:opacity-60"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <circle cx="12" cy="12" r="3" /><path strokeLinecap="round" d="M12 2v3M12 19v3M2 12h3M19 12h3" />
              </svg>
              {locating ? "Locating…" : userLocation ? "Re-locate me" : "Locate me"}
            </button>
          </div>

          {!MAPBOX_TOKEN ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              Add NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN to your frontend env to render the map.
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <div className="relative mt-5 h-[560px] overflow-hidden rounded-2xl border border-yellow-100 bg-[#FFFDF2]">
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
                  className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-lg ring-1 ring-slate-200 hover:bg-slate-50 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
          <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
            <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-blue-500" /> You</span>
            <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-emerald-600" /> Campaign</span>
            <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-yellow-500" /> Food Pantry</span>
            {loading ? <span className="text-slate-400">Refreshing pins…</span> : null}
          </div>
        </section>
      </div>
    </main>
  );
}
