'use client'

interface AddToCalendarButtonProps {
  url: string
  className?: string
}

export function AddToCalendarButton({ url, className = '' }: AddToCalendarButtonProps) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 rounded-lg bg-[#F5C542] px-4 py-2 text-sm font-medium text-[#1A1A1A] hover:bg-[#E5B53A] transition-colors ${className}`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
      Add to Google Calendar
    </a>
  )
}
