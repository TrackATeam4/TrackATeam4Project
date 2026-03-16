"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { authFetch } from "@/lib/api";

interface Signup {
  user_id: string;
  user_name?: string;
  user_email?: string;
  signed_up_at?: string;
  attended?: boolean;
}

interface CampaignDetail {
  id: string;
  title?: string;
  name?: string;
  description?: string;
  status: string;
  date?: string;
  start_time?: string;
  end_time?: string;
  location?: string;
  address?: string;
  max_volunteers?: number;
  signup_count?: number;
  target_flyers?: number;
  tags?: string[];
  created_at?: string;
  signups?: Signup[];
}

export default function AdminCampaignDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    const fetchCampaign = async () => {
      setLoading(true);
      try {
        const res = await authFetch<{ campaign: CampaignDetail; tasks?: unknown[]; signup_count?: number }>(`/admin/campaigns/${id}`);
        const c = res.data?.campaign ?? res.data;
        if (res.data?.signup_count !== undefined) {
          (c as CampaignDetail).signup_count = res.data.signup_count;
        }
        setCampaign(c as CampaignDetail);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load campaign.");
      } finally {
        setLoading(false);
      }
    };
    fetchCampaign();
  }, [id]);

  const handleCancel = async () => {
    if (!confirm("Are you sure you want to cancel this campaign?")) return;
    setCancelling(true);
    try {
      await authFetch(`/admin/campaigns/${id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: "cancelled" }),
      });
      setCampaign((prev) => (prev ? { ...prev, status: "cancelled" } : prev));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to cancel.");
    } finally {
      setCancelling(false);
    }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      published: "bg-[#F5C542]/15 text-[#A66F00]",
      draft: "bg-slate-100 text-slate-600",
      cancelled: "bg-rose-100 text-rose-700",
      completed: "bg-blue-100 text-blue-700",
    };
    return map[status] ?? "bg-slate-100 text-slate-600";
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#F5C542]/40 border-t-[#E0B63A]" />
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="px-6 py-8">
        <Link href="/admin/campaigns" className="text-sm text-[#A66F00] hover:underline">
          &larr; Back to Campaigns
        </Link>
        <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error || "Campaign not found."}
        </div>
      </div>
    );
  }

  const signups = campaign.signups ?? [];
  const attendedCount = signups.filter((s) => s.attended).length;

  return (
    <div className="px-6 py-8 text-slate-700">
      <Link href="/admin/campaigns" className="inline-flex items-center text-sm text-[#A66F00] hover:underline">
        &larr; Back to Campaigns
      </Link>

      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#0F172A]">
            {campaign.title || campaign.name || "Untitled"}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadge(campaign.status)}`}>
              {campaign.status}
            </span>
            {campaign.tags?.map((tag) => (
              <span key={tag} className="rounded-full bg-yellow-100 px-2.5 py-1 text-xs text-yellow-700">
                {tag}
              </span>
            ))}
          </div>
        </div>
        {campaign.status !== "cancelled" && (
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="rounded-xl border border-rose-200 px-5 py-2.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
          >
            {cancelling ? "Cancelling..." : "Cancel Campaign"}
          </button>
        )}
      </div>

      {/* Detail cards */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Date", value: campaign.date ? new Date(campaign.date).toLocaleDateString() : "—" },
          { label: "Time", value: campaign.start_time && campaign.end_time ? `${campaign.start_time} – ${campaign.end_time}` : "—" },
          { label: "Location", value: campaign.location || campaign.address || "—" },
          { label: "Target Flyers", value: campaign.target_flyers?.toLocaleString() ?? "—" },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-yellow-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{card.label}</p>
            <p className="mt-1 text-base font-semibold text-[#0F172A]">{card.value}</p>
          </div>
        ))}
      </div>

      {campaign.description && (
        <div className="mt-6 rounded-2xl border border-yellow-100 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Description</p>
          <p className="mt-2 text-sm text-slate-600">{campaign.description}</p>
        </div>
      )}

      {/* Signups & Attendance */}
      <div className="mt-8 rounded-2xl border border-yellow-100 bg-white p-6 shadow-lg shadow-yellow-100/60">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-[#0F172A]">Signups &amp; Attendance</h2>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-slate-500">
              Signups: <span className="font-semibold text-[#A66F00]">{signups.length}</span>
              {campaign.max_volunteers ? ` / ${campaign.max_volunteers}` : ""}
            </span>
            <span className="text-slate-500">
              Attended: <span className="font-semibold text-blue-700">{attendedCount}</span>
            </span>
          </div>
        </div>

        {signups.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">No signups yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-yellow-100 text-xs uppercase tracking-wider text-slate-400">
                  <th className="pb-3 pr-4 font-medium">Volunteer</th>
                  <th className="pb-3 pr-4 font-medium">Email</th>
                  <th className="pb-3 pr-4 font-medium">Signed Up</th>
                  <th className="pb-3 font-medium">Attended</th>
                </tr>
              </thead>
              <tbody>
                {signups.map((s, i) => (
                  <tr key={s.user_id || i} className="border-b border-yellow-50 last:border-0">
                    <td className="py-3 pr-4 font-medium text-[#0F172A]">{s.user_name || "—"}</td>
                    <td className="py-3 pr-4 text-slate-500">{s.user_email || "—"}</td>
                    <td className="py-3 pr-4 text-slate-500">
                      {s.signed_up_at ? new Date(s.signed_up_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="py-3">
                      {s.attended ? (
                        <span className="inline-flex rounded-full bg-[#F5C542]/15 px-2.5 py-1 text-xs font-semibold text-[#A66F00]">
                          Yes
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
                          No
                        </span>
                      )}
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
