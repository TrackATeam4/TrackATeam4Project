"use client";

import Link from "next/link";
import { FormEvent, useMemo, useRef, useState } from "react";
import { authFetch } from "@/lib/api";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

type CampaignStatus = "draft" | "published" | "completed" | "cancelled";

type CampaignFormState = {
  title: string;
  description: string;
  location: string;
  address: string;
  date: string;
  startTime: string;
  endTime: string;
  status: CampaignStatus;
  maxVolunteers: string;
  targetFlyers: string;
  flyerTemplateId: string;
  tags: string;
};

const INITIAL_FORM: CampaignFormState = {
  title: "",
  description: "",
  location: "",
  address: "",
  date: "",
  startTime: "",
  endTime: "",
  status: "draft",
  maxVolunteers: "",
  targetFlyers: "100",
  flyerTemplateId: "",
  tags: "",
};

const toDbTime = (value: string) => {
  if (!value) return value;
  return value.length === 5 ? `${value}:00` : value;
};

type GeoState = "idle" | "loading" | "found" | "error";

export default function HomeCreatePage() {
  const [form, setForm] = useState<CampaignFormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [geoState, setGeoState] = useState<GeoState>("idle");
  const coordsRef = useRef<{ latitude: number; longitude: number } | null>(null);

  const isMissingRequired = useMemo(() => {
    return !form.title.trim() || !form.location.trim() || !form.address.trim() || !form.date || !form.startTime || !form.endTime;
  }, [form]);

  const geocodeAddress = async (address: string, location: string) => {
    const query = `${address.trim()}, ${location.trim()}`;
    if (!query.trim()) return;
    setGeoState("loading");
    coordsRef.current = null;
    try {
      const res = await fetch(`${API_BASE}/campaigns/geocode?address=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error("not found");
      const json = await res.json();
      coordsRef.current = { latitude: json.data.latitude, longitude: json.data.longitude };
      setGeoState("found");
    } catch {
      setGeoState("error");
    }
  };

  const updateField = <K extends keyof CampaignFormState>(key: K, value: CampaignFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const targetFlyers = Number(form.targetFlyers);
      if (!Number.isInteger(targetFlyers) || targetFlyers <= 0) {
        throw new Error("Target flyers must be a positive whole number.");
      }

      const maxVolunteers = form.maxVolunteers.trim() === "" ? null : Number(form.maxVolunteers);
      if (maxVolunteers !== null && (!Number.isInteger(maxVolunteers) || maxVolunteers <= 0)) {
        throw new Error("Max volunteers must be empty or a positive whole number.");
      }

      if (form.endTime <= form.startTime) {
        throw new Error("End time must be after start time.");
      }

      const tags = form.tags
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        location: form.location.trim(),
        address: form.address.trim(),
        status: form.status,
        latitude: coordsRef.current?.latitude,
        longitude: coordsRef.current?.longitude,
        date: form.date,
        start_time: toDbTime(form.startTime),
        end_time: toDbTime(form.endTime),
        max_volunteers: maxVolunteers,
        target_flyers: targetFlyers,
        flyer_template_id: form.flyerTemplateId.trim() || null,
        tags,
      };

      const response = await authFetch<{ id: string; title: string; status: CampaignStatus }>("/campaigns", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const data = response.data;

      setSuccessMessage(`Campaign \"${data.title}\" created (${data.status}).`);
      setForm(INITIAL_FORM);
    } catch (submitError) {
      setErrorMessage(submitError instanceof Error ? submitError.message : "Unable to create campaign.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#FFFEF5] px-6 py-10 text-slate-700">
      <div className="mx-auto max-w-4xl rounded-3xl border border-yellow-100 bg-white p-8 shadow-lg shadow-yellow-100/60">
        <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Campaign Builder</p>
        <h1 className="mt-2 text-3xl font-bold text-[#0F172A]">Create Campaign Event</h1>
        <p className="mt-3 text-slate-500">Publish a new flyering event to your campaign list.</p>

        <form className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          <label className="md:col-span-2">
            <span className="mb-1 block text-sm font-medium text-slate-700">Title</span>
            <input
              value={form.title}
              onChange={(e) => updateField("title", e.target.value)}
              required
              className="w-full rounded-xl border border-slate-200 px-4 py-2 outline-none focus:border-emerald-500"
              placeholder="Saturday Sunset Park Flyer Push"
            />
          </label>

          <label className="md:col-span-2">
            <span className="mb-1 block text-sm font-medium text-slate-700">Description</span>
            <textarea
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-slate-200 px-4 py-2 outline-none focus:border-emerald-500"
              placeholder="Briefly describe the area and goals for volunteers."
            />
          </label>

          <label>
            <span className="mb-1 block text-sm font-medium text-slate-700">Location</span>
            <input
              value={form.location}
              onChange={(e) => updateField("location", e.target.value)}
              required
              className="w-full rounded-xl border border-slate-200 px-4 py-2 outline-none focus:border-emerald-500"
              placeholder="Sunset Park"
            />
          </label>

          <label>
            <span className="mb-1 block text-sm font-medium text-slate-700">Meeting Address</span>
            <input
              value={form.address}
              onChange={(e) => { updateField("address", e.target.value); setGeoState("idle"); coordsRef.current = null; }}
              onBlur={() => { if (form.address.trim()) geocodeAddress(form.address, form.location); }}
              required
              className="w-full rounded-xl border border-slate-200 px-4 py-2 outline-none focus:border-emerald-500"
              placeholder="5th Ave & 44th St, Brooklyn, NY"
            />
            <span className="mt-1 block text-xs">
              {geoState === "loading" && <span className="text-slate-400">📍 Looking up address…</span>}
              {geoState === "found" && <span className="text-emerald-600">✓ Location found — map pin will be placed automatically</span>}
              {geoState === "error" && <span className="text-amber-600">⚠ Address not found — pin won't appear on map, but you can still submit</span>}
            </span>
          </label>

          <label>
            <span className="mb-1 block text-sm font-medium text-slate-700">Date</span>
            <input
              type="date"
              value={form.date}
              onChange={(e) => updateField("date", e.target.value)}
              required
              className="w-full rounded-xl border border-slate-200 px-4 py-2 outline-none focus:border-emerald-500"
            />
          </label>

          <label>
            <span className="mb-1 block text-sm font-medium text-slate-700">Status</span>
            <select
              value={form.status}
              onChange={(e) => updateField("status", e.target.value as CampaignStatus)}
              className="w-full rounded-xl border border-slate-200 px-4 py-2 outline-none focus:border-emerald-500"
            >
              <option value="draft">draft</option>
              <option value="published">published</option>
              <option value="completed">completed</option>
              <option value="cancelled">cancelled</option>
            </select>
          </label>

          <label>
            <span className="mb-1 block text-sm font-medium text-slate-700">Start Time</span>
            <input
              type="time"
              value={form.startTime}
              onChange={(e) => updateField("startTime", e.target.value)}
              required
              className="w-full rounded-xl border border-slate-200 px-4 py-2 outline-none focus:border-emerald-500"
            />
          </label>

          <label>
            <span className="mb-1 block text-sm font-medium text-slate-700">End Time</span>
            <input
              type="time"
              value={form.endTime}
              onChange={(e) => updateField("endTime", e.target.value)}
              required
              className="w-full rounded-xl border border-slate-200 px-4 py-2 outline-none focus:border-emerald-500"
            />
          </label>

          <label>
            <span className="mb-1 block text-sm font-medium text-slate-700">Target Flyers</span>
            <input
              type="number"
              min={1}
              step={1}
              value={form.targetFlyers}
              onChange={(e) => updateField("targetFlyers", e.target.value)}
              required
              className="w-full rounded-xl border border-slate-200 px-4 py-2 outline-none focus:border-emerald-500"
            />
          </label>

          <label>
            <span className="mb-1 block text-sm font-medium text-slate-700">Max Volunteers (optional)</span>
            <input
              type="number"
              min={1}
              step={1}
              value={form.maxVolunteers}
              onChange={(e) => updateField("maxVolunteers", e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-2 outline-none focus:border-emerald-500"
              placeholder="Leave empty for no cap"
            />
          </label>

          <label className="md:col-span-2">
            <span className="mb-1 block text-sm font-medium text-slate-700">Flyer Template ID (optional)</span>
            <input
              value={form.flyerTemplateId}
              onChange={(e) => updateField("flyerTemplateId", e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-2 outline-none focus:border-emerald-500"
              placeholder="UUID from flyer_templates.id"
            />
          </label>

          <label className="md:col-span-2">
            <span className="mb-1 block text-sm font-medium text-slate-700">Tags (optional)</span>
            <input
              value={form.tags}
              onChange={(e) => updateField("tags", e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-2 outline-none focus:border-emerald-500"
              placeholder="school-zone, weekend, spanish"
            />
          </label>

          {errorMessage ? <p className="md:col-span-2 text-sm font-medium text-red-600">{errorMessage}</p> : null}
          {successMessage ? <p className="md:col-span-2 text-sm font-medium text-emerald-700">{successMessage}</p> : null}

          <div className="md:col-span-2 mt-2 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={submitting || isMissingRequired}
              className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {submitting ? "Creating..." : "Create Campaign"}
            </button>
            <Link href="/home" className="rounded-full border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700">
              Back to Home
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}
