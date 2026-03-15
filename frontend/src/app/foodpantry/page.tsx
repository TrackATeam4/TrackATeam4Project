"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

type PantryHours = Record<string, string> | null;

interface FoodPantry {
	id: string;
	name: string;
	description: string | null;
	address: string;
	latitude: number;
	longitude: number;
	phone: string | null;
	website: string | null;
	hours: PantryHours;
	services: string[];
	is_verified: boolean;
}

type PantryCampaign = {
	id: string;
	title?: string;
	description?: string;
	location?: string;
	date?: string;
	status?: string;
	food_pantry_id?: string | null;
};

type UpdateFormState = {
	name: string;
	description: string;
	address: string;
	phone: string;
	website: string;
	hoursJson: string;
	servicesCsv: string;
};

const initialUpdateForm: UpdateFormState = {
	name: "",
	description: "",
	address: "",
	phone: "",
	website: "",
	hoursJson: "{}",
	servicesCsv: "",
};

const panelCls = "rounded-3xl border border-yellow-100 bg-white p-6 shadow-lg shadow-yellow-100/60";
const inputCls =
	"w-full rounded-xl border border-yellow-100 px-4 py-2.5 text-sm text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200";

const parsePayloadData = <T,>(payload: unknown): T => {
	if (payload && typeof payload === "object" && "data" in (payload as Record<string, unknown>)) {
		return (payload as { data: T }).data;
	}
	return payload as T;
};

const parseErrorMessage = (payload: unknown, fallback: string) => {
	if (!payload || typeof payload !== "object") return fallback;
	const candidate = payload as Record<string, unknown>;
	if (typeof candidate.error === "string" && candidate.error.trim()) return candidate.error;
	if (typeof candidate.detail === "string" && candidate.detail.trim()) return candidate.detail;
	if (typeof candidate.message === "string" && candidate.message.trim()) return candidate.message;
	return fallback;
};

const parseServices = (value: string): string[] =>
	value
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean);

const parseHours = (value: string): Record<string, string> | null => {
	const trimmed = value.trim();
	if (!trimmed) return null;

	const parsed = JSON.parse(trimmed);
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error("Hours must be a JSON object, for example: {\"monday\":\"9am-5pm\"}.");
	}

	const result: Record<string, string> = {};
	for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
		if (typeof val === "string") result[key] = val;
	}

	return Object.keys(result).length ? result : null;
};

async function request<T>(path: string, options: RequestInit = {}, auth = false): Promise<T> {
	if (!API_BASE) {
		throw new Error("Missing NEXT_PUBLIC_API_URL in frontend environment.");
	}

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		...((options.headers as Record<string, string>) ?? {}),
	};

	if (auth) {
		const {
			data: { session },
		} = await supabase.auth.getSession();

		if (!session?.access_token) {
			throw new Error("Missing auth session. Please sign in as pantry owner.");
		}

		headers.Authorization = `Bearer ${session.access_token}`;
	}

	const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
	const payload = await response.json().catch(() => ({}));

	if (!response.ok) {
		throw new Error(parseErrorMessage(payload, `Request failed (${response.status})`));
	}

	return parsePayloadData<T>(payload);
}

export default function FoodPantryDashboardPage() {
	const [me, setMe] = useState<FoodPantry | null>(null);
	const [updateForm, setUpdateForm] = useState<UpdateFormState>(initialUpdateForm);
	const [ownerCampaigns, setOwnerCampaigns] = useState<PantryCampaign[]>([]);
	const [ownerLoading, setOwnerLoading] = useState(false);
	const [ownerMessage, setOwnerMessage] = useState("");
	const [linkingCampaignId, setLinkingCampaignId] = useState<string | null>(null);

	const loadOwnerDashboard = async () => {
		setOwnerLoading(true);
		setOwnerMessage("");

		try {
			const [nextMe, campaigns] = await Promise.all([
				request<FoodPantry>("/pantry/me", { method: "GET" }, true),
				request<PantryCampaign[]>("/pantry/me/campaigns", { method: "GET" }, true),
			]);

			setMe(nextMe);
			setOwnerCampaigns(Array.isArray(campaigns) ? campaigns : []);
			setUpdateForm({
				name: nextMe.name ?? "",
				description: nextMe.description ?? "",
				address: nextMe.address ?? "",
				phone: nextMe.phone ?? "",
				website: nextMe.website ?? "",
				hoursJson: JSON.stringify(nextMe.hours ?? {}, null, 2),
				servicesCsv: (nextMe.services ?? []).join(", "),
			});
		} catch (error) {
			setOwnerMessage(error instanceof Error ? error.message : "Unable to load pantry owner dashboard.");
			setMe(null);
			setOwnerCampaigns([]);
		} finally {
			setOwnerLoading(false);
		}
	};

	useEffect(() => {
		void loadOwnerDashboard();
	}, []);

	const handleOwnerUpdate = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setOwnerLoading(true);
		setOwnerMessage("");

		try {
			const payload = {
				name: updateForm.name.trim(),
				description: updateForm.description.trim() || null,
				address: updateForm.address.trim(),
				phone: updateForm.phone.trim() || null,
				website: updateForm.website.trim() || null,
				hours: parseHours(updateForm.hoursJson),
				services: parseServices(updateForm.servicesCsv),
			};

			const updated = await request<FoodPantry>(
				"/pantry/me",
				{ method: "PUT", body: JSON.stringify(payload) },
				true
			);

			setMe(updated);
			setOwnerMessage("Pantry profile updated.");
		} catch (error) {
			setOwnerMessage(error instanceof Error ? error.message : "Unable to update pantry profile.");
		} finally {
			setOwnerLoading(false);
		}
	};

	const handleLinkCampaign = async (campaignId: string) => {
		setLinkingCampaignId(campaignId);
		setOwnerMessage("");

		try {
			await request(`/pantry/me/campaigns/${campaignId}/link`, { method: "POST" }, true);
			setOwnerMessage("Campaign linked successfully.");
			await loadOwnerDashboard();
		} catch (error) {
			setOwnerMessage(error instanceof Error ? error.message : "Unable to link campaign.");
		} finally {
			setLinkingCampaignId(null);
		}
	};

	return (
		<main className="min-h-screen bg-[#FFFEF5] px-6 py-10 text-slate-700">
			<div className="mx-auto max-w-7xl space-y-6">
				<section className={panelCls}>
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div>
							<p className="text-xs uppercase tracking-[0.18em] text-slate-400">Food Pantry Dashboard</p>
							<h1 className="mt-1 text-3xl font-bold text-[#0F172A]">Manage Pantry Operations</h1>
						</div>
						<div className="rounded-full bg-emerald-100 px-4 py-1.5 text-xs font-semibold text-emerald-700">
							Owner Mode
						</div>
					</div>
				</section>

				<section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
						<div className={panelCls}>
							<h2 className="text-xl font-semibold text-[#0F172A]">Owner Profile</h2>
							<p className="mt-1 text-sm text-slate-500">Endpoints: GET /pantry/me, PUT /pantry/me</p>

							<form className="mt-5 grid gap-3" onSubmit={handleOwnerUpdate}>
								<input className={inputCls} placeholder="Pantry name" value={updateForm.name} onChange={(e) => setUpdateForm((p) => ({ ...p, name: e.target.value }))} required />
								<textarea className={inputCls} rows={3} placeholder="Description" value={updateForm.description} onChange={(e) => setUpdateForm((p) => ({ ...p, description: e.target.value }))} />
								<input className={inputCls} placeholder="Address" value={updateForm.address} onChange={(e) => setUpdateForm((p) => ({ ...p, address: e.target.value }))} required />

								<div className="grid gap-3 md:grid-cols-2">
									<input className={inputCls} placeholder="Phone" value={updateForm.phone} onChange={(e) => setUpdateForm((p) => ({ ...p, phone: e.target.value }))} />
									<input className={inputCls} placeholder="Website" value={updateForm.website} onChange={(e) => setUpdateForm((p) => ({ ...p, website: e.target.value }))} />
								</div>

								<input className={inputCls} placeholder="Services (comma-separated)" value={updateForm.servicesCsv} onChange={(e) => setUpdateForm((p) => ({ ...p, servicesCsv: e.target.value }))} />
								<textarea className={`${inputCls} font-mono text-xs`} rows={4} placeholder="Hours JSON" value={updateForm.hoursJson} onChange={(e) => setUpdateForm((p) => ({ ...p, hoursJson: e.target.value }))} />

								<div className="flex flex-wrap gap-3">
									<button
										type="submit"
										disabled={ownerLoading}
										className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-70"
									>
										{ownerLoading ? "Saving..." : "Save Pantry Profile"}
									</button>

									<button
										type="button"
										onClick={() => void loadOwnerDashboard()}
										disabled={ownerLoading}
										className="rounded-xl border border-yellow-200 bg-yellow-50 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-yellow-100 disabled:opacity-70"
									>
										Refresh Owner Data
									</button>
								</div>
							</form>

							{me ? (
								<div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
									Pantry ID: {me.id} · Verified: {me.is_verified ? "Yes" : "No"}
								</div>
							) : null}

							{ownerMessage ? (
								<p className="mt-4 rounded-xl bg-yellow-50 px-4 py-3 text-sm text-slate-700">{ownerMessage}</p>
							) : null}
						</div>

						<div className={panelCls}>
							<h2 className="text-xl font-semibold text-[#0F172A]">Campaigns for This Pantry</h2>
							<p className="mt-1 text-sm text-slate-500">
								Endpoints: GET /pantry/me/campaigns, POST /pantry/me/campaigns/{"{id}"}/link
							</p>

							<div className="mt-5 space-y-3">
								{ownerCampaigns.length === 0 ? (
									<p className="rounded-xl bg-yellow-50 px-4 py-3 text-sm text-slate-600">
										No campaigns found for this owner pantry.
									</p>
								) : (
									ownerCampaigns.map((campaign) => (
										<div key={campaign.id} className="rounded-2xl border border-yellow-100 bg-[#FFFEF5] p-4">
											<p className="text-sm font-semibold text-slate-800">{campaign.title ?? "Untitled campaign"}</p>
											<p className="mt-1 text-xs text-slate-500">
												ID: {campaign.id} · Status: {campaign.status ?? "-"} · Pantry Link: {campaign.food_pantry_id ?? "None"}
											</p>
											<button
												type="button"
												onClick={() => void handleLinkCampaign(campaign.id)}
												disabled={linkingCampaignId === campaign.id}
												className="mt-3 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-70"
											>
												{linkingCampaignId === campaign.id ? "Linking..." : "Link This Campaign"}
											</button>
										</div>
									))
								)}
							</div>
						</div>
					</section>
			</div>
		</main>
	);
}
