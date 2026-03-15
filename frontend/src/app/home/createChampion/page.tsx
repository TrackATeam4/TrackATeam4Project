"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { authFetch } from "@/lib/api";
import HomeSidebar from "@/components/home/HomeSidebar";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

// ─── Types ────────────────────────────────────────────────────────────────────

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

type GeoState = "idle" | "loading" | "found" | "error";
type AddressSuggestion = { display_name: string; latitude: number; longitude: number };

const DEBOUNCE_MS = 350;
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

// Shared input class aligned with the rest of the app
const inputCls =
  "w-full rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-[#1A1A1A] outline-none transition-colors focus:border-[#7C3AED] focus:ring-2 focus:ring-purple-200 placeholder:text-[#9CA3AF]";

const selectCls =
  "w-full appearance-none rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-[#1A1A1A] shadow-sm outline-none transition-colors focus:border-[#7C3AED] focus:ring-2 focus:ring-purple-200 cursor-pointer";

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Custom 12h time picker — avoids the ugly native browser time input */
function TimePicker({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  const parse = (val: string) => {
    if (!val) return { h: "", m: "00", ampm: "AM" as "AM" | "PM" };
    const [hStr, mStr] = val.split(":");
    const h24 = parseInt(hStr, 10);
    return {
      h: String(h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24),
      m: mStr ?? "00",
      ampm: (h24 >= 12 ? "PM" : "AM") as "AM" | "PM",
    };
  };
  const { h, m, ampm } = parse(value);

  const emit = (newH: string, newM: string, newAmpm: "AM" | "PM") => {
    if (!newH) { onChange(""); return; }
    let h24 = parseInt(newH, 10);
    if (newAmpm === "AM" && h24 === 12) h24 = 0;
    else if (newAmpm === "PM" && h24 !== 12) h24 += 12;
    onChange(`${String(h24).padStart(2, "0")}:${newM}`);
  };

  const selCls = "appearance-none border-none bg-transparent text-sm font-medium text-[#1A1A1A] outline-none cursor-pointer";

  return (
    <div>
  <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[#6B7280]">{label}</span>
  <div className="flex items-center gap-0.5 rounded-2xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm transition-all focus-within:border-[#7C3AED] focus-within:ring-2 focus-within:ring-purple-200">
        <select value={h} onChange={(e) => emit(e.target.value, m, ampm)} className={selCls}>
          <option value="">--</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={String(n)}>{String(n).padStart(2, "0")}</option>
          ))}
        </select>
        <span className="select-none font-bold text-[#F5C542]">:</span>
        <select value={m} onChange={(e) => emit(h, e.target.value, ampm)} className={selCls}>
          {["00", "15", "30", "45"].map((min) => (
            <option key={min} value={min}>{min}</option>
          ))}
        </select>
  <div className="ml-2 flex overflow-hidden rounded-lg border border-gray-200 bg-[#FFF8E1]">
          {(["AM", "PM"] as const).map((p) => (
            <button
              key={p} type="button" onClick={() => emit(h, m, p)}
              className={`px-2.5 py-1 text-xs font-bold transition-all ${
                ampm === p
                  ? "bg-[#7C3AED] text-white"
                  : "text-[#9CA3AF] hover:text-[#1A1A1A]"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Custom date select — uses local state so selecting month/day/year
 * independently is reflected in the UI immediately.
 */
function DateSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parse = (v: string) => {
    const parts = v ? v.split("-") : [];
    return { y: parts[0] ?? "", mo: parts[1] ?? "", d: parts[2] ?? "" };
  };

  const [local, setLocal] = useState(() => parse(value));

  // Sync when parent resets (e.g. after form submit)
  useEffect(() => {
    setLocal(parse(value));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const emit = (y: string, mo: string, d: string) => {
    setLocal({ y, mo, d });
    onChange(y && mo && d ? `${y}-${mo}-${d}` : "");
  };

  const thisYear = new Date().getFullYear();

  return (
    <div>
      <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">Date</span>
      <div className="grid grid-cols-3 gap-2">
        <select
          value={local.mo}
          onChange={(e) => emit(local.y, e.target.value, local.d)}
          className={selectCls}
        >
          <option value="">Month</option>
          {MONTHS.map((name, i) => (
            <option key={i} value={String(i + 1).padStart(2, "0")}>{name}</option>
          ))}
        </select>
        <select
          value={local.d}
          onChange={(e) => emit(local.y, local.mo, e.target.value)}
          className={selectCls}
        >
          <option value="">Day</option>
          {Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0")).map((day) => (
            <option key={day} value={day}>{day}</option>
          ))}
        </select>
        <select
          value={local.y}
          onChange={(e) => emit(e.target.value, local.mo, local.d)}
          className={selectCls}
        >
          <option value="">Year</option>
          {[thisYear, thisYear + 1, thisYear + 2].map((yr) => (
            <option key={yr} value={String(yr)}>{yr}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

/** Draft / Publish Now segmented control */
function StatusPicker({
  value, onChange,
}: { value: CampaignStatus; onChange: (v: CampaignStatus) => void }) {
  const opts: { value: CampaignStatus; label: string }[] = [
    { value: "draft", label: "Save as Draft" },
    { value: "published", label: "Publish Now" },
  ];
  return (
    <div>
  <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Visibility</span>
  <div className="flex gap-1.5 rounded-2xl border border-gray-200 bg-[#FFF8E1] p-1">
        {opts.map((o) => (
          <button
            key={o.value} type="button" onClick={() => onChange(o.value)}
            className={`flex-1 rounded-xl py-2 text-sm font-semibold transition-all ${
              value === o.value
                ? "bg-white text-[#1A1A1A] shadow-sm"
                : "text-[#9CA3AF] hover:text-[#1A1A1A]"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** +/− stepper for numeric fields */
function Stepper({
  label, hint, value, onChange, min = 1, placeholder,
}: {
  label: string; hint?: string; value: string; onChange: (v: string) => void;
  min?: number; placeholder?: string;
}) {
  const num = value === "" ? null : parseInt(value, 10);
  return (
    <div>
      <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[#6B7280]">{label}</span>
      <div className="flex items-center overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => num !== null && num > min && onChange(String(num - 1))}
          disabled={num === null || num <= min}
          className="w-10 shrink-0 py-2.5 text-center text-lg font-light text-[#9CA3AF] transition-colors hover:bg-[#FFF8E1] hover:text-[#1A1A1A] disabled:opacity-30"
        >
          −
        </button>
        <input
          type="number" value={value} min={min}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full border-none bg-transparent py-2.5 text-center text-sm font-semibold text-[#1A1A1A] outline-none placeholder:font-normal placeholder:text-[#9CA3AF]"
        />
        <button
          type="button"
          onClick={() => onChange(String((num ?? (min - 1)) + 1))}
          className="w-10 shrink-0 py-2.5 text-center text-lg font-light text-[#9CA3AF] transition-colors hover:bg-[#FFF8E1] hover:text-[#1A1A1A]"
        >
          +
        </button>
      </div>
      {hint && <p className="mt-1.5 text-xs text-[#6B7280]">{hint}</p>}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const toDbTime = (v: string) => (v.length === 5 ? `${v}:00` : v);

const cardCls = "rounded-3xl border border-gray-200 bg-white px-6 py-5 shadow-sm";

export default function HomeCreatePage() {
  const [form, setForm] = useState<CampaignFormState>(INITIAL_FORM);
  const [addressQuery, setAddressQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [geoState, setGeoState] = useState<GeoState>("idle");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const coordsRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced geocode while typing
  useEffect(() => {
    const trimmed = addressQuery.trim();
    if (trimmed.length < 4) {
      setSuggestions([]);
      setShowSuggestions(false);
      if (geoState === "loading") setGeoState("idle");
      return;
    }
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      setGeoState("loading");
      coordsRef.current = null;
      try {
        const res = await fetch(
          `${API_BASE}/campaigns/geocode?address=${encodeURIComponent(trimmed)}&limit=5`,
          { signal: abortRef.current.signal },
        );
        if (!res.ok) throw new Error("not found");
        const json = await res.json();
        const results: AddressSuggestion[] = json.data ?? [];
        if (results.length === 0) { setGeoState("error"); setSuggestions([]); setShowSuggestions(false); }
        else { setSuggestions(results); setShowSuggestions(true); setGeoState("idle"); }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        setGeoState("error");
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressQuery]);

  const selectSuggestion = (s: AddressSuggestion) => {
    coordsRef.current = { latitude: s.latitude, longitude: s.longitude };
    const shortLocation = s.display_name.split(",")[0].trim();
    setForm((prev) => ({ ...prev, address: s.display_name, location: shortLocation }));
    setAddressQuery(s.display_name);
    setSuggestions([]);
    setShowSuggestions(false);
    setGeoState("found");
  };

  const updateField = <K extends keyof CampaignFormState>(key: K, v: CampaignFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: v }));

  const isMissingRequired = useMemo(
    () => !form.title.trim() || !form.address.trim() || !form.date || !form.startTime || !form.endTime,
    [form],
  );

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const targetFlyers = Number(form.targetFlyers);
      if (!Number.isInteger(targetFlyers) || targetFlyers <= 0)
        throw new Error("Target flyers must be a positive whole number.");
      const maxVolunteers = form.maxVolunteers.trim() === "" ? null : Number(form.maxVolunteers);
      if (maxVolunteers !== null && (!Number.isInteger(maxVolunteers) || maxVolunteers <= 0))
        throw new Error("Max volunteers must be empty or a positive whole number.");
      if (form.endTime <= form.startTime)
        throw new Error("End time must be after start time.");

      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        location: form.location.trim() || form.address.trim(),
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
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      };

      const res = await authFetch<{ id: string; title: string; status: CampaignStatus }>(
        "/campaigns", { method: "POST", body: JSON.stringify(payload) },
      );
      setSuccessMessage(`"${res.data.title}" created successfully.`);
      setForm(INITIAL_FORM);
      setAddressQuery("");
      setGeoState("idle");
      coordsRef.current = null;
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Unable to create campaign.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <HomeSidebar />
  <main className="min-h-screen bg-[#FFF8E1] text-[#1A1A1A] md:ml-24 lg:ml-72">
  {/* Top nav */}
  <div className="sticky top-0 z-30 border-b border-gray-200 bg-[#FFF8E1]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-3">
          <span className="text-sm font-semibold text-[#1A1A1A]">New Campaign</span>
          <div className="w-16" />
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <form onSubmit={handleSubmit} className="space-y-3">

          {/* ── Title + Description ──────────────────────────────────────────── */}
          <div className={cardCls}>
            <input
              value={form.title}
              onChange={(e) => updateField("title", e.target.value)}
              required
              className="w-full border-none bg-transparent text-2xl font-bold text-[#1A1A1A] outline-none placeholder:font-medium placeholder:text-[#9CA3AF]"
              placeholder="Campaign title…"
            />
            <div className="mt-2 h-px bg-[#E5E7EB]" />
            <textarea
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
              rows={2}
              className="mt-3 w-full resize-none border-none bg-transparent text-sm text-[#6B7280] outline-none placeholder:text-[#9CA3AF]"
              placeholder="Add a description for your volunteers (optional)"
            />
          </div>

          {/* ── Location ────────────────────────────────────────────────────── */}
          <div className={cardCls}>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Location</p>
            <div className="relative">
              <div className={`flex items-center gap-2 rounded-2xl border bg-white px-4 py-2.5 transition-all ${
                geoState === "found"
                  ? "border-purple-300 ring-2 ring-purple-200"
                  : "border-gray-200 focus-within:border-[#7C3AED] focus-within:ring-2 focus-within:ring-purple-200"
              }`}>
                {geoState === "loading" ? (
                  <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-200 border-t-purple-500" />
                ) : geoState === "found" ? (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 text-purple-500">
                    <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4"/>
                    <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 text-[#9CA3AF]">
                    <path d="M8 1.5A4.5 4.5 0 0 1 12.5 6c0 3-4.5 8.5-4.5 8.5S3.5 9 3.5 6A4.5 4.5 0 0 1 8 1.5Z" stroke="currentColor" strokeWidth="1.4"/>
                    <circle cx="8" cy="6" r="1.5" stroke="currentColor" strokeWidth="1.4"/>
                  </svg>
                )}
                <input
                  value={addressQuery}
                  onChange={(e) => {
                    setAddressQuery(e.target.value);
                    if (geoState === "found") {
                      setGeoState("idle");
                      coordsRef.current = null;
                      setForm((prev) => ({ ...prev, address: "", location: "" }));
                    }
                  }}
                  onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  required
                  autoComplete="off"
                  className="flex-1 border-none bg-transparent text-sm text-[#1A1A1A] outline-none placeholder:text-[#9CA3AF]"
                  placeholder="Search a US address or neighborhood…"
                />
                {addressQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setAddressQuery("");
                      setGeoState("idle");
                      coordsRef.current = null;
                      setForm((prev) => ({ ...prev, address: "", location: "" }));
                      setSuggestions([]);
                    }}
                    className="shrink-0 text-[#9CA3AF] transition-colors hover:text-[#6B7280]"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </button>
                )}
              </div>

              {showSuggestions && suggestions.length > 0 && (
                <ul className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                  {suggestions.map((s, i) => {
                    const [primary, ...rest] = s.display_name.split(",");
                    return (
                      <li
                        key={i}
                        onMouseDown={() => selectSuggestion(s)}
                        className="flex cursor-pointer items-start gap-3 border-b border-gray-100 px-4 py-3 transition-colors hover:bg-[#FFF8E1] last:border-0"
                      >
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="mt-0.5 shrink-0 text-slate-300">
                          <path d="M8 1.5A4.5 4.5 0 0 1 12.5 6c0 3-4.5 8.5-4.5 8.5S3.5 9 3.5 6A4.5 4.5 0 0 1 8 1.5Z" stroke="currentColor" strokeWidth="1.4"/>
                          <circle cx="8" cy="6" r="1.5" stroke="currentColor" strokeWidth="1.4"/>
                        </svg>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800">{primary.trim()}</p>
                          <p className="truncate text-xs text-slate-400">{rest.join(",").trim()}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {geoState === "error" && (
                <p className="mt-2 text-xs text-amber-600">No US results — try a more specific address. You can still submit.</p>
              )}
            </div>
          </div>

          {/* ── Date & Time ─────────────────────────────────────────────────── */}
          <div className={cardCls}>
            <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Date &amp; Time</p>
            <div className="space-y-4">
              <DateSelect value={form.date} onChange={(v) => updateField("date", v)} />
              <div className="grid grid-cols-2 gap-3">
                <TimePicker label="Start Time" value={form.startTime} onChange={(v) => updateField("startTime", v)} />
                <TimePicker label="End Time"   value={form.endTime}   onChange={(v) => updateField("endTime", v)} />
              </div>
            </div>
          </div>

          {/* ── Campaign Details ─────────────────────────────────────────────── */}
          <div className={cardCls}>
            <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Campaign Details</p>
            <div className="space-y-4">
              <StatusPicker value={form.status} onChange={(v) => updateField("status", v)} />
              <div className="grid grid-cols-2 gap-3">
                <Stepper label="Target Flyers" value={form.targetFlyers} onChange={(v) => updateField("targetFlyers", v)} />
                <Stepper label="Max Volunteers" hint="Leave blank for no cap" value={form.maxVolunteers} onChange={(v) => updateField("maxVolunteers", v)} placeholder="∞" />
              </div>
              <div>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">Tags</span>
                <input
                  value={form.tags}
                  onChange={(e) => updateField("tags", e.target.value)}
                  className={inputCls}
                  placeholder="school-zone, weekend, spanish  (comma-separated)"
                />
              </div>
            </div>
          </div>

          {/* ── Advanced ──────────────────────────────────────────────────────── */}
          <details className="group rounded-3xl border border-gray-200 bg-white shadow-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-4 text-xs font-semibold uppercase tracking-wider text-[#6B7280] transition-colors hover:text-[#1A1A1A]">
              Advanced (optional)
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="transition-transform group-open:rotate-180">
                <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </summary>
            <div className="border-t border-gray-200 px-6 py-4">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Flyer Template ID</span>
              <input
                value={form.flyerTemplateId}
                onChange={(e) => updateField("flyerTemplateId", e.target.value)}
                className={inputCls}
                placeholder="UUID from flyer_templates.id"
              />
            </div>
          </details>

          {/* ── Feedback ─────────────────────────────────────────────────────── */}
          {errorMessage && (
            <div className="flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-3">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-0.5 shrink-0 text-red-400">
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M8 5v3.5M8 10.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <p className="text-sm font-medium text-red-600">{errorMessage}</p>
            </div>
          )}
          {successMessage && (
            <div className="flex items-start gap-3 rounded-2xl border border-[#BBF7D0] bg-[#E8F5E9] px-4 py-3">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-0.5 shrink-0 text-[#16A34A]">
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <p className="text-sm font-medium text-[#16A34A]">{successMessage}</p>
            </div>
          )}

          {/* ── Submit ───────────────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 pb-12">
            <button
              type="submit"
              disabled={submitting || isMissingRequired}
              className="flex-1 rounded-2xl bg-[#7C3AED] py-3 text-sm font-bold text-white shadow-lg shadow-purple-200 transition-all hover:bg-[#6D28D9] active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Creating…
                </span>
              ) : (
                "Create Campaign"
              )}
            </button>
          </div>

        </form>
      </div>
      </main>
    </>
  );
}
