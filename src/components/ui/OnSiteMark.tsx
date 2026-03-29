/**
 * Vector mark for sidebar / small branding (replaces invalid 70B fabicon.png).
 */
export function OnSiteMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect width="32" height="32" rx="8" fill="#2D3FD8" />
      <circle cx="16" cy="16" r="6" stroke="#FFFFFF" strokeWidth="2.25" fill="none" />
      <path
        d="M16 12v8M12 16h8"
        stroke="#FFFFFF"
        strokeWidth="2.25"
        strokeLinecap="round"
      />
    </svg>
  );
}
