"use client";

import { useEffect, useMemo, useState } from "react";
import HomeSidebar from "../../../components/home/HomeSidebar";
import { authFetch } from "../../../lib/api";

type FlyerTemplateListItem = {
  name: string;
  path: string;
  url: string;
  updated_at?: string | null;
  created_at?: string | null;
};

type FlyerGenerateResponse = {
  campaign_id?: string;
  flyer_url?: string;
  thumbnail_url?: string;
};

type CampaignSummary = {
  id: string;
  title?: string;
  location?: string;
  date?: string;
  start_time?: string;
  status?: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

const DEFAULT_LANGUAGES = ["en", "es"];

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
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [selectedCampaignIndex, setSelectedCampaignIndex] = useState<number | null>(null);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [language, setLanguage] = useState("en");

  const [templates, setTemplates] = useState<FlyerTemplateListItem[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState("");
  const [selectedTemplateIndex, setSelectedTemplateIndex] = useState<number | null>(null);

  const [generatingFlyer, setGeneratingFlyer] = useState(false);
  const [previewMode, setPreviewMode] = useState(true);
  const [generatedFlyerUrl, setGeneratedFlyerUrl] = useState("");
  const [generatedThumbnailUrl, setGeneratedThumbnailUrl] = useState("");
  const [error, setError] = useState("");

  const titledCampaigns = useMemo(
    () => campaigns.filter((campaign) => (campaign.title ?? "").trim().length > 0),
    [campaigns]
  );

  const selectedCampaign = useMemo(() => {
    if (selectedCampaignIndex === null) return null;
    return titledCampaigns[selectedCampaignIndex] ?? null;
  }, [selectedCampaignIndex, titledCampaigns]);

  const selectedCampaignId = selectedCampaign?.id ?? "";

  const availableLanguages = DEFAULT_LANGUAGES;

  const selectedTemplate = useMemo(() => {
    if (selectedTemplateIndex === null) return null;
    return templates[selectedTemplateIndex] ?? null;
  }, [selectedTemplateIndex, templates]);

  useEffect(() => {
    const loadCampaigns = async () => {
      setLoadingCampaigns(true);
      setError("");
      try {
        const response = await authFetch<CampaignSummary[]>("/campaigns");
        const list = response.data ?? [];
        const titledList = list.filter((campaign) => (campaign.title ?? "").trim().length > 0);
        setCampaigns(list);
        setSelectedCampaignIndex((prev) => {
          if (titledList.length === 0) return null;
          if (prev === null) return 0;
          if (prev < 0) return 0;
          if (prev >= titledList.length) return 0;
          return prev;
        });
      } catch (err) {
        setCampaigns([]);
        setSelectedCampaignIndex(null);
        setError(err instanceof Error ? err.message : "Could not load campaigns.");
      } finally {
        setLoadingCampaigns(false);
      }
    };

    void loadCampaigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const loadTemplates = async () => {
      if (!API_BASE) return;

      setTemplatesLoading(true);
      setTemplatesError("");

      try {
        const response = await fetch(`${API_BASE}/flyers/templates`);
        const payload = (await response.json().catch(() => ({}))) as {
          templates?: FlyerTemplateListItem[];
          detail?: string;
        };

        if (!response.ok) {
          throw new Error(payload.detail || "Could not load flyer templates.");
        }

        const list = Array.isArray(payload.templates) ? payload.templates : [];
        setTemplates(list);
        setSelectedTemplateIndex((prev) => {
          if (list.length === 0) return null;
          if (prev === null) return 0;
          if (prev < 0) return 0;
          if (prev >= list.length) return 0;
          return prev;
        });
      } catch (err) {
        setTemplates([]);
        setSelectedTemplateIndex(null);
        setTemplatesError(err instanceof Error ? err.message : "Could not load flyer templates.");
      } finally {
        setTemplatesLoading(false);
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
    if (!selectedCampaignId.trim()) {
      setError(
        titledCampaigns.length === 0
          ? "Please join or create a campaign first."
          : "Select a campaign to generate a flyer."
      );
      return;
    }

    setGeneratingFlyer(true);
    setError("");

    try {
      if (!API_BASE) throw new Error("Missing NEXT_PUBLIC_API_URL");

      const body: Record<string, string> = {
        campaign_id: selectedCampaignId.trim(),
      };

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

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-white text-slate-800">
      <div className="flex">
        <HomeSidebar />

        <main className="flex-1 px-4 py-8 sm:px-6 lg:ml-72 md:ml-[68px]">
          <div className="mx-auto max-w-3xl space-y-5">
            <header className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
              <h1 className="text-2xl font-bold text-emerald-800 sm:text-3xl">Custom Flyer Studio</h1>
              <p className="mt-2 text-sm text-slate-600">
                Select a campaign, choose a style, then generate a PDF flyer.
              </p>
            </header>

            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            ) : null}

            <section>
              <div className="space-y-6">
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="text-lg font-semibold text-slate-800">Campaign</h2>
                  <select
                    className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    value={selectedCampaignIndex === null ? "" : String(selectedCampaignIndex)}
                    onChange={(event) => {
                      const nextIndex = Number.parseInt(event.target.value, 10);
                      setSelectedCampaignIndex(Number.isFinite(nextIndex) ? nextIndex : null);
                    }}
                    disabled={loadingCampaigns || titledCampaigns.length === 0}
                  >
                    {titledCampaigns.length === 0 ? (
                      <option value="">Please join or create a campaign first</option>
                    ) : (
                      titledCampaigns.map((campaign, index) => (
                        <option key={`${campaign.title ?? "campaign"}-${index}`} value={String(index)}>
                          {campaign.title ?? "Untitled campaign"}
                        </option>
                      ))
                    )}
                  </select>
                  <p className="mt-2 text-xs text-slate-500">
                    {selectedCampaign
                      ? `Selected: ${selectedCampaign.title}`
                      : titledCampaigns.length === 0
                        ? "Please join or create a campaign first."
                        : "Select your campaign from the dropdown."}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="text-lg font-semibold text-slate-800">Language</h2>
                  <select
                    className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    value={language}
                    onChange={(event) => setLanguage(event.target.value)}
                  >
                    {availableLanguages.map((code) => (
                      <option key={code} value={code}>
                        {languageLabel(code)}
                      </option>
                    ))}
                  </select>

    
                  <h3 className="mt-4 text-sm font-semibold text-slate-700">Template</h3>
                    <select
                      className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                      value={selectedTemplateIndex === null ? "" : String(selectedTemplateIndex)}
                      onChange={(event) => {
                        const nextIndex = Number.parseInt(event.target.value, 10);
                        setSelectedTemplateIndex(Number.isFinite(nextIndex) ? nextIndex : null);
                      }}
                      disabled={templatesLoading || templates.length === 0}
                    >
                      {templates.length === 0 ? (
                        <option value="">
                          {templatesLoading ? "Loading templates..." : "No templates available"}
                        </option>
                      ) : (
                        templates.map((template, index) => (
                          <option key={`${template.name}-${index}`} value={String(index)}>
                            {template.name}
                          </option>
                        ))
                      )}
                    </select>
                    <p className="mt-2 text-xs text-slate-500">
                      {selectedTemplate ? `Selected: ${selectedTemplate.name}` : "Select a template (optional)."}
                    </p>
                    {templatesError ? <p className="mt-2 text-xs text-red-600">{templatesError}</p> : null}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="text-lg font-semibold text-slate-800">Flyer Actions</h2>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={generateFlyer}
                      disabled={generatingFlyer}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {generatingFlyer ? "Generating..." : "Generate Flyer"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewMode((prev) => !prev)}
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    >
                      {previewMode ? "Hide Preview" : "Preview Mode"}
                    </button>
                    <button
                      type="button"
                      onClick={printFlyerAsPdf}
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-200"
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
                        {selectedCampaign?.title || "Generated Flyer"}
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
