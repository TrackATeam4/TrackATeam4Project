"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

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

const mockPosts: Post[] = [
  {
    id: "1",
    author: { name: "Sarah Chen", avatar: null, role: "organizer" },
    type: "upcoming_event",
    content:
      "Hey everyone! I'm organizing a flyering campaign near Jefferson Elementary this Saturday. We'll be covering the blocks around the school and nearby park. Looking for 5 more volunteers to help hand out flyers — it's a high-need area with several pantries nearby. Let's spread the word! 🍋",
    event: {
      location: "Jefferson Elementary, Sunset Park, Brooklyn",
      date: "Saturday, March 21, 2026",
      time: "10:00 AM – 1:00 PM",
      spotsTotal: 8,
      spotsFilled: 3,
    },
    likes: 12,
    comments: 4,
    createdAt: "2 hours ago",
  },
  {
    id: "2",
    author: { name: "Marcus Rivera", avatar: null, role: "volunteer" },
    type: "event_summary",
    content:
      "Just wrapped up an amazing flyering session in Washington Heights! Our team of 6 covered 14 blocks and handed out about 120 flyers. Had some great conversations with parents near the community center — many didn't know about the 3 food pantries within walking distance. One mom was almost in tears. This is why we do it. 💛",
    event: null,
    likes: 28,
    comments: 7,
    createdAt: "5 hours ago",
  },
  {
    id: "3",
    author: { name: "Priya Patel", avatar: null, role: "organizer" },
    type: "upcoming_event",
    content:
      "Planning a flyering blitz in the East Village next weekend! We'll focus on the area around Tompkins Square Park where there's a cluster of soup kitchens. Need volunteers who can commit to the full morning. Flyer materials will be ready for pickup the day before.",
    event: {
      location: "Tompkins Square Park, East Village, Manhattan",
      date: "Sunday, March 22, 2026",
      time: "9:00 AM – 12:00 PM",
      spotsTotal: 10,
      spotsFilled: 7,
    },
    likes: 19,
    comments: 11,
    createdAt: "1 day ago",
  },
  {
    id: "4",
    author: { name: "James Okonkwo", avatar: null, role: "volunteer" },
    type: "event_summary",
    content:
      "Completed our Bushwick flyering campaign! 4 volunteers, 80 flyers distributed, 9 blocks covered near the Myrtle-Broadway area. Noticed a lot of new families in the neighborhood who hadn't heard of Lemontree before. The QR codes on the flyers are a game-changer — saw a few people scanning right away.",
    event: null,
    likes: 15,
    comments: 3,
    createdAt: "2 days ago",
  },
  {
    id: "5",
    author: { name: "Emily Tran", avatar: null, role: "organizer" },
    type: "upcoming_event",
    content:
      "Who's ready to help out in Astoria? I'm setting up a campaign near the Steinway Street corridor. There are 5 pantries in the area but barely any awareness. First-timers welcome — I'll walk you through everything!",
    event: {
      location: "Steinway St & 30th Ave, Astoria, Queens",
      date: "Saturday, March 28, 2026",
      time: "11:00 AM – 2:00 PM",
      spotsTotal: 6,
      spotsFilled: 1,
    },
    likes: 8,
    comments: 2,
    createdAt: "3 days ago",
  },
];

const navItems = [
  { label: "Feed", icon: "🏠", href: "/home" },
  { label: "Discover", icon: "🗺️", href: "/discover" },
  { label: "Create Campaign", icon: "➕", href: "/create" },
  { label: "Leaderboard", icon: "📊", href: "/leaderboard" },
  { label: "My Profile", icon: "👤", href: "/profile" },
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
  const [posts, setPosts] = useState<Post[]>(mockPosts);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formState, setFormState] = useState<PostFormState>(initialForm);
  const userName = useSyncExternalStore(
    subscribeToStorage,
    () => getLocalStorageValue("tracka.signup_name", "Volunteer"),
    () => "Volunteer"
  );

  useEffect(() => {
    const token = localStorage.getItem("tracka.access_token");
    if (!token) {
      router.push("/auth");
      return;
    }

  }, [router]);

  const trendingCampaigns = useMemo(
    () =>
      posts
        .filter((post) => post.type === "upcoming_event" && post.event)
        .sort((a, b) => b.likes - a.likes)
        .slice(0, 3),
    [posts]
  );

  const toggleLike = (postId: string) => {
    setPosts((prev) =>
      prev.map((post) => {
        if (post.id !== postId) return post;
        const isLiked = likedPosts.has(postId);
        return {
          ...post,
          likes: isLiked ? post.likes - 1 : post.likes + 1,
        };
      })
    );

    setLikedPosts((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });
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
    <div className="min-h-screen bg-[#FFFEF5] text-slate-700">
      <div className="flex">
        <motion.aside
          className="fixed left-0 top-0 hidden h-screen w-60 flex-col border-r border-yellow-100 bg-white px-5 py-8 lg:flex"
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xl font-bold text-[#065F46]">
              <span className="text-2xl">🍋</span>
              Lemontree
            </div>
            <p className="text-xs text-slate-400">Volunteer Hub</p>
          </div>

          <nav className="mt-10 flex flex-1 flex-col gap-2 text-sm">
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className={`flex items-center gap-3 rounded-2xl px-3 py-2 transition ${
                  item.label === "Feed"
                    ? "bg-emerald-100 text-emerald-700"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                <span>{item.label}</span>
              </a>
            ))}
          </nav>

          <div className="mt-6 space-y-3">
            <div className="flex items-center gap-3 rounded-2xl bg-[#FFFEF5] px-3 py-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
                {userName.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">{userName}</p>
                <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-[#065F46]">
                  Volunteer
                </span>
              </div>
            </div>
            <button className="text-xs text-slate-400 hover:text-slate-600">Logout</button>
          </div>
        </motion.aside>

        <aside className="fixed left-0 top-0 hidden h-screen w-20 flex-col border-r border-yellow-100 bg-white px-3 py-8 md:flex lg:hidden">
          <div className="flex flex-col items-center gap-4 text-xl">
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                  item.label === "Feed"
                    ? "bg-emerald-100 text-emerald-700"
                    : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                {item.icon}
              </a>
            ))}
          </div>
        </aside>

        <main className="flex-1 px-4 pb-24 pt-6 lg:ml-60 md:ml-20">
          <div className="mx-auto max-w-2xl space-y-6">
            <div className="rounded-2xl border border-yellow-100 bg-white p-5 shadow-lg shadow-yellow-100/70">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
                  {userName.charAt(0).toUpperCase()}
                </div>
                <button
                  type="button"
                  onClick={() => openModal()}
                  className="flex-1 rounded-full border border-yellow-100 bg-[#FFFEF5] px-4 py-3 text-left text-sm text-slate-400 hover:border-emerald-200"
                >
                  Share an upcoming event or campaign update...
                </button>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openModal("upcoming_event")}
                  className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-700"
                >
                  📍 Upcoming Event
                </button>
                <button
                  type="button"
                  onClick={() => openModal("event_summary")}
                  className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700"
                >
                  📝 Event Summary
                </button>
              </div>
            </div>

            <motion.div
              initial="hidden"
              animate="show"
              variants={{
                hidden: {},
                show: { transition: { staggerChildren: 0.08 } },
              }}
              className="space-y-6"
            >
              {posts.map((post) => {
                const isLiked = likedPosts.has(post.id);
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
                    className="rounded-2xl border border-yellow-100 bg-white p-5 shadow-lg shadow-yellow-100/60"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
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
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                          post.type === "upcoming_event"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {post.type === "upcoming_event" ? "📍 Upcoming Event" : "📝 Event Summary"}
                      </span>
                      <p className="mt-3 text-sm text-slate-600">{post.content}</p>
                    </div>

                    {post.event && (
                      <div className="mt-4 space-y-3 rounded-2xl border border-yellow-100 bg-[#FFFEF5] p-4">
                        <div className="text-sm text-slate-600">📍 {post.event.location}</div>
                        <div className="text-sm text-slate-600">
                          📅 {post.event.date} • {post.event.time}
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs text-slate-500">
                            <span>👥 {post.event.spotsFilled}/{post.event.spotsTotal} spots filled</span>
                            <span>{progress}%</span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-emerald-100">
                            <div
                              className="h-2 rounded-full bg-emerald-500"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                        <button className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white">
                          Join Campaign
                        </button>
                      </div>
                    )}

                    <div className="mt-4 flex items-center gap-4 text-xs text-slate-500">
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.9 }}
                        onClick={() => toggleLike(post.id)}
                        className="flex items-center gap-2"
                      >
                        <span className={isLiked ? "text-rose-500" : "text-slate-400"}>
                          {isLiked ? "❤️" : "🤍"}
                        </span>
                        {post.likes} likes
                      </motion.button>
                      <button type="button" className="flex items-center gap-2">
                        💬 {post.comments} comments
                      </button>
                      <button type="button" className="flex items-center gap-2">
                        🔗 Share
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          </div>
        </main>

        <aside className="fixed right-0 top-0 hidden h-screen w-[280px] flex-col gap-6 overflow-y-auto border-l border-yellow-100 bg-white px-6 py-8 xl:flex">
          <motion.div
            className="rounded-2xl border border-yellow-100 bg-[#FFFEF5] p-4 shadow-lg shadow-yellow-100/60"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <h3 className="text-sm font-semibold text-[#065F46]">🍋 Community Impact</h3>
            <div className="mt-3 space-y-2 text-sm text-slate-500">
              <div className="flex justify-between">
                <span>Campaigns completed</span>
                <span className="font-semibold text-emerald-600">142</span>
              </div>
              <div className="flex justify-between">
                <span>Volunteers mobilized</span>
                <span className="font-semibold text-emerald-600">1,840</span>
              </div>
              <div className="flex justify-between">
                <span>Flyers distributed</span>
                <span className="font-semibold text-emerald-600">24,500</span>
              </div>
            </div>
          </motion.div>

          <motion.div
            className="rounded-2xl border border-yellow-100 bg-white p-4 shadow-lg shadow-yellow-100/60"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <h3 className="text-sm font-semibold text-[#0F172A]">🔥 Trending Campaigns</h3>
            <div className="mt-4 space-y-3 text-sm">
              {trendingCampaigns.map((post) => (
                <div key={post.id} className="rounded-xl bg-[#FFFEF5] p-3">
                  <p className="font-semibold text-slate-700">{post.event?.location}</p>
                  <p className="text-xs text-slate-500">{post.event?.date}</p>
                  <p className="text-xs text-emerald-600">
                    {post.event
                      ? `${post.event.spotsTotal - post.event.spotsFilled} spots left`
                      : ""}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            className="rounded-2xl border border-yellow-100 bg-white p-4 shadow-lg shadow-yellow-100/60"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <h3 className="text-sm font-semibold text-[#0F172A]">Quick Links</h3>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <a
                href="https://www.foodhelpline.org/share"
                className="block rounded-xl bg-[#FFFEF5] px-3 py-2 hover:text-emerald-600"
              >
                📄 Download Flyers
              </a>
              <button className="block w-full rounded-xl bg-[#FFFEF5] px-3 py-2 text-left hover:text-emerald-600">
                📖 Volunteer Guide
              </button>
              <button className="block w-full rounded-xl bg-[#FFFEF5] px-3 py-2 text-left hover:text-emerald-600">
                💬 Contact Lemontree
              </button>
            </div>
          </motion.div>
        </aside>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-20 flex items-center justify-around border-t border-yellow-100 bg-white py-3 md:hidden">
        {navItems.map((item) => (
          <a
            key={item.label}
            href={item.href}
            className={`text-xl ${
              item.label === "Feed" ? "text-emerald-600" : "text-slate-400"
            }`}
          >
            {item.icon}
          </a>
        ))}
      </nav>

      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            className="fixed inset-0 z-30 flex items-center justify-center bg-black/20 px-4 backdrop-blur"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-[#0F172A]">Create a Post</h3>
                <button
                  type="button"
                  onClick={closeModal}
                  className="text-sm text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              </div>

              <div className="mt-5 flex rounded-full bg-yellow-50 p-1 text-sm">
                <button
                  type="button"
                  onClick={() => setFormState((prev) => ({ ...prev, type: "upcoming_event" }))}
                  className={`flex-1 rounded-full px-4 py-2 font-medium ${
                    formState.type === "upcoming_event"
                      ? "bg-white text-[#0F172A] shadow"
                      : "text-slate-500"
                  }`}
                >
                  📍 Upcoming Event
                </button>
                <button
                  type="button"
                  onClick={() => setFormState((prev) => ({ ...prev, type: "event_summary" }))}
                  className={`flex-1 rounded-full px-4 py-2 font-medium ${
                    formState.type === "event_summary"
                      ? "bg-white text-[#0F172A] shadow"
                      : "text-slate-500"
                  }`}
                >
                  📝 Event Summary
                </button>
              </div>

              <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
                <div>
                  <label className="text-xs font-medium text-slate-500">
                    {formState.type === "upcoming_event"
                      ? "Tell volunteers about your campaign..."
                      : "How did the event go? Share your experience..."}
                  </label>
                  <textarea
                    value={formState.content}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, content: event.target.value }))
                    }
                    rows={formState.type === "upcoming_event" ? 4 : 6}
                    className="mt-2 w-full rounded-2xl border border-yellow-100 px-4 py-3 text-sm text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                  />
                  {formState.type === "event_summary" && (
                    <p className="mt-2 text-xs text-slate-400">🤖 AI summary coming soon</p>
                  )}
                </div>

                {formState.type === "upcoming_event" ? (
                  <div className="space-y-3">
                    <input
                      value={formState.location}
                      onChange={(event) =>
                        setFormState((prev) => ({ ...prev, location: event.target.value }))
                      }
                      placeholder="📍 Where?"
                      className="w-full rounded-2xl border border-yellow-100 px-4 py-3 text-sm text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        type="date"
                        value={formState.date}
                        onChange={(event) =>
                          setFormState((prev) => ({ ...prev, date: event.target.value }))
                        }
                        className="w-full rounded-2xl border border-yellow-100 px-4 py-3 text-sm text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <input
                          type="time"
                          value={formState.startTime}
                          onChange={(event) =>
                            setFormState((prev) => ({ ...prev, startTime: event.target.value }))
                          }
                          className="w-full rounded-2xl border border-yellow-100 px-4 py-3 text-sm text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                        />
                        <input
                          type="time"
                          value={formState.endTime}
                          onChange={(event) =>
                            setFormState((prev) => ({ ...prev, endTime: event.target.value }))
                          }
                          className="w-full rounded-2xl border border-yellow-100 px-4 py-3 text-sm text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                        />
                      </div>
                    </div>
                    <input
                      type="number"
                      value={formState.spots}
                      onChange={(event) =>
                        setFormState((prev) => ({ ...prev, spots: event.target.value }))
                      }
                      placeholder="How many volunteers do you need?"
                      className="w-full rounded-2xl border border-yellow-100 px-4 py-3 text-sm text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                    />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <input
                      type="number"
                      value={formState.flyers}
                      onChange={(event) =>
                        setFormState((prev) => ({ ...prev, flyers: event.target.value }))
                      }
                      placeholder="Approximately how many flyers?"
                      className="w-full rounded-2xl border border-yellow-100 px-4 py-3 text-sm text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                    />
                    <input
                      type="number"
                      value={formState.blocks}
                      onChange={(event) =>
                        setFormState((prev) => ({ ...prev, blocks: event.target.value }))
                      }
                      placeholder="How many blocks/streets?"
                      className="w-full rounded-2xl border border-yellow-100 px-4 py-3 text-sm text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-200"
                >
                  Post to Feed →
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
