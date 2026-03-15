"use client";

const stats = [
  "85% increase in turnout",
  "200+ active volunteers",
  "11 cities running campaigns",
  "900k families reached",
  "24,500 flyers distributed",
];

export default function StatsTicker() {
  return (
    <section className="bg-[#FEF9C3] py-4">
      <div className="border-y border-[#FCD34D]/40">
        <div className="overflow-hidden">
          <div className="flex w-[200%] items-center gap-8 px-4 py-3 animate-[ticker_30s_linear_infinite] hover:[animation-play-state:paused]">
            {[...stats, ...stats].map((item, index) => (
              <div key={`${item}-${index}`} className="flex items-center gap-3 whitespace-nowrap">
                <span className="text-sm font-semibold text-[#F97316]">{item.split(" ")[0]}</span>
                <span className="text-sm text-[#1B4332]">{item.replace(item.split(" ")[0], "")}</span>
                <span className="text-[#F97316]">•</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
