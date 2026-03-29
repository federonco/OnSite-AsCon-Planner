import Link from "next/link";
import { SiteFooter } from "@/components/ui/SiteFooter";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-gray-950 text-white">
      <div className="flex flex-1 flex-col items-center justify-center px-4">
        <h1 className="mb-4 text-4xl font-bold">OnSite</h1>
        <p className="mb-8 text-gray-400">DN1600 MSCL Aqueduct — Construction Management</p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link
            href="/tracker"
            className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700"
          >
            Open Tracker
          </Link>
          <Link
            href="/planner"
            className="rounded-lg bg-green-600 px-6 py-3 font-medium text-white transition-colors hover:bg-green-700"
          >
            Open Planner
          </Link>
        </div>
      </div>
      <SiteFooter variant="dark" />
    </div>
  );
}
