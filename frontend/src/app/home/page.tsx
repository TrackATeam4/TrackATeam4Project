"use client";

import { AnimatePresence, animate, motion, useInView, useMotionValue } from "framer-motion";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { authFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import HomeSidebar from "@/components/home/HomeSidebar";

const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  variable: "--home-display",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--home-body",
});

type PostType = "upcoming_event" | "event_summary";

type Post = {
  id: string;
  author: { name: string; avatar: string | null; role: "organizer" | "volunteer" };
  type: PostType;
  content: string;
  event: null | {
    location: string;
    date: string;
    time: string;
    spotsTotal: number;
    spotsFilled: number;
  };
  likes: number;
  comments: number;
  createdAt: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type FeedCampaign = {
  id: string;
  title?: string | null;
  description?: string | null;
  location?: string | null;
  date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  max_volunteers?: number | null;
  signup_count?: number | null;
  organizer_name?: string | null;
  created_at?: string | null;
  likes?: number | null;
  comments?: number | null;
};

const formatDateLabel = (value?: string | null) => {
  if (!value) return "TBD";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const formatTimeLabel = (value?: string | null) => {
  if (!value) return "TBD";
  const normalized = value.length >= 5 ? value.slice(0, 5) : value;
  const parsed = new Date(`1970-01-01T${normalized}`);
  if (Number.isNaN(parsed.getTime())) return normalized;
  return parsed.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatRelativeLabel = (value?: string | null) => {
  if (!value) return "Recently";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Recently";

  const diffMs = Date.now() - parsed.getTime();
  const diffMins = Math.max(1, Math.floor(diffMs / 60000));
  if (diffMins < 60) return `${diffMins} min ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
};

const extractFeedCampaigns = (payload: unknown): FeedCampaign[] => {
  if (!payload || typeof payload !== "object") return [];
  const candidate = payload as Record<string, unknown>;

  if (candidate.success === true && Array.isArray(candidate.data)) {
    return candidate.data as FeedCampaign[];
  }

  if (candidate.success === true && candidate.data && typeof candidate.data === "object") {
    const inner = candidate.data as Record<string, unknown>;
    if (Array.isArray(inner.items)) return inner.items as FeedCampaign[];
  }

  if (Array.isArray(candidate.data)) return candidate.data as FeedCampaign[];
  if (Array.isArray(payload)) return payload as FeedCampaign[];
  return [];
};

const campaignToPost = (campaign: FeedCampaign): Post => {
  const spotsTotal = Math.max(1, campaign.max_volunteers ?? 10);
  const spotsFilled = Math.max(0, Math.min(spotsTotal, campaign.signup_count ?? 0));
  const startLabel = formatTimeLabel(campaign.start_time);
  const endLabel = formatTimeLabel(campaign.end_time);

  return {
    id: campaign.id,
    author: {
      name: campaign.organizer_name?.trim() || "Organizer",
      avatar: null,
      role: "organizer",
    },
    type: "upcoming_event",
    content:
      campaign.description?.trim() ||
      campaign.title?.trim() ||
      "Join this local flyering campaign and help spread pantry access information.",
    event: {
      location: campaign.location?.trim() || "Location TBD",
      date: formatDateLabel(campaign.date),
      time: `${startLabel} – ${endLabel}`,
      spotsTotal,
      spotsFilled,
    },
    likes: Math.max(0, campaign.likes ?? 0),
    comments: Math.max(0, campaign.comments ?? 0),
    createdAt: formatRelativeLabel(campaign.created_at ?? campaign.date),
  };
};


const navItems = [
  { label: "Feed", icon: "🏠", href: "/home" },
  { label: "Discover", icon: "🗺️", href: "/home/discover" },
  { label: "Create Campaign", icon: "➕", href: "/home/create" },
  { label: "Dashboard", icon: "⚙️", href: "/home/dashboard" },
  { label: "Leaderboard", icon: "📊", href: "/home/leaderboard" },
  { label: "My Profile", icon: "👤", href: "/home/profile" },
];

const mobileNavItems = [
  { label: "Feed", icon: "🏠", href: "/home" },
  { label: "Discover", icon: "🗺️", href: "/home/discover" },
  { label: "Create", icon: "➕", href: "/home/create" },
  { label: "Dashboard", icon: "⚙️", href: "/home/dashboard" },
  { label: "Profile", icon: "👤", href: "/home/profile" },
];

type PostFormState = {
  type: PostType;
  content: string;
  location: string;
  date: string;
  startTime: string;
  endTime: string;
  spots: string;
  flyers: string;
  blocks: string;
};

const initialForm: PostFormState = {
  type: "upcoming_event",
  content: "",
  location: "",
  date: "",
  startTime: "",
  endTime: "",
  spots: "",
  flyers: "",
  blocks: "",
};

const CHAT_API_BASE =
  process.env.NEXT_PUBLIC_AI_BEDROCK_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "";

const CHAT_AUTO_OPEN_TAB_KEY = "tracka.home_chat_auto_opened";

const subscribeToStorage = (callback: () => void) => {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
};

const getLocalStorageValue = (key: string, fallback: string) => {
  if (typeof window === "undefined") return fallback;
  return localStorage.getItem(key) || fallback;
};

export default function HomePage() {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [joinedPosts, setJoinedPosts] = useState<Set<string>>(new Set());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatBooting, setChatBooting] = useState(false);
  const [chatInitializedForOpen, setChatInitializedForOpen] = useState(false);
  const [chatError, setChatError] = useState("");
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState("");
  const [formState, setFormState] = useState<PostFormState>(initialForm);
  const [trendingCampaigns, setTrendingCampaigns] = useState<FeedCampaign[]>([]);
  const [feedMode, setFeedMode] = useState<"all" | "nearby" | "foryou">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Post[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [nearbyPosts, setNearbyPosts] = useState<Post[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [forYouPosts, setForYouPosts] = useState<Post[]>([]);
  const [forYouLoading, setForYouLoading] = useState(false);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [dbComments, setDbComments] = useState<Record<string, { id: string; author_name: string; body: string; created_at: string }[]>>({});
  const [loadedComments, setLoadedComments] = useState<Set<string>>(new Set());
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [submittingComment, setSubmittingComment] = useState<string | null>(null);
  const [copiedShare, setCopiedShare] = useState<string | null>(null);
  const apiBase = CHAT_API_BASE;
  const chatMessagesEndRef = useRef<HTMLDivElement | null>(null);
  const userName = useSyncExternalStore(
    subscribeToStorage,
    () => getLocalStorageValue("tracka.signup_name", "Volunteer"),
    () => "Volunteer"
  );

  useEffect(() => {
    const ensureSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push("/auth");
        return;
      }

      // Open chat once per browser tab to reduce repeated popup interruptions.
      const shouldAutoOpenChat = sessionStorage.getItem(CHAT_AUTO_OPEN_TAB_KEY) !== "1";
      if (!shouldAutoOpenChat) {
        return;
      }

      sessionStorage.setItem(CHAT_AUTO_OPEN_TAB_KEY, "1");
      setChatError("");
      setChatInitializedForOpen(false);
      setIsChatOpen(true);
    };

    void ensureSession();
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    const fetchFeed = async () => {
      setFeedLoading(true);
      setFeedError("");

      try {
        const [feedPayload, joinedPayload, trendingPayload, likedPayload] = await Promise.all([
          authFetch<FeedCampaign[]>(`/campaigns?page=1&limit=20`),
          authFetch<{ id: string }[]>(`/campaigns/joined?limit=100`).catch(() => ({ success: true as const, data: [] as { id: string }[] })),
          authFetch<FeedCampaign[]>(`/feed/trending`).catch(() => ({ success: true as const, data: [] as FeedCampaign[] })),
          authFetch<string[]>(`/campaigns/liked`).catch(() => ({ success: true as const, data: [] as string[] })),
        ]);

        const campaigns = extractFeedCampaigns(feedPayload);
        const mappedPosts = campaigns.map(campaignToPost);
        const joinedIds = new Set((joinedPayload.data ?? []).map((c) => c.id));
        const likedIds = new Set((likedPayload.data ?? []) as string[]);

        const trending = extractFeedCampaigns(trendingPayload).slice(0, 5);
        if (!cancelled) {
          setPosts(mappedPosts);
          setJoinedPosts(joinedIds);
          setLikedPosts(likedIds);
          setTrendingCampaigns(trending);
          setFeedError("");
        }
      } catch (error) {
        if (!cancelled) {
          setFeedError(error instanceof Error ? error.message : "Unable to load the feed right now.");
          setPosts([]);
        }
      } finally {
        if (!cancelled) {
          setFeedLoading(false);
        }
      }
    };

    void fetchFeed();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) { setSearchResults([]); setIsSearching(false); return; }
    setIsSearching(true);
    try {
      const payload = await authFetch<FeedCampaign[]>(`/campaigns/search?q=${encodeURIComponent(q)}`);
      const results = extractFeedCampaigns(payload).map(campaignToPost);
      setSearchResults(results);
    } catch { setSearchResults([]); } finally { setIsSearching(false); }
  };

  const loadNearby = () => {
    if (!navigator.geolocation) return;
    setNearbyLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude: lat, longitude: lng } = pos.coords;
          const payload = await authFetch<FeedCampaign[]>(`/feed/nearby?lat=${lat}&lng=${lng}&radius_km=20`);
          setNearbyPosts(extractFeedCampaigns(payload).map(campaignToPost));
        } catch { setNearbyPosts([]); } finally { setNearbyLoading(false); }
      },
      () => setNearbyLoading(false)
    );
  };

  const loadForYou = async () => {
    setForYouLoading(true);
    try {
      const payload = await authFetch<FeedCampaign[]>(`/feed?page=1&limit=20`);
      setForYouPosts(extractFeedCampaigns(payload).map(campaignToPost));
    } catch { setForYouPosts([]); } finally { setForYouLoading(false); }
  };

  const toggleLike = async (postId: string) => {
    const wasLiked = likedPosts.has(postId);
    // Optimistic update
    setLikedPosts((prev) => {
      const next = new Set(prev);
      wasLiked ? next.delete(postId) : next.add(postId);
      return next;
    });
    setPosts((prev) =>
      prev.map((p) =>
        p.id !== postId ? p : { ...p, likes: wasLiked ? p.likes - 1 : p.likes + 1 }
      )
    );
    try {
      const res = await authFetch<{ liked: boolean; count: number }>(`/campaigns/${postId}/like`, { method: "POST" });
      const { liked, count } = res.data as { liked: boolean; count: number };
      setLikedPosts((prev) => {
        const next = new Set(prev);
        liked ? next.add(postId) : next.delete(postId);
        return next;
      });
      setPosts((prev) => prev.map((p) => (p.id !== postId ? p : { ...p, likes: count })));
    } catch {
      // Revert on failure
      setLikedPosts((prev) => {
        const next = new Set(prev);
        wasLiked ? next.add(postId) : next.delete(postId);
        return next;
      });
      setPosts((prev) =>
        prev.map((p) =>
          p.id !== postId ? p : { ...p, likes: wasLiked ? p.likes + 1 : p.likes - 1 }
        )
      );
    }
  };

  const toggleComments = async (postId: string) => {
    const isOpening = !expandedComments.has(postId);
    setExpandedComments((prev) => {
      const next = new Set(prev);
      isOpening ? next.add(postId) : next.delete(postId);
      return next;
    });
    // Fetch comments the first time this post is expanded
    if (isOpening && !loadedComments.has(postId)) {
      try {
        const res = await authFetch<{ id: string; author_name: string; body: string; created_at: string }[]>(
          `/campaigns/${postId}/comments`
        );
        const comments = (res.data ?? []) as { id: string; author_name: string; body: string; created_at: string }[];
        setDbComments((prev) => ({ ...prev, [postId]: comments }));
        setLoadedComments((prev) => new Set(prev).add(postId));
        setPosts((prev) => prev.map((p) => (p.id !== postId ? p : { ...p, comments: comments.length })));
      } catch { /* show empty state */ }
    }
  };

  const submitComment = async (postId: string) => {
    const text = (commentDrafts[postId] ?? "").trim();
    if (!text || submittingComment === postId) return;
    setSubmittingComment(postId);
    setCommentDrafts((prev) => ({ ...prev, [postId]: "" }));
    try {
      const res = await authFetch<{ id: string; author_name: string; body: string; created_at: string }>(
        `/campaigns/${postId}/comments`,
        { method: "POST", body: JSON.stringify({ body: text }) }
      );
      const newComment = res.data as { id: string; author_name: string; body: string; created_at: string };
      setDbComments((prev) => ({ ...prev, [postId]: [...(prev[postId] ?? []), newComment] }));
      setPosts((prev) => prev.map((p) => (p.id !== postId ? p : { ...p, comments: p.comments + 1 })));
    } catch {
      // Restore draft on failure
      setCommentDrafts((prev) => ({ ...prev, [postId]: text }));
    } finally {
      setSubmittingComment(null);
    }
  };

  const copyShare = (postId: string) => {
    const url = `${window.location.origin}/c/${postId}`;
    navigator.clipboard.writeText(url).catch(() => {});
    setCopiedShare(postId);
    setTimeout(() => setCopiedShare(null), 2000);
  };

  const toggleJoin = async (postId: string) => {
    const isCurrentlyJoined = joinedPosts.has(postId);

    // Optimistic UI update
    setJoinedPosts((prev) => {
      const next = new Set(prev);
      if (isCurrentlyJoined) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });

    setPosts((prev) =>
      prev.map((post) => {
        if (post.id !== postId || !post.event) return post;
        const delta = isCurrentlyJoined ? -1 : 1;
        const newFilled = Math.max(0, post.event.spotsFilled + delta);
        return {
          ...post,
          event: { ...post.event, spotsFilled: newFilled },
        };
      })
    );

    try {
      if (isCurrentlyJoined) {
        await authFetch(`/campaigns/${postId}/signup`, { method: "DELETE" });
      } else {
        await authFetch(`/campaigns/${postId}/signup`, { method: "POST" });
      }
    } catch (error) {
      // Revert optimistic updates on failure
      setJoinedPosts((prev) => {
        const next = new Set(prev);
        if (isCurrentlyJoined) {
          next.add(postId);
        } else {
          next.delete(postId);
        }
        return next;
      });
      setPosts((prev) =>
        prev.map((post) => {
          if (post.id !== postId || !post.event) return post;
          const delta = isCurrentlyJoined ? 1 : -1;
          const newFilled = Math.max(0, post.event.spotsFilled + delta);
          return {
            ...post,
            event: { ...post.event, spotsFilled: newFilled },
          };
        })
      );
      console.error("Failed to update campaign signup:", error);
    }
  };

  const openModal = (type?: PostType) => {
    setFormState((prev) => ({
      ...prev,
      type: type ?? prev.type,
    }));
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setFormState(initialForm);
  };

  useEffect(() => {
    if (!isModalOpen) return;

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeModal();
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isModalOpen]);

  const toggleChatPopup = () => {
    setIsChatOpen((prev) => {
      const next = !prev;
      if (next) {
        setChatError("");
        setChatInitializedForOpen(false);
      }
      return next;
    });
  };

  const closeChatPopup = () => {
    setIsChatOpen(false);
    setChatInitializedForOpen(false);
  };

  const extractMessages = (payload: unknown): ChatMessage[] => {
    if (!Array.isArray(payload)) return [];

    return payload
      .map((item) => {
        if (typeof item === "string") {
          return { role: "assistant" as const, content: item };
        }

        if (item && typeof item === "object") {
          const candidate = item as { role?: unknown; content?: unknown; message?: unknown };
          const role = candidate.role === "user" ? "user" : "assistant";
          const contentValue =
            typeof candidate.content === "string"
              ? candidate.content
              : typeof candidate.message === "string" && candidate.message
              ? candidate.message
              : "";

          if (contentValue.trim().length > 0) {
            return { role, content: contentValue };
          }
        }

        return null;
      })
      .filter((message): message is ChatMessage => Boolean(message));
  };

  const getChatAuthHeaders = useCallback(async (includeJsonContentType = false): Promise<HeadersInit> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error("Please sign in to use the chatbot.");
    }

    return {
      ...(includeJsonContentType ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${session.access_token}`,
    };
  }, []);

  const createChatSession = useCallback(async () => {
    const response = await fetch(`${apiBase}/chat/session`, {
      method: "POST",
      headers: await getChatAuthHeaders(true),
    });

    if (!response.ok) {
      throw new Error("Unable to start chatbot session.");
    }

    const payload = await response.json();
    const data = (payload?.data as Record<string, unknown> | undefined) || payload;
    const sessionId = (data?.session_id as string | undefined) || null;
    if (!sessionId) {
      throw new Error("Chatbot session id missing from response.");
    }

    setChatSessionId(sessionId);
    localStorage.setItem("tracka.chat_session_id", sessionId);
    const initialMessages = extractMessages(data?.messages);
    setChatMessages(
      initialMessages.length > 0
        ? initialMessages
        : [{ role: "assistant", content: "Hi! Ask me anything about your campaign." }]
    );
    return sessionId;
  }, [apiBase, getChatAuthHeaders]);

  const loadChatSession = useCallback(
    async (sessionId: string) => {
      const response = await fetch(`${apiBase}/chat/session/${sessionId}`, {
        method: "GET",
        headers: await getChatAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error("Unable to load chatbot session.");
      }

      const payload = await response.json();
      const data = (payload?.data as Record<string, unknown> | undefined) || payload;
      const loadedMessages = extractMessages(data?.messages);
      setChatSessionId(sessionId);
      setChatMessages(loadedMessages);
    },
    [apiBase, getChatAuthHeaders]
  );

  const startNewChatSession = useCallback(async () => {
    if (chatLoading || chatBooting) return;

    setChatBooting(true);
    setChatError("");
    setChatInput("");
    setChatSessionId(null);
    setChatMessages([]);
    localStorage.removeItem("tracka.chat_session_id");

    try {
      await createChatSession();
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Unable to start a new chat session.");
    } finally {
      setChatBooting(false);
    }
  }, [chatBooting, chatLoading, createChatSession]);

  const sendChatMessage = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = chatInput.trim();

    if (!message || chatLoading) return;

    setChatInput("");
    setChatError("");
    setChatMessages((prev) => [...prev, { role: "user", content: message }]);
    setChatLoading(true);

    try {
      let activeSessionId = chatSessionId;
      if (!activeSessionId) {
        activeSessionId = await createChatSession();
      }

      if (!activeSessionId) {
        throw new Error("Chatbot session is not ready yet.");
      }

      const response = await fetch(`${apiBase}/chat/message`, {
        method: "POST",
        headers: await getChatAuthHeaders(true),
        body: JSON.stringify({
          session_id: activeSessionId,
          message,
        }),
      });

      if (!response.ok) {
        throw new Error("Chatbot failed to send message.");
      }

      const payload = await response.json();
      const data = (payload?.data as Record<string, unknown> | undefined) || payload;
      const mergedMessages = extractMessages(data?.messages);

      if (mergedMessages.length > 0) {
        setChatMessages(mergedMessages);
        return;
      }

      const assistantReply =
        (typeof data?.reply === "string" && data.reply) ||
        (typeof data?.response === "string" && data.response) ||
        (typeof data?.answer === "string" && data.answer) ||
        (typeof data?.message === "string" && data.message) ||
        "I am here and listening. Can you share a little more?";

      setChatMessages((prev) => [...prev, { role: "assistant", content: assistantReply }]);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Unable to send message.");
    } finally {
      setChatLoading(false);
    }
  };

  useEffect(() => {
    if (!isChatOpen) {
      setChatBooting(false);
      return;
    }

    if (chatSessionId || chatBooting || chatInitializedForOpen) return;

    const initializeChat = async () => {
      setChatBooting(true);
      setChatInitializedForOpen(true);
      setChatError("");
      try {
        const existingSessionId = localStorage.getItem("tracka.chat_session_id");
        if (existingSessionId) {
          try {
            await loadChatSession(existingSessionId);
          } catch {
            localStorage.removeItem("tracka.chat_session_id");
            await createChatSession();
          }
        } else {
          await createChatSession();
        }
      } catch (error) {
        localStorage.removeItem("tracka.chat_session_id");
        setChatError(error instanceof Error ? error.message : "Unable to open chatbot.");
      } finally {
        setChatBooting(false);
      }
    };

    void initializeChat();
  }, [
    chatBooting,
    chatInitializedForOpen,
    chatSessionId,
    createChatSession,
    isChatOpen,
    loadChatSession,
  ]);

  useEffect(() => {
    if (!isChatOpen) return;
    chatMessagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chatMessages, chatLoading, chatBooting, isChatOpen]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const newPost: Post = {
      id: `${Date.now()}`,
      author: { name: userName, avatar: null, role: "volunteer" },
      type: formState.type,
      content: formState.content,
      event:
        formState.type === "upcoming_event"
          ? {
              location: formState.location || "TBD",
              date: formState.date || "TBD",
              time:
                formState.startTime && formState.endTime
                  ? `${formState.startTime} – ${formState.endTime}`
                  : "TBD",
              spotsTotal: Number(formState.spots || 0),
              spotsFilled: 0,
            }
          : null,
      likes: 0,
      comments: 0,
      createdAt: "Just now",
    };

    setPosts((prev) => [newPost, ...prev]);
    closeModal();
  };

  return (
    <div
      className={`${dmSerif.variable} ${dmSans.variable} min-h-screen bg-[#FFF8E1] text-[#1A1A1A]`}
      style={{ fontFamily: "var(--home-body)" }}
    >
      <HomeSidebar />

      <div className="flex">
        <main className="flex-1 px-5 pb-24 pt-8 lg:ml-72 md:ml-24 xl:mr-[300px]">
          <div className="mx-auto max-w-2xl space-y-8">
            {/* ── Trending Carousel ── */}
            {trendingCampaigns.length > 0 && !searchQuery && (
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[#6B7280]">🔥 Trending Now</p>
                <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
                  {trendingCampaigns.map((c) => (
                    <Link
                      key={c.id}
                      href={`/home/campaign/${c.id}`}
                      className="group relative flex-shrink-0 w-52 overflow-hidden rounded-2xl border border-yellow-100 bg-gradient-to-br from-yellow-50 to-amber-50 p-4 shadow-sm transition hover:shadow-md hover:border-yellow-200"
                    >
                      <div className="absolute top-3 right-3 rounded-full bg-amber-400/20 border border-amber-300/40 px-1.5 py-0.5 text-xs font-bold text-amber-700">
                        🔥
                      </div>
                      <p className="pr-8 text-sm font-semibold text-[#0F172A] line-clamp-2 group-hover:text-emerald-800 transition">{c.title}</p>
                      <p className="mt-2 text-xs text-slate-500 line-clamp-1">{c.location ?? "Location TBD"}</p>
                      <p className="mt-1 text-xs text-amber-600 font-medium">{(c as { recent_signups?: number }).recent_signups ?? 0} recent joins</p>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* ── Feed mode + Search ── */}
            <div className="space-y-3">
              {/* Mode toggle */}
              <div className="flex items-center gap-2">
                <div className="flex rounded-xl border border-gray-200 bg-white p-1 text-xs font-semibold">
                  {(["all", "foryou", "nearby"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        setFeedMode(mode);
                        if (mode === "nearby" && nearbyPosts.length === 0) loadNearby();
                        if (mode === "foryou" && forYouPosts.length === 0) void loadForYou();
                      }}
                      className={`rounded-lg px-4 py-1.5 transition ${
                        feedMode === mode
                          ? "bg-[#F5C542] text-[#1A1A1A] shadow-sm font-bold"
                          : "text-[#6B7280] hover:text-[#1A1A1A]"
                      }`}
                    >
                      {mode === "all" ? "📋 All" : mode === "foryou" ? "✨ For You" : "📍 Nearby"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Search input */}
              <div className="relative">
                <svg className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6B7280]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search campaigns..."
                  value={searchQuery}
                  onChange={(e) => { void handleSearch(e.target.value); }}
                  className="w-full rounded-2xl border border-gray-200 bg-white py-3 pl-11 pr-4 text-sm text-[#1A1A1A] placeholder-[#9CA3AF] shadow-sm focus:border-[#F5C542] focus:outline-none focus:ring-1 focus:ring-[#F5C542]/40"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => { setSearchQuery(""); setSearchResults([]); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:text-slate-600"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {feedLoading && (
              <div className="rounded-2xl border border-yellow-100 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
                Loading feed from API...
              </div>
            )}

            {feedError && (
              <div className="rounded-2xl border border-yellow-100 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
                {feedError}
              </div>
            )}

            {!feedLoading && !feedError && posts.length === 0 && !searchQuery && (
              <div className="rounded-2xl border border-gray-100 bg-white px-4 py-6 text-sm text-slate-500">
                No campaigns yet. Be the first to post an event update.
              </div>
            )}

            {searchQuery && !isSearching && searchResults.length === 0 && (
              <div className="rounded-2xl border border-gray-100 bg-white px-4 py-6 text-center text-sm text-slate-500">
                No campaigns found for &quot;{searchQuery}&quot;
              </div>
            )}

            {feedMode === "nearby" && nearbyLoading && (
              <div className="rounded-2xl border border-yellow-100 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
                Finding campaigns near you...
              </div>
            )}

            {feedMode === "nearby" && !nearbyLoading && nearbyPosts.length === 0 && (
              <div className="rounded-2xl border border-gray-100 bg-white px-4 py-6 text-center text-sm text-slate-500">
                No campaigns found within 20 km of your location.
              </div>
            )}

            {feedMode === "foryou" && forYouLoading && (
              <div className="rounded-2xl border border-yellow-100 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
                Personalizing your feed...
              </div>
            )}

            {feedMode === "foryou" && !forYouLoading && forYouPosts.length === 0 && (
              <div className="rounded-2xl border border-gray-100 bg-white px-4 py-8 text-center">
                <p className="text-2xl">✨</p>
                <p className="mt-2 text-sm text-slate-500">Your personalized feed is being built — join campaigns to improve recommendations!</p>
              </div>
            )}

            <motion.div
              className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
              whileHover={{ scale: 1.005 }}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#FCD34D] to-[#10B981] text-sm font-semibold text-[#1B4332]">
                  {userName.charAt(0).toUpperCase()}
                </div>
                <motion.button
                  type="button"
                  onClick={() => openModal()}
                  whileHover={{ scale: 1.01 }}
                  className="flex-1 rounded-xl bg-gray-50 px-4 py-3 text-left text-sm text-[#9CA3AF] transition hover:bg-gray-100"
                >
                  Share an upcoming event or campaign update...
                </motion.button>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <motion.button
                  type="button"
                  onClick={() => openModal("upcoming_event")}
                  whileHover={{ y: -1 }}
                  className="rounded-full border border-yellow-200 bg-[#FEF9C3] px-3 py-1.5 text-xs font-semibold text-yellow-700"
                >
                  📍 Upcoming Event
                </motion.button>
                <motion.button
                  type="button"
                  onClick={() => openModal("event_summary")}
                  whileHover={{ y: -1 }}
                  className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700"
                >
                  📝 Event Summary
                </motion.button>
              </div>
            </motion.div>

            <motion.div
              initial="hidden"
              animate="show"
              variants={{
                hidden: {},
                show: { transition: { staggerChildren: 0.08 } },
              }}
              className="space-y-6"
            >
              {(searchQuery ? searchResults : feedMode === "nearby" ? nearbyPosts : feedMode === "foryou" ? forYouPosts : posts).map((post) => {
                const isLiked = likedPosts.has(post.id);
                const isJoined = joinedPosts.has(post.id);
                const progress = post.event
                  ? Math.round((post.event.spotsFilled / post.event.spotsTotal) * 100)
                  : 0;

                return (
                  <motion.div
                    key={post.id}
                    variants={{
                      hidden: { opacity: 0, y: 16 },
                      show: { opacity: 1, y: 0 },
                    }}
                    whileHover={{ y: -2, boxShadow: "0 20px 40px -30px rgba(27, 67, 50, 0.45)" }}
                    viewport={{ once: true, amount: 0.2 }}
                    className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
                  >
                    <div
                      className={`absolute left-0 top-0 h-[3px] w-full ${
                        post.type === "upcoming_event"
                          ? "bg-gradient-to-r from-yellow-400 to-amber-500"
                          : "bg-gradient-to-r from-emerald-400 to-teal-500"
                      }`}
                    />
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white ${
                            post.author.role === "organizer"
                              ? "bg-gradient-to-br from-emerald-400 to-emerald-600"
                              : "bg-gradient-to-br from-yellow-400 to-amber-500"
                          }`}
                        >
                          {post.author.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-[#0F172A]">{post.author.name}</p>
                          <div className="flex items-center gap-2 text-xs text-slate-400">
                            <span
                              className={`rounded-full px-2 py-0.5 ${
                                post.author.role === "organizer"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-yellow-100 text-yellow-700"
                              }`}
                            >
                              {post.author.role === "organizer" ? "Organizer" : "Volunteer"}
                            </span>
                            <span>{post.createdAt}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4">
                      <span
                        className={`inline-flex rounded-lg border px-3 py-1 text-xs font-medium ${
                          post.type === "upcoming_event"
                            ? "border-yellow-200 bg-gradient-to-r from-yellow-50 to-amber-50 text-yellow-700"
                            : "border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-700"
                        }`}
                      >
                        {post.type === "upcoming_event" ? "📍 Upcoming Event" : "📝 Event Summary"}
                      </span>
                      <p className="mt-3 text-sm leading-relaxed text-slate-700">{post.content}</p>
                    </div>

                    {post.event && (
                      <div className="mt-4 space-y-3 rounded-2xl border border-gray-100 bg-gradient-to-br from-gray-50 to-gray-100/50 p-4">
                        <div className="text-sm font-medium text-[#F97316]">📍 {post.event.location}</div>
                        <div className="text-sm text-slate-600">
                          📅 {post.event.date} • {post.event.time}
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs text-slate-500">
                            <span>👥 {post.event.spotsFilled}/{post.event.spotsTotal} spots filled</span>
                            <span>{progress}%</span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-emerald-100">
                            <motion.div
                              className="h-2 rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500"
                              initial={{ width: 0 }}
                              animate={{ width: `${progress}%` }}
                              transition={{ duration: 0.6, ease: "easeOut" }}
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <motion.button
                            type="button"
                            onClick={() => toggleJoin(post.id)}
                            whileHover={{ y: -1 }}
                            whileTap={{ scale: 0.97 }}
                            className={`rounded-xl px-5 py-2.5 text-xs font-semibold transition ${
                              isJoined
                                ? "bg-gray-100 text-gray-500"
                                : "bg-gradient-to-r from-emerald-500 to-emerald-600 text-white"
                            }`}
                          >
                            {isJoined ? "✓ Joined" : "Join Campaign"}
                          </motion.button>
                          <Link
                            href={`/home/campaign/${post.id}`}
                            className="rounded-xl border border-gray-200 px-4 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-gray-50 hover:border-gray-300"
                          >
                            View Details →
                          </Link>
                        </div>
                      </div>
                    )}

                    <div className="mt-4 flex items-center gap-4 text-xs text-slate-500">
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.95 }}
                        onClick={() => void toggleLike(post.id)}
                        className="flex items-center gap-2 transition hover:text-slate-600"
                      >
                        <motion.span
                          animate={
                            isLiked
                              ? { scale: [1, 1.3, 1], color: "#F43F5E" }
                              : { scale: 1, color: "#94A3B8" }
                          }
                          transition={{ duration: 0.3 }}
                        >
                          {isLiked ? "❤️" : "🤍"}
                        </motion.span>
                        {post.likes} likes
                      </motion.button>
                      <span className="text-slate-300">·</span>
                      <button
                        type="button"
                        onClick={() => void toggleComments(post.id)}
                        className={`flex items-center gap-2 transition hover:text-slate-600 ${expandedComments.has(post.id) ? "text-emerald-600 font-semibold" : ""}`}
                      >
                        💬 {post.comments} comments
                      </button>
                      <span className="text-slate-300">·</span>
                      <button
                        type="button"
                        onClick={() => copyShare(post.id)}
                        className={`flex items-center gap-2 transition ${copiedShare === post.id ? "text-emerald-600 font-semibold" : "hover:text-slate-600"}`}
                      >
                        {copiedShare === post.id ? "✓ Copied!" : "🔗 Share"}
                      </button>
                    </div>

                    <AnimatePresence>
                      {expandedComments.has(post.id) && (
                        <motion.div
                          key={`comments-${post.id}`}
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="mt-3 overflow-hidden"
                        >
                          <div className="space-y-2 border-t border-gray-100 pt-3">
                            {!loadedComments.has(post.id) && (
                              <p className="text-xs text-slate-400 italic">Loading comments…</p>
                            )}
                            {loadedComments.has(post.id) && (dbComments[post.id] ?? []).length === 0 && (
                              <p className="text-xs text-slate-400 italic">No comments yet. Be the first!</p>
                            )}
                            {(dbComments[post.id] ?? []).map((c) => (
                              <div key={c.id} className="flex items-start gap-2">
                                <div className="h-6 w-6 shrink-0 rounded-full bg-[#FFFBEB] border border-[#F5C542]/40 flex items-center justify-center text-xs font-bold text-[#1B4332]">
                                  {c.author_name[0]?.toUpperCase() ?? "?"}
                                </div>
                                <div className="rounded-xl bg-gray-50 px-3 py-1.5 text-xs text-slate-700">
                                  <span className="font-semibold text-slate-800">{c.author_name}</span>{" "}
                                  {c.body}
                                </div>
                              </div>
                            ))}
                            <div className="flex items-center gap-2 pt-1">
                              <input
                                type="text"
                                value={commentDrafts[post.id] ?? ""}
                                onChange={(e) => setCommentDrafts((prev) => ({ ...prev, [post.id]: e.target.value }))}
                                onKeyDown={(e) => { if (e.key === "Enter") void submitComment(post.id); }}
                                placeholder="Write a comment…"
                                className="flex-1 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-[#F5C542] focus:ring-1 focus:ring-[#F5C542]/30"
                              />
                              <button
                                type="button"
                                disabled={submittingComment === post.id}
                                onClick={() => void submitComment(post.id)}
                                className="rounded-full bg-[#1B4332] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#163828] transition disabled:opacity-50"
                              >
                                {submittingComment === post.id ? "…" : "Post"}
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </motion.div>
          </div>
        </main>

        <aside className="fixed right-0 top-0 hidden h-screen w-[280px] flex-col gap-6 overflow-y-auto border-l border-gray-200 bg-white px-6 py-8 xl:flex">
          <motion.div
            className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
          >
            <h3
              className="text-base font-semibold text-[#1B4332]"
              style={{ fontFamily: "var(--home-display)" }}
            >
              🍋 Community Impact
            </h3>
            <div className="mt-3 h-[2px] w-full rounded-full bg-gradient-to-r from-[#FCD34D] to-[#10B981]" />
            <div className="mt-4 space-y-3 text-sm text-slate-500">
              <div className="flex justify-between">
                <span>Campaigns completed</span>
                <StatCounter value={142} className="text-[#1B4332]" />
              </div>
              <div className="flex justify-between">
                <span>Volunteers mobilized</span>
                <StatCounter value={1840} className="text-emerald-600" />
              </div>
              <div className="flex justify-between">
                <span>Flyers distributed</span>
                <StatCounter value={24500} className="text-amber-500" />
              </div>
            </div>
          </motion.div>

          <motion.div
            className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.45 }}
          >
            <h3 className="flex items-center gap-2 text-base font-semibold text-[#0F172A]" style={{ fontFamily: "var(--home-display)" }}>
              <motion.span
                animate={{ y: [0, -2, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                🔥
              </motion.span>
              Trending Campaigns
            </h3>
            <div className="mt-4 space-y-3 text-sm">
              {trendingCampaigns.map((c) => (
                <Link
                  key={c.id}
                  href={`/home/campaign/${c.id}`}
                  className="block rounded-xl border-l-2 border-yellow-400 bg-[#FFFEF5] p-3 pl-4 transition hover:bg-gray-50"
                >
                  <p className="font-semibold text-slate-800 line-clamp-1">{c.title}</p>
                  <p className="text-xs text-slate-500">{c.location ?? "Location TBD"}</p>
                  <p className="text-xs font-medium text-emerald-600">
                    {(c.max_volunteers ?? 10) - (c.signup_count ?? 0)} spots left
                  </p>
                </Link>
              ))}
            </div>
          </motion.div>

          <motion.div
            className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6 }}
          >
            <h3 className="text-base font-semibold text-[#0F172A]" style={{ fontFamily: "var(--home-display)" }}>Quick Links</h3>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <a
                href="https://www.foodhelpline.org/share"
                className="block rounded-xl bg-gray-50 px-4 py-3 transition hover:text-[#1B4332]"
              >
                📄 Download Flyers
              </a>
              <button className="block w-full rounded-xl bg-gray-50 px-4 py-3 text-left transition hover:text-[#1B4332]">
                📖 Volunteer Guide
              </button>
              <button className="block w-full rounded-xl bg-gray-50 px-4 py-3 text-left transition hover:text-[#1B4332]">
                💬 Contact Lemontree
              </button>
            </div>
          </motion.div>
        </aside>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-20 flex items-center justify-around border-t border-gray-200 bg-white py-2 md:hidden">
        {mobileNavItems.map((item) => {
          const isActive = item.label === "Feed";
          return (
            <Link key={item.label} href={item.href} className="flex flex-col items-center gap-1">
              <span className={`text-xl ${isActive ? "text-[#1B4332]" : "text-[#9CA3AF]"}`}>
                {item.icon}
              </span>
              <span
                className={`h-1 w-1 rounded-full ${
                  isActive ? "bg-[#F5C542]" : "bg-transparent"
                }`}
              />
            </Link>
          );
        })}
      </nav>

      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            className="fixed inset-0 z-30 flex items-center justify-center bg-black/20 px-4 backdrop-blur"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeModal}
          >
            <motion.div
              className="w-full max-w-lg rounded-3xl bg-white p-8 shadow-2xl"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 240, damping: 24 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold text-[#0F172A]" style={{ fontFamily: "var(--home-display)" }}>
                  Create a Post
                </h3>
                <motion.button
                  type="button"
                  onClick={closeModal}
                  whileHover={{ rotate: 90 }}
                  className="text-sm text-slate-400 hover:text-slate-600"
                >
                  ✕
                </motion.button>
              </div>

              <div className="relative mt-6 flex rounded-full border border-gray-200 p-1 text-sm">
                <motion.div
                  layoutId="postTypeTab"
                  className={`absolute top-1 bottom-1 rounded-full ${
                    formState.type === "upcoming_event"
                      ? "left-1 w-[calc(50%-4px)] bg-gradient-to-r from-yellow-400 to-amber-500"
                      : "left-[50%] w-[calc(50%-4px)] bg-gradient-to-r from-emerald-500 to-emerald-600"
                  }`}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
                <button
                  type="button"
                  onClick={() => setFormState((prev) => ({ ...prev, type: "upcoming_event" }))}
                  className="relative z-10 flex-1 rounded-full py-2.5 font-semibold"
                  style={{ color: formState.type === "upcoming_event" ? "white" : "#64748b" }}
                >
                  📍 Upcoming Event
                </button>
                <button
                  type="button"
                  onClick={() => setFormState((prev) => ({ ...prev, type: "event_summary" }))}
                  className="relative z-10 flex-1 rounded-full py-2.5 font-semibold"
                  style={{ color: formState.type === "event_summary" ? "white" : "#64748b" }}
                >
                  📝 Event Summary
                </button>
              </div>

              <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
                <FloatingTextArea
                  label={
                    formState.type === "upcoming_event"
                      ? "Tell volunteers about your campaign..."
                      : "How did the event go? Share your experience..."
                  }
                  value={formState.content}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, content: event.target.value }))
                  }
                  rows={formState.type === "upcoming_event" ? 4 : 6}
                />
                {formState.type === "event_summary" && (
                  <p className="text-xs text-slate-400">🤖 AI summary coming soon</p>
                )}

                {formState.type === "upcoming_event" ? (
                  <div className="space-y-2">
                    <FloatingInput
                      label="Location"
                      value={formState.location}
                      onChange={(event) =>
                        setFormState((prev) => ({ ...prev, location: event.target.value }))
                      }
                      placeholder="📍 Where?"
                    />
                    <div className="grid gap-6 sm:grid-cols-[1.4fr_1fr_1fr]">
                      <FloatingInput
                        label="Date"
                        type="date"
                        value={formState.date}
                        onChange={(event) =>
                          setFormState((prev) => ({ ...prev, date: event.target.value }))
                        }
                      />
                      <FloatingInput
                        label="Start"
                        type="time"
                        value={formState.startTime}
                        onChange={(event) =>
                          setFormState((prev) => ({ ...prev, startTime: event.target.value }))
                        }
                      />
                      <FloatingInput
                        label="End"
                        type="time"
                        value={formState.endTime}
                        onChange={(event) =>
                          setFormState((prev) => ({ ...prev, endTime: event.target.value }))
                        }
                      />
                    </div>
                    <FloatingInput
                      label="Volunteer spots"
                      type="number"
                      value={formState.spots}
                      onChange={(event) =>
                        setFormState((prev) => ({ ...prev, spots: event.target.value }))
                      }
                      placeholder="How many volunteers do you need?"
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <FloatingInput
                      label="Flyers"
                      type="number"
                      value={formState.flyers}
                      onChange={(event) =>
                        setFormState((prev) => ({ ...prev, flyers: event.target.value }))
                      }
                      placeholder="Approximately how many flyers?"
                    />
                    <FloatingInput
                      label="Blocks"
                      type="number"
                      value={formState.blocks}
                      onChange={(event) =>
                        setFormState((prev) => ({ ...prev, blocks: event.target.value }))
                      }
                      placeholder="How many blocks/streets?"
                    />
                  </div>
                )}

                <motion.button
                  type="submit"
                  whileTap={{ scale: 0.97 }}
                  className="w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-200"
                >
                  Post to Feed →
                </motion.button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="fixed bottom-6 right-5 z-40">
        <motion.button
          type="button"
          onClick={toggleChatPopup}
          className="flex h-20 w-20 items-center justify-center rounded-full border border-yellow-200 bg-white shadow-xl shadow-yellow-200/70"
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.96 }}
          aria-label="Open chatbot"
        >
          <Image src="/logo.svg" alt="Chatbot" width={50} height={50} />
        </motion.button>
      </div>

      <AnimatePresence>
        {isChatOpen && (
          <motion.section
            className="fixed bottom-28 right-5 z-50 w-[calc(100vw-2rem)] max-w-md overflow-hidden rounded-3xl border border-yellow-100 bg-white shadow-2xl"
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex items-center justify-between border-b border-yellow-100 bg-[#FFFEF5] px-5 py-4">
              <div className="flex items-center gap-3">
                <Image src="/logo.svg" alt="Lemontree Bot" width={28} height={28} />
                <div>
                  <p className="text-base font-semibold text-[#065F46]">Lemontree Chatbot</p>
                  <p className="text-sm text-slate-500">Campaign assistant</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void startNewChatSession()}
                  disabled={chatBooting || chatLoading}
                  className="rounded-full border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  New session
                </button>
                <button
                  type="button"
                  onClick={closeChatPopup}
                  className="text-base text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="h-80 space-y-3 overflow-y-auto px-5 py-4">
              {chatBooting && (
                <p className="rounded-2xl bg-yellow-50 px-4 py-3 text-sm text-slate-500">
                  Connecting to chatbot...
                </p>
              )}

              {!chatBooting && chatMessages.length === 0 && (
                <p className="rounded-2xl bg-yellow-50 px-4 py-3 text-sm text-slate-500">
                  Ask about pantry locations, volunteer planning, or campaign ideas.
                </p>
              )}

              {chatMessages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`max-w-[90%] rounded-2xl px-4 py-3 text-base ${
                    message.role === "user"
                      ? "ml-auto bg-emerald-600 text-white"
                      : "bg-[#FFFEF5] text-slate-700"
                  }`}
                >
                  {message.content}
                </div>
              ))}

              {chatLoading && (
                <p className="w-fit rounded-2xl bg-[#FFFEF5] px-4 py-3 text-sm text-slate-500">
                  Bot is typing...
                </p>
              )}
              <div ref={chatMessagesEndRef} />
            </div>

            <form onSubmit={sendChatMessage} className="border-t border-yellow-100 px-4 py-4">
              {chatError && <p className="mb-3 text-sm text-rose-500">{chatError}</p>}
              <div className="flex items-center gap-3">
                <input
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  placeholder="Type your message..."
                  className="flex-1 rounded-full border border-yellow-100 px-4 py-3 text-base text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
                <button
                  type="submit"
                  disabled={chatLoading || chatBooting || chatInput.trim().length === 0}
                  className="rounded-full bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Send
                </button>
              </div>
            </form>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

type StatCounterProps = {
  value: number;
  className?: string;
};

function StatCounter({ value, className }: StatCounterProps) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const inView = useInView(ref, { once: true, margin: "-20%" });
  const motionValue = useMotionValue(0);
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    if (!inView) return;
    const controls = animate(motionValue, value, {
      duration: 1.5,
      ease: "easeOut",
      onUpdate: (latest) => {
        setDisplay(Math.round(latest).toLocaleString());
      },
    });

    return () => controls.stop();
  }, [inView, motionValue, value]);

  return (
    <span ref={ref} className={`font-bold ${className ?? ""}`}>
      {display}
    </span>
  );
}

type FloatingInputProps = {
  label: string;
  type?: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
};

function FloatingInput({ label, type = "text", value, onChange, placeholder }: FloatingInputProps) {
  const [focused, setFocused] = useState(false);
  const isActive = focused || value.length > 0;
  const isDateTime = type === "date" || type === "time";

  return (
    <div className="relative mt-6">
      <input
        type={type}
        value={value}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder=""
        className={`w-full border-b-2 border-gray-200 bg-transparent pb-2 pt-6 text-sm outline-none transition-colors focus:border-transparent ${
          isDateTime ? "[color-scheme:light]" : ""
        } ${isActive ? "text-slate-900" : "text-slate-400"}`}
      />
      <motion.div
        className="absolute bottom-0 left-1/2 h-[2px] bg-emerald-500"
        initial={false}
        animate={{
          width: focused ? "100%" : "0%",
          x: focused ? "-50%" : "0%",
        }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        style={{ translateX: "-50%" }}
      />
      <motion.label
        className="absolute left-0 pointer-events-none origin-left"
        animate={{
          y: isActive ? -24 : isDateTime ? 6 : 14,
          scale: isActive ? 0.85 : 1,
          color: isActive ? "#065F46" : "#9CA3AF",
        }}
        transition={{ duration: 0.2 }}
      >
        {label}
      </motion.label>
    </div>
  );
}

type FloatingTextAreaProps = {
  label: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  rows?: number;
};

function FloatingTextArea({ label, value, onChange, rows = 4 }: FloatingTextAreaProps) {
  const [focused, setFocused] = useState(false);
  const isActive = focused || value.length > 0;

  return (
    <div className="relative mt-6">
      <textarea
        value={value}
        onChange={onChange}
        rows={rows}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="w-full resize-none border-b-2 border-gray-200 bg-transparent pb-2 pt-6 text-sm text-gray-900 outline-none transition-colors focus:border-transparent"
      />
      <motion.div
        className="absolute bottom-0 left-1/2 h-[2px] bg-emerald-500"
        initial={false}
        animate={{
          width: focused ? "100%" : "0%",
          x: focused ? "-50%" : "0%",
        }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        style={{ translateX: "-50%" }}
      />
      <motion.label
        className="absolute left-0 pointer-events-none origin-left"
        animate={{
          y: isActive ? -24 : 14,
          scale: isActive ? 0.85 : 1,
          color: isActive ? "#065F46" : "#9CA3AF",
        }}
        transition={{ duration: 0.2 }}
      >
        {label}
      </motion.label>
    </div>
  );
}
