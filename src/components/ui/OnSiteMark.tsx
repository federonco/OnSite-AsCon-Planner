import Image from "next/image";
import { cn } from "@/lib/cn";

/**
 * Sidebar mark: `public/X.png` (URL `/X.png`). Next.js does not serve `src/lib/public/*`.
 */
export function OnSiteMark({ className }: { className?: string }) {
  return (
    <Image
      src="/X.png"
      alt=""
      width={32}
      height={32}
      className={cn("shrink-0 rounded-dashboard-md object-contain", className)}
      aria-hidden
      priority
    />
  );
}
