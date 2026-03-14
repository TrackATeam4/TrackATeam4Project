import Image from "next/image";
import Link from "next/link";

const highlightCards = [
  { title: "85%", subtitle: "Increase in turnout", tone: "bg-emerald-200" },
  { title: "200+", subtitle: "Active volunteers", tone: "bg-orange-200" },
  { title: "11", subtitle: "Cities running campaigns", tone: "bg-sky-200" },
  { title: "900k", subtitle: "Families reached", tone: "bg-lime-200" },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#F3F0EA] px-4 pb-8 text-slate-900 sm:px-8 lg:px-12">
      <header className="-mx-4 sm:-mx-8 lg:-mx-12">
        <div className="flex min-h-[74px] items-stretch border-b border-black/10 bg-transparent text-black">
          <div className="flex flex-1 items-center justify-between px-6 sm:px-10 lg:px-14">
            <div className="flex items-center gap-3">
              <Image src="/logo.svg" alt="Lemontree" width={40} height={40} className="h-10 w-10" />
              <span className="text-3xl font-extrabold tracking-[0.08em]">LEMONTREE</span>
            </div>

            <nav className="hidden items-center gap-10 text-xl md:flex">
              <Link href="/landing" className="font-semibold text-black">Home</Link>
              <a href="#" className="transition hover:text-slate-700">Who We Are</a>
              <Link href="/auth?mode=signup" className="transition hover:text-slate-700">Support Us</Link>
              <a href="#" className="transition hover:text-slate-700">Events</a>
              <a href="#" className="transition hover:text-slate-700">News</a>
              <Link href="/auth?mode=signin" className="transition hover:text-slate-700">Contact</Link>
            </nav>
          </div>

          <Link
            href="/auth?mode=signup"
            className="flex w-[210px] items-center justify-center text-3xl font-black tracking-[0.12em] text-[#0E2A3B] transition hover:bg-[#d9b83a]"
          >
            REGISTER
          </Link>
        </div>
      </header>

      <div className="mx-auto mt-8 max-w-6xl">

        <section className="mt-8 rounded-3xl bg-white p-5 shadow-sm sm:p-8">
          <p className="text-center text-4xl font-semibold tracking-[0.2em] text-slate-800 sm:text-5xl">
            WEB MOSAIC LAYOUT
          </p>

          <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-12">
            <article className="rounded-3xl bg-[#F8FAFC] p-6 lg:col-span-7">
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-emerald-700">
                Community campaigns
              </p>
              <h1 className="mt-4 text-3xl font-bold leading-tight sm:text-5xl">
                Give neighborhoods the visibility they need.
              </h1>
              <p className="mt-4 max-w-xl text-slate-600">
                Plan flyer drops, organize volunteers, and track outreach with a visual board designed for fast local action.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/auth?mode=signup"
                  className="rounded-full bg-emerald-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800"
                >
                  Start free
                </Link>
                <Link
                  href="/auth?mode=signin"
                  className="rounded-full border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  I already have an account
                </Link>
              </div>
            </article>

            <article className="overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-900 to-emerald-700 p-6 text-white lg:col-span-5">
              <p className="text-sm uppercase tracking-[0.16em] text-emerald-100">Live board</p>
              <p className="mt-3 text-3xl font-bold">One city. One team. One mission.</p>
              <p className="mt-3 text-emerald-100">
                Coordinate volunteers in real time and keep everyone aligned from planning to execution.
              </p>
            </article>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:col-span-12">
              {highlightCards.map((card) => (
                <article key={card.title} className={`rounded-2xl p-5 ${card.tone}`}>
                  <p className="text-3xl font-bold text-slate-900">{card.title}</p>
                  <p className="mt-1 text-sm text-slate-700">{card.subtitle}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="mt-8 flex items-center justify-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
            <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          </div>
        </section>
      </div>
    </main>
  );
}