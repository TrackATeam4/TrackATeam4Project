"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { authFetch } from "@/lib/api";

interface FlyerTemplate {
  id: string;
  name: string;
  file_url?: string;
  thumbnail_url?: string;
  customizable_fields?: Record<string, unknown>;
  is_active?: boolean;
  created_at?: string;
}

type FormMode = "idle" | "create" | "edit";

function FlyerCard({ template, onEdit, onDelete, deleting }: {
  template: FlyerTemplate;
  onEdit: (t: FlyerTemplate) => void;
  onDelete: (id: string) => void;
  deleting: string | null;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.25 }}
      className="group relative overflow-hidden rounded-2xl border border-yellow-100 bg-white shadow-sm transition-shadow hover:shadow-md"
    >
      {/* Thumbnail / placeholder */}
      <div className="relative h-36 overflow-hidden bg-gradient-to-br from-yellow-50 to-emerald-50">
        {template.thumbnail_url ? (
          <img src={template.thumbnail_url} alt={template.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <svg className="h-12 w-12 text-yellow-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>
        )}
        {/* Active badge */}
        <div className="absolute right-2 top-2">
          {template.is_active !== false ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-white/80" />
              Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/80 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
              Inactive
            </span>
          )}
        </div>
      </div>

      <div className="p-4">
        <p className="font-semibold text-[#0F172A]">{template.name}</p>
        {template.file_url && (
          <a
            href={template.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 flex items-center gap-1 truncate text-xs text-emerald-600 hover:underline"
          >
            <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            <span className="truncate">{template.file_url}</span>
          </a>
        )}
        <p className="mt-1 text-xs text-slate-400">
          {template.created_at ? new Date(template.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
        </p>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => onEdit(template)}
            className="flex-1 rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(template.id)}
            disabled={deleting === template.id}
            className="flex-1 rounded-lg border border-rose-200 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
          >
            {deleting === template.id ? (
              <span className="flex items-center justify-center">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-rose-300 border-t-rose-600" />
              </span>
            ) : "Delete"}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export default function AdminFlyersPage() {
  const [templates, setTemplates] = useState<FlyerTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formMode, setFormMode] = useState<FormMode>("idle");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formFileUrl, setFormFileUrl] = useState("");
  const [formThumbnailUrl, setFormThumbnailUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchTemplates = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await authFetch<{ flyer_templates: FlyerTemplate[] }>("/admin/flyer-templates");
      const list = res.data?.flyer_templates ?? (Array.isArray(res.data) ? res.data : []);
      setTemplates(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load templates.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTemplates(); }, []);

  const resetForm = () => {
    setFormMode("idle");
    setEditingId(null);
    setFormName("");
    setFormFileUrl("");
    setFormThumbnailUrl("");
  };

  const openCreate = () => { resetForm(); setFormMode("create"); };

  const openEdit = (t: FlyerTemplate) => {
    setFormMode("edit");
    setEditingId(t.id);
    setFormName(t.name);
    setFormFileUrl(t.file_url || "");
    setFormThumbnailUrl(t.thumbnail_url || "");
  };

  const handleSave = async () => {
    if (!formName.trim() || !formFileUrl.trim()) return;
    setSaving(true);
    setError("");
    try {
      const payload = {
        name: formName.trim(),
        file_url: formFileUrl.trim(),
        thumbnail_url: formThumbnailUrl.trim() || null,
      };
      if (formMode === "create") {
        const res = await authFetch<{ flyer_template: FlyerTemplate }>("/admin/flyer-templates", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        const created = res.data?.flyer_template ?? res.data;
        setTemplates((prev) => [created as FlyerTemplate, ...prev]);
      } else if (formMode === "edit" && editingId) {
        const res = await authFetch<{ flyer_template: FlyerTemplate }>(`/admin/flyer-templates/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        const updated = res.data?.flyer_template ?? res.data;
        setTemplates((prev) => prev.map((t) => t.id === editingId ? { ...t, ...(updated as FlyerTemplate) } : t));
      }
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save template.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this flyer template?")) return;
    setDeleting(id);
    try {
      await authFetch(`/admin/flyer-templates/${id}`, { method: "DELETE" });
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete template.");
    } finally {
      setDeleting(null);
    }
  };

  const inputCls = "w-full rounded-xl border border-yellow-100 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 placeholder:text-slate-400";

  return (
    <div className="px-6 py-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="flex flex-wrap items-start justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold text-[#0F172A]">Flyer Templates</h1>
          <p className="mt-1 text-sm text-slate-500">Create and manage templates for campaigns</p>
        </div>
        {formMode === "idle" && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-xl bg-[#F5C542] px-5 py-2.5 text-sm font-semibold text-[#1A1A1A] shadow-lg shadow-[#F5C542]/30 transition hover:bg-[#E0B63A]"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Template
          </button>
        )}
      </motion.div>

      {error && <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}

      {/* Form panel */}
      <AnimatePresence>
        {formMode !== "idle" && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.99 }}
            transition={{ duration: 0.3 }}
            className="mt-6 rounded-2xl border border-yellow-100 bg-white p-6 shadow-sm"
          >
            <h2 className="text-base font-semibold text-[#0F172A]">
              {formMode === "create" ? "New Template" : "Edit Template"}
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Name *</label>
                <input value={formName} onChange={(e) => setFormName(e.target.value)} className={inputCls} placeholder="Template name" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">File URL *</label>
                <input value={formFileUrl} onChange={(e) => setFormFileUrl(e.target.value)} className={inputCls} placeholder="https://example.com/flyer.pdf" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Thumbnail URL</label>
                <input value={formThumbnailUrl} onChange={(e) => setFormThumbnailUrl(e.target.value)} className={inputCls} placeholder="https://example.com/thumb.png" />
              </div>
            </div>
            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving || !formName.trim() || !formFileUrl.trim()}
                className="flex items-center gap-2 rounded-xl bg-[#F5C542] px-5 py-2.5 text-sm font-semibold text-[#1A1A1A] shadow-lg shadow-[#F5C542]/30 transition hover:bg-[#E0B63A] disabled:opacity-50"
              >
                {saving && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
                {saving ? "Saving…" : formMode === "create" ? "Create Template" : "Update Template"}
              </button>
              <button onClick={resetForm} className="rounded-xl border border-yellow-100 px-5 py-2.5 text-sm font-semibold text-slate-500 transition hover:bg-yellow-50">
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Grid */}
      <div className="mt-8">
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="overflow-hidden rounded-2xl border border-yellow-100 bg-white">
                <div className="h-36 animate-pulse bg-gradient-to-br from-slate-100 to-slate-50" />
                <div className="space-y-2 p-4">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-slate-100" />
                  <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
                  <div className="h-8 w-full animate-pulse rounded-lg bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        ) : templates.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-yellow-200 bg-yellow-50/30 py-20 text-center"
          >
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-yellow-100">
              <svg className="h-6 w-6 text-yellow-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-500">No templates yet</p>
            <button onClick={openCreate} className="mt-3 text-xs font-semibold text-emerald-600 hover:underline">
              Create your first template →
            </button>
          </motion.div>
        ) : (
          <motion.div
            layout
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            <AnimatePresence>
              {templates.map((t) => (
                <FlyerCard key={t.id} template={t} onEdit={openEdit} onDelete={handleDelete} deleting={deleting} />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </div>
  );
}
