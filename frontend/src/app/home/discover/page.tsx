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
const DEFAULT_RADIUS_KM = 3;

const parseArrayData = <T,>(payload: unknown): T[] => {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  if (Array.isArray(root.data)) return root.data as T[];
  if (Array.isArray(root.items)) return root.items as T[];
  if (Array.isArray(payload)) return payload as T[];
  return [];
};

const createPinMarker = (): HTMLDivElement => {
  const pinMarker = document.createElement("div");
  pinMarker.style.display = "inline-flex";
  pinMarker.style.alignItems = "center";
  pinMarker.style.justifyContent = "center";
  pinMarker.style.transform = "translateY(-50%)";

  const pinImage = document.createElement("img");
  pinImage.src = "/pinMarker.jpg";
  pinImage.alt = "Pin marker";
  pinImage.width = 36;
  pinImage.height = 36;
  pinImage.style.width = "36px";
  pinImage.style.height = "36px";
  pinImage.style.objectFit = "contain";
  pinImage.style.filter = "drop-shadow(0 2px 6px rgba(15,23,42,0.25))";
  pinMarker.appendChild(pinImage);

  return pinMarker;
};

export default function HomeDiscoverPage() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<MapboxMarker[]>([]);

  const [initialCenter, setInitialCenter] = useState<LngLat>(DEFAULT_CENTER);
  const [searchCenter, setSearchCenter] = useState<LngLat>(DEFAULT_CENTER);
  const [hasMoved, setHasMoved] = useState(false);
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM);
  const [campaignPins, setCampaignPins] = useState<MapPin[]>([]);
  const [pantryPins, setPantryPins] = useState<FoodPantryPin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const totalCampaigns = useMemo(() => campaignPins.length, [campaignPins]);
  const totalPantries = useMemo(() => pantryPins.length, [pantryPins]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextCenter = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setInitialCenter(nextCenter);
        setSearchCenter(nextCenter);
      },
      () => {
        // Keep default center when location permission is denied.
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

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
        center: [initialCenter.lng, initialCenter.lat],
        zoom: 11,
      });

      map.on("moveend", () => {
        setHasMoved(true);
      });

      mapRef.current = map;
    };

    void initMap();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [initialCenter.lat, initialCenter.lng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    map.flyTo({ center: [initialCenter.lng, initialCenter.lat], zoom: 11, duration: 800 });
  }, [initialCenter.lat, initialCenter.lng]);

  useEffect(() => {
    const fetchPins = async () => {
      setLoading(true);
      setError("");

      try {
        const [campaignRes, pantryRes] = await Promise.allSettled([
          fetch(
            `${API_BASE}/map/campaigns?lat=${searchCenter.lat}&lng=${searchCenter.lng}&radius_km=${radiusKm}&status=published`
          ),
          fetch(`${API_BASE}/map/food-pantries?lat=${searchCenter.lat}&lng=${searchCenter.lng}&radius_km=${radiusKm}`),
        ]);

        const issues: string[] = [];

        let nextCampaignPins: MapPin[] = [];
        if (campaignRes.status === "fulfilled" && campaignRes.value.ok) {
          const campaignPayload = await campaignRes.value.json();
          nextCampaignPins = parseArrayData<MapPin>(campaignPayload);
        } else {
          issues.push("Campaign endpoint unavailable");
        }

        let backendPantries: FoodPantryPin[] = [];
        if (pantryRes.status === "fulfilled" && pantryRes.value.ok) {
          const pantryPayload = await pantryRes.value.json();
          backendPantries = parseArrayData<FoodPantryPin>(pantryPayload);
        } else {
          issues.push("Pantry endpoint unavailable");
        }

        const dedupedPantries = backendPantries.filter(
          (pin, index, all) =>
            all.findIndex(
              (candidate) =>
                candidate.name.toLowerCase() === pin.name.toLowerCase() &&
                Math.abs(candidate.latitude - pin.latitude) < 0.0001 &&
                Math.abs(candidate.longitude - pin.longitude) < 0.0001
            ) === index
        );

        setCampaignPins(nextCampaignPins);
        setPantryPins(dedupedPantries);

        if (issues.length > 0) {
          setError(`Partial map data: ${issues.join(" | ")}`);
        }
      } catch (fetchError) {
        setCampaignPins([]);
        setPantryPins([]);
        setError(fetchError instanceof Error ? fetchError.message : "Unable to load Discover map data.");
      } finally {
        setLoading(false);
      }
    };

    void fetchPins();
  }, [searchCenter.lat, searchCenter.lng, radiusKm]);

  useEffect(() => {
    if (!mapRef.current || !MAPBOX_TOKEN) return;

    const drawMarkers = async () => {
      const mapboxglModule: MapboxModule = (await import("mapbox-gl")).default;
      const map = mapRef.current;
      if (!map) return;

      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];

      const allPoints: Array<[number, number]> = [];

      campaignPins.forEach((pin) => {
        const pinMarker = createPinMarker();

        const popup = new mapboxglModule.Popup({ offset: 14 }).setHTML(
          `<div style="font-family:system-ui;min-width:210px"><strong>${pin.title}</strong><br/><span style="font-size:12px;color:#475569">${pin.date}</span><br/><span style="font-size:12px;color:#047857">${pin.signup_count}/${pin.max_volunteers ?? "-"} joined</span></div>`
        );

        const marker = new mapboxglModule.Marker(pinMarker)
          .setLngLat([pin.longitude, pin.latitude])
          .setPopup(popup)
          .addTo(map);

        markersRef.current.push(marker);
        allPoints.push([pin.longitude, pin.latitude]);
      });

      pantryPins.forEach((pin) => {
        const pinMarker = createPinMarker();

        const popup = new mapboxglModule.Popup({ offset: 14 }).setHTML(
          `<div style="font-family:system-ui;min-width:210px"><strong>${pin.name}</strong><br/><span style="font-size:12px;color:#475569">${pin.address ?? "Food pantry"}</span></div>`
        );

        const marker = new mapboxglModule.Marker(pinMarker)
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
  }, [campaignPins, pantryPins]);

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
                    radiusKm === km
                      ? "bg-emerald-500 text-white"
                      : "hover:bg-slate-100 text-slate-500"
                  }`}
                >
                  {km}km
                </button>
              ))}
            </div>
          </div>
        </div>

        <section className="rounded-3xl border border-yellow-100 bg-white p-5 shadow-lg shadow-yellow-100/60">
          <h1 className="text-3xl font-bold text-[#0F172A]">Discover Nearby Impact</h1>
          <p className="mt-2 text-sm text-slate-500">
            Campaign pins are fetched from <span className="font-medium">/map/campaigns</span> and pantry pins from <span className="font-medium">/map/food-pantries</span>.
          </p>

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

          <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
            <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-emerald-600" /> Campaign</span>
            <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-yellow-500" /> Food Pantry</span>
            {loading ? <span>Refreshing pins...</span> : null}
          </div>
        </section>
      </div>
    </main>
  );
}
