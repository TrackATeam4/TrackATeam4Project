"use client";

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

export default function AdminFlyersPage() {
  const [templates, setTemplates] = useState<FlyerTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
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

  useEffect(() => {
    fetchTemplates();
  }, []);

  const resetForm = () => {
    setFormMode("idle");
    setEditingId(null);
    setFormName("");
    setFormFileUrl("");
    setFormThumbnailUrl("");
  };

  const openCreate = () => {
    resetForm();
    setFormMode("create");
  };

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
    setNotice("");
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
        setNotice("Template created successfully.");
      } else if (formMode === "edit" && editingId) {
        const res = await authFetch<{ flyer_template: FlyerTemplate }>(`/admin/flyer-templates/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        const updated = res.data?.flyer_template ?? res.data;
        setTemplates((prev) =>
          prev.map((t) => (t.id === editingId ? { ...t, ...(updated as FlyerTemplate) } : t))
        );
        setNotice("Template updated successfully.");
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
    setNotice("");
    try {
      await authFetch(`/admin/flyer-templates/${id}`, { method: "DELETE" });
      setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, is_active: false } : t)));
      setNotice("Template archived successfully.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete template.");
    } finally {
      setDeleting(null);
    }
  };

  const inputCls =
    "w-full rounded-xl border border-yellow-100 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 placeholder:text-slate-400";

  return (
    <div className="px-6 py-8 text-slate-700">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#0F172A]">Flyer Templates</h1>
          <p className="mt-1 text-sm text-slate-500">Create and manage flyer templates for campaigns.</p>
        </div>
        {formMode === "idle" && (
          <button
            onClick={openCreate}
            className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700"
          >
            + New Template
          </button>
        )}
      </div>

      {error && (
        <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}
      {notice && (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          {notice}
        </div>
      )}

      {/* Form */}
      {formMode !== "idle" && (
        <div className="mt-6 rounded-2xl border border-yellow-100 bg-white p-6 shadow-lg shadow-yellow-100/60">
          <h2 className="text-lg font-semibold text-[#0F172A]">
            {formMode === "create" ? "New Template" : "Edit Template"}
          </h2>
          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Name *
              </label>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className={inputCls}
                placeholder="Template name"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                File URL *
              </label>
              <input
                value={formFileUrl}
                onChange={(e) => setFormFileUrl(e.target.value)}
                className={inputCls}
                placeholder="https://example.com/flyer.pdf"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Thumbnail URL
              </label>
              <input
                value={formThumbnailUrl}
                onChange={(e) => setFormThumbnailUrl(e.target.value)}
                className={inputCls}
                placeholder="https://example.com/thumb.png"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving || !formName.trim() || !formFileUrl.trim()}
                className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : formMode === "create" ? "Create" : "Update"}
              </button>
              <button
                onClick={resetForm}
                className="rounded-xl border border-yellow-100 px-5 py-2.5 text-sm font-semibold text-slate-500 transition hover:bg-yellow-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Template list */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-yellow-100 bg-white shadow-lg shadow-yellow-100/60">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
          </div>
        ) : templates.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">No flyer templates yet. Create one to speed up campaign launch.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-yellow-100 text-xs uppercase tracking-wider text-slate-400">
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">File URL</th>
                  <th className="px-5 py-3 font-medium">Active</th>
                  <th className="px-5 py-3 font-medium">Created</th>
                  <th className="px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id} className="border-b border-yellow-50 last:border-0 transition hover:bg-[#FFFEF5]">
                    <td className="px-5 py-4 font-medium text-[#0F172A]">{t.name}</td>
                    <td className="max-w-xs truncate px-5 py-4 text-slate-500">
                      {t.file_url || "-"}
                    </td>
                    <td className="px-5 py-4">
                      {t.is_active !== false ? (
                        <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">Active</span>
                      ) : (
                        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">Inactive</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-slate-500">
                      {t.created_at ? new Date(t.created_at).toLocaleDateString() : "-"}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEdit(t)}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(t.id)}
                          disabled={deleting === t.id}
                          className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                        >
                          {deleting === t.id ? "..." : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
