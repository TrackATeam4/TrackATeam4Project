import { supabase } from "@/lib/supabase";

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE) {
  throw new Error("Missing NEXT_PUBLIC_API_URL");
}

type ApiSuccess<T> = {
  success: true;
  data: T;
  meta?: {
    total: number;
    page: number;
    limit: number;
  };
};

type ApiError = {
  success: false;
  error: string;
  code: string;
};

const readErrorMessage = (payload: unknown): string => {
  if (!payload || typeof payload !== "object") return "Request failed";
  const candidate = payload as Record<string, unknown>;
  if (typeof candidate.error === "string" && candidate.error.trim()) return candidate.error;
  if (typeof candidate.detail === "string" && candidate.detail.trim()) return candidate.detail;
  return "Request failed";
};

export async function authFetch<T>(path: string, options: RequestInit = {}): Promise<ApiSuccess<T>> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.access_token) {
    throw new Error("Missing auth session. Please sign in again.");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(readErrorMessage(payload));
  }

  return payload as ApiSuccess<T>;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<ApiSuccess<T>> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(readErrorMessage(payload));
  }

  return payload as ApiSuccess<T>;
}

export type { ApiSuccess, ApiError };
