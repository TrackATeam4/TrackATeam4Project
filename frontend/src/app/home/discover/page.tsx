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
  source?: "backend" | "foodhelpline";
};

type LngLat = { lat: number; lng: number };

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
const MAPBOX_TOKEN = (process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || "").trim();
const DEFAULT_CENTER: LngLat = { lat: 40.7128, lng: -74.006 };
const DEFAULT_RADIUS_KM = 20;
const MAX_FOODHELPLINE_PINS = 220;
const FOODHELPLINE_RESOURCES_API = "https://platform.foodhelpline.org/api/resources";

const parseArrayData = <T,>(payload: unknown): T[] => {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  if (Array.isArray(root.data)) return root.data as T[];
  if (Array.isArray(root.items)) return root.items as T[];
  if (Array.isArray(payload)) return payload as T[];
  return [];
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const haversineKm = (a: LngLat, b: LngLat): number => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const aa = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
  return R * c;
};

const parseFoodHelplinePins = (payload: unknown, centerPoint: LngLat): FoodPantryPin[] => {
  if (!payload || typeof payload !== "object") return [];

  const root = payload as Record<string, unknown>;
  const dataNode = root.data;
  const jsonNode = root.json;
  const resourcesNode =
    (dataNode && typeof dataNode === "object" && Array.isArray((dataNode as Record<string, unknown>).resources)
      ? (dataNode as Record<string, unknown>).resources
      : null) ||
    (jsonNode && typeof jsonNode === "object" && Array.isArray((jsonNode as Record<string, unknown>).resources)
      ? (jsonNode as Record<string, unknown>).resources
      : null) ||
    (Array.isArray(root.resources) ? root.resources : null) ||
    (Array.isArray(root.data) ? root.data : null) ||
    (Array.isArray(payload) ? payload : null);

  if (!Array.isArray(resourcesNode)) return [];

  const parsed = resourcesNode
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const candidate = item as Record<string, unknown>;
      const location = candidate.location as Record<string, unknown> | undefined;

      const latitude =
        toNumber(candidate.latitude) ?? toNumber(candidate.lat) ?? toNumber(location?.latitude) ?? toNumber(location?.lat);
      const longitude =
        toNumber(candidate.longitude) ?? toNumber(candidate.lng) ?? toNumber(location?.longitude) ?? toNumber(location?.lng);

      if (latitude === null || longitude === null) return null;

      const distance = haversineKm(centerPoint, { lat: latitude, lng: longitude });

      const name =
        (typeof candidate.name === "string" && candidate.name.trim()) ||
        (typeof candidate.title === "string" && candidate.title.trim()) ||
        `Food Resource ${index + 1}`;

      const addressParts = [
        typeof candidate.addressStreet1 === "string" ? candidate.addressStreet1 : "",
        typeof candidate.city === "string" ? candidate.city : "",
        typeof candidate.state === "string" ? candidate.state : "",
      ].filter(Boolean);

      const pin: FoodPantryPin = {
        id: `fh-${String(candidate.id ?? index)}`,
        name,
        latitude,
        longitude,
        address: addressParts.join(", ") || "Food Helpline Resource",
        source: "foodhelpline",
      };

      return { pin, distance };
    })
    .filter((entry): entry is { pin: FoodPantryPin; distance: number } => entry !== null)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, MAX_FOODHELPLINE_PINS)
    .map((entry) => entry.pin);

  return parsed;
};

const createPinMarker = (color: string, label?: string): HTMLDivElement => {
  const pinMarker = document.createElement("div");
  pinMarker.style.display = "flex";
  pinMarker.style.alignItems = "center";
  pinMarker.style.gap = "6px";

  const pinImage = document.createElement("img");
  pinImage.src = "/pinMarker.jpg";
  pinImage.alt = "Pin marker";
  pinImage.width = 28;
  pinImage.height = 28;
  pinImage.style.width = "28px";
  pinImage.style.height = "28px";
  pinImage.style.objectFit = "contain";
  pinImage.style.filter = `drop-shadow(0 2px 6px rgba(15,23,42,0.25)) drop-shadow(0 0 0 ${color})`;
  pinMarker.appendChild(pinImage);

  if (label) {
    const pinLabel = document.createElement("span");
    pinLabel.textContent = label;
    pinLabel.style.fontSize = "10px";
    pinLabel.style.fontWeight = "600";
    pinLabel.style.color = "#92400e";
    pinLabel.style.background = "rgba(254,243,199,.95)";
    pinLabel.style.padding = "1px 6px";
    pinLabel.style.borderRadius = "999px";
    pinLabel.style.maxWidth = "130px";
    pinLabel.style.whiteSpace = "nowrap";
    pinLabel.style.overflow = "hidden";
    pinLabel.style.textOverflow = "ellipsis";
    pinMarker.appendChild(pinLabel);
  }

  return pinMarker;
};

export default function HomeDiscoverPage() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<MapboxMarker[]>([]);

  const [center, setCenter] = useState<LngLat>(DEFAULT_CENTER);
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
        setCenter({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
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
        center: [center.lng, center.lat],
        zoom: 11,
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
  }, [center.lat, center.lng]);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.flyTo({ center: [center.lng, center.lat], zoom: 11, duration: 800 });
  }, [center.lat, center.lng]);

  useEffect(() => {
    const fetchPins = async () => {
      setLoading(true);
      setError("");

      try {
        const [campaignRes, pantryRes, resourceRes] = await Promise.allSettled([
          fetch(
            `${API_BASE}/map/campaigns?lat=${center.lat}&lng=${center.lng}&radius_km=${DEFAULT_RADIUS_KM}&status=published`
          ),
          fetch(`${API_BASE}/map/food-pantries?lat=${center.lat}&lng=${center.lng}&radius_km=${DEFAULT_RADIUS_KM}`),
          fetch(FOODHELPLINE_RESOURCES_API),
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
          backendPantries = parseArrayData<FoodPantryPin>(pantryPayload).map((pin) => ({
            ...pin,
            source: "backend" as const,
          }));
        } else {
          issues.push("Pantry endpoint unavailable");
        }

        let foodHelplinePantries: FoodPantryPin[] = [];
        if (resourceRes.status === "fulfilled" && resourceRes.value.ok) {
          const resourcePayload = await resourceRes.value.json();
          foodHelplinePantries = parseFoodHelplinePins(resourcePayload, {
            lat: center.lat,
            lng: center.lng,
          });
          if (foodHelplinePantries.length === 0) {
            issues.push("Food Helpline returned 0 coordinates");
          }
        } else {
          issues.push("Food Helpline endpoint unavailable");
        }

        const dedupedPantries = [...backendPantries, ...foodHelplinePantries].filter(
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
  }, [center.lat, center.lng]);

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
        const pinMarker = createPinMarker("#059669");

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
        const pinColor = pin.source === "foodhelpline" ? "#f59e0b" : "#eab308";
        const pinMarker = createPinMarker(pinColor, pin.source === "foodhelpline" ? pin.name : undefined);

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
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">Events: {totalCampaigns}</span>
            <span className="rounded-full bg-yellow-100 px-3 py-1 text-yellow-700">Pantries: {totalPantries}</span>
          </div>
        </div>

        <section className="rounded-3xl border border-yellow-100 bg-white p-5 shadow-lg shadow-yellow-100/60">
          <h1 className="text-3xl font-bold text-[#0F172A]">Discover Nearby Impact</h1>
          <p className="mt-2 text-sm text-slate-500">
            Campaign pins are fetched from <span className="font-medium">/map/campaigns</span>, pantry pins from <span className="font-medium">/map/food-pantries</span>, plus Food Helpline resources API coordinates.
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

          <div className="mt-5 h-[560px] overflow-hidden rounded-2xl border border-yellow-100 bg-[#FFFDF2]">
            <div ref={mapContainerRef} className="h-full w-full" />
          </div>

          <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
            <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-emerald-600" /> Campaign</span>
            <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-yellow-500" /> Food Pantry (backend)</span>
            <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-amber-500" /> Food Helpline Resource</span>
            {loading ? <span>Refreshing pins...</span> : null}
          </div>
        </section>
      </div>
    </main>
  );
}
