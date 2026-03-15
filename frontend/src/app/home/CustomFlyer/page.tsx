"use client";

import { useEffect, useMemo, useState } from "react";
import HomeSidebar from "../../../components/home/HomeSidebar";
import { apiFetch, authFetch } from "../../../lib/api";

type FlyerTemplate = {
  id: string;
  name?: string;
  description?: string;
  file_url?: string;
  is_active?: boolean;
  supported_languages?: string[];
  thumbnail_url?: string;
  customizable_fields?: Record<string, unknown>;
};

type FlyerGenerateResponse = {
  campaign_id?: string;
  flyer_url?: string;
  thumbnail_url?: string;
};

type EditableLocalDetails = {
  title: string;
  event_date: string;
  event_time: string;
  location: string;
  contact_name: string;
  contact_phone: string;
  local_note: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

const DEFAULT_LANGUAGES = ["en", "es", "zh"];

const EMPTY_DETAILS: EditableLocalDetails = {
  title: "",
  event_date: "",
  event_time: "",
  location: "",
  contact_name: "",
  contact_phone: "",
  local_note: "",
};

const languageLabel = (code: string) => {
  const map: Record<string, string> = {
    en: "English",
    es: "Spanish",
    zh: "Chinese",
    fr: "French",
    ar: "Arabic",
    hi: "Hindi",
  };
  return map[code] ?? code.toUpperCase();
};

export default function CustomFlyerPage() {
  const [templates, setTemplates] = useState<FlyerTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [language, setLanguage] = useState("en");
  const [details, setDetails] = useState<EditableLocalDetails>(EMPTY_DETAILS);

  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [generatingFlyer, setGeneratingFlyer] = useState(false);
  const [previewMode, setPreviewMode] = useState(true);
  const [generatedFlyerUrl, setGeneratedFlyerUrl] = useState("");
  const [generatedThumbnailUrl, setGeneratedThumbnailUrl] = useState("");
  const [error, setError] = useState("");

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [templates, selectedTemplateId]
  );

  const availableLanguages = useMemo(() => {
    const fromTemplate = selectedTemplate?.supported_languages;
    if (fromTemplate && fromTemplate.length > 0) return fromTemplate;
    return DEFAULT_LANGUAGES;
  }, [selectedTemplate]);

  useEffect(() => {
    const loadTemplates = async () => {
      setLoadingTemplates(true);
      setError("");
      try {
        let list: FlyerTemplate[] = [];

        try {
          const response = await authFetch<{ flyer_templates?: FlyerTemplate[] }>("/admin/flyer-templates");
          list = response.data?.flyer_templates ?? [];
        } catch {
          const fallback = await apiFetch<unknown>("/flyer-templates");
          const payload = fallback.data;
          list = Array.isArray(payload)
            ? (payload as FlyerTemplate[])
            : Array.isArray((payload as { flyer_templates?: unknown[] })?.flyer_templates)
            ? (((payload as { flyer_templates?: unknown[] }).flyer_templates ?? []) as FlyerTemplate[])
            : [];
        }

        setTemplates(list);
        if (list.length > 0) setSelectedTemplateId(list[0].id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load flyer templates.");
      } finally {
        setLoadingTemplates(false);
      }
    };

    void loadTemplates();
  }, []);

  useEffect(() => {
    if (!availableLanguages.includes(language)) {
      setLanguage(availableLanguages[0] ?? "en");
    }
  }, [availableLanguages, language]);

  const generateFlyer = async () => {
    if (generatingFlyer) return;
    if (!campaignId.trim()) {
      setError("Campaign ID is required to generate flyer via /flyers endpoint.");
      return;
    }

    setGeneratingFlyer(true);
    setError("");

    try {
      if (!API_BASE) throw new Error("Missing NEXT_PUBLIC_API_URL");

      const body: Record<string, string> = {
        campaign_id: campaignId.trim(),
      };
      if (selectedTemplateId.trim()) {
        body.template_id = selectedTemplateId.trim();
      }

      const response = await fetch(`${API_BASE}/flyers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const payload = (await response.json().catch(() => ({}))) as FlyerGenerateResponse & {
        detail?: string;
      };

      if (!response.ok) {
        throw new Error(payload.detail || "Failed to generate flyer from /flyers endpoint.");
      }

      setGeneratedFlyerUrl(payload.flyer_url || "");
      setGeneratedThumbnailUrl(payload.thumbnail_url || "");
      setPreviewMode(true);
    } catch (err) {
      setGeneratedFlyerUrl("");
      setGeneratedThumbnailUrl("");
      setError(err instanceof Error ? err.message : "Flyer generation failed.");
    } finally {
      setGeneratingFlyer(false);
    }
  };

  const printFlyerAsPdf = () => {
    if (!generatedFlyerUrl) {
      setError("Generate a flyer first, then print as PDF.");
      return;
    }

    const printWindow = window.open(generatedFlyerUrl, "_blank");
    if (!printWindow) {
      setError("Print window was blocked. Please allow popups and try again.");
      return;
    }

    setTimeout(() => {
      try {
        printWindow.focus();
        printWindow.print();
      } catch {
        // Some browsers block programmatic print on cross-origin PDF; opening the tab is the fallback.
      }
    }, 500);
  };

  const updateDetail = (key: keyof EditableLocalDetails, value: string) => {
    setDetails((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#fffdf5,_#fffbeb_45%,_#fff7d6)] text-[#334155]">
      <div className="flex">
        <HomeSidebar />

        <main className="flex-1 px-4 py-8 sm:px-6 lg:ml-72 md:ml-[68px]">
          <div className="mx-auto max-w-3xl space-y-5">
            <header className="rounded-3xl border border-emerald-200/80 bg-white/95 p-6 shadow-[0_18px_40px_-28px_rgba(16,185,129,0.55)]">
              <h1 className="text-3xl font-bold text-emerald-800">Custom Flyer Studio</h1>
              <p className="mt-2 text-sm text-slate-600">
                Connected to backend endpoints: templates from /admin/flyer-templates and generation via POST /flyers.
              </p>
            </header>

            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            ) : null}

            <section>
              <div className="space-y-6">
                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <h2 className="text-lg font-semibold text-slate-800">Approved Template</h2>
                  <select
                    className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    value={selectedTemplateId}
                    onChange={(event) => setSelectedTemplateId(event.target.value)}
                    disabled={loadingTemplates || templates.length === 0}
                  >
                    {templates.length === 0 ? (
                      <option value="">No templates loaded</option>
                    ) : (
                      templates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name || template.id}
                        </option>
                      ))
                    )}
                  </select>
                  <div className="mt-2 text-xs text-slate-500">
                    {loadingTemplates ? "Loading templates..." : `${templates.length} templates loaded`}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {selectedTemplate?.description || "Template description unavailable."}
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <h2 className="text-lg font-semibold text-slate-800">Language</h2>
                  <select
                    className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    value={language}
                    onChange={(event) => setLanguage(event.target.value)}
                  >
                    {availableLanguages.map((code) => (
                      <option key={code} value={code}>
                        {languageLabel(code)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <h2 className="text-lg font-semibold text-slate-800">Editable Local Details</h2>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <input
                      type="text"
                      placeholder="Flyer title"
                      value={details.title}
                      onChange={(event) => updateDetail("title", event.target.value)}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm sm:col-span-2"
                    />
                    <input
                      type="date"
                      value={details.event_date}
                      onChange={(event) => updateDetail("event_date", event.target.value)}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                    <input
                      type="time"
                      value={details.event_time}
                      onChange={(event) => updateDetail("event_time", event.target.value)}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                    <input
                      type="text"
                      placeholder="Location"
                      value={details.location}
                      onChange={(event) => updateDetail("location", event.target.value)}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm sm:col-span-2"
                    />
                    <input
                      type="text"
                      placeholder="Contact name"
                      value={details.contact_name}
                      onChange={(event) => updateDetail("contact_name", event.target.value)}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                    <input
                      type="text"
                      placeholder="Contact phone"
                      value={details.contact_phone}
                      onChange={(event) => updateDetail("contact_phone", event.target.value)}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                    <textarea
                      placeholder="Local note"
                      value={details.local_note}
                      onChange={(event) => updateDetail("local_note", event.target.value)}
                      rows={3}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm sm:col-span-2"
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <h2 className="text-lg font-semibold text-slate-800">Campaign</h2>
                  <input
                    type="text"
                    placeholder="Campaign ID (required by /flyers endpoint)"
                    value={campaignId}
                    onChange={(event) => setCampaignId(event.target.value)}
                    className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <p className="mt-2 text-xs text-slate-500">Use an existing campaign UUID to generate the flyer PDF.</p>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <h2 className="text-lg font-semibold text-slate-800">Flyer Actions</h2>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={generateFlyer}
                      disabled={generatingFlyer}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {generatingFlyer ? "Generating..." : "Generate Flyer"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewMode((prev) => !prev)}
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      {previewMode ? "Hide Preview" : "Preview Mode"}
                    </button>
                    <button
                      type="button"
                      onClick={printFlyerAsPdf}
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Print PDF
                    </button>
                  </div>
                </div>

                {previewMode && generatedFlyerUrl ? (
                  <div className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
                    <div className="flex items-center justify-between border-b border-emerald-100 pb-3">
                      <p className="text-xs uppercase tracking-wide text-emerald-700">Preview Mode</p>
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                        {selectedTemplate?.name || "Generated Flyer"}
                      </span>
                    </div>
                    <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
                      <iframe
                        title="Generated Flyer PDF Preview"
                        src={generatedFlyerUrl}
                        className="h-[560px] w-full bg-white"
                      />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <a
                        href={generatedFlyerUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Open Flyer PDF
                      </a>
                      {generatedThumbnailUrl ? (
                        <a
                          href={generatedThumbnailUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Open Thumbnail
                        </a>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {previewMode && !generatedFlyerUrl ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
                    Preview mode is on. Click Generate Flyer to render your flyer preview here.
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
