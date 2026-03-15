type LemonLogoProps = {
  size?: number;
  className?: string;
};

/** Clean SVG lemon mark used across the app instead of the 🍋 emoji */
export default function LemonLogo({ size = 28, className = "" }: LemonLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Body */}
      <ellipse cx="16" cy="16" rx="11" ry="13" fill="#FCD34D" />
      {/* Highlight */}
      <ellipse cx="13" cy="12" rx="4" ry="5" fill="#FDE68A" opacity="0.6" />
      {/* Tip left */}
      <path d="M5 14 Q2 10 4 7 Q6 9 5 14Z" fill="#86EFAC" />
      {/* Tip right */}
      <path d="M27 14 Q30 10 28 7 Q26 9 27 14Z" fill="#86EFAC" />
      {/* Leaf */}
      <path d="M16 3 Q20 1 22 5 Q18 6 16 3Z" fill="#4ADE80" />
    </svg>
  );
}
