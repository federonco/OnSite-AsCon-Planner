import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950 text-white">
      <h1 className="text-4xl font-bold mb-4">OnSite</h1>
      <p className="text-gray-400 mb-8">
        DN1600 MSCL Aqueduct — Construction Management
      </p>
      <div className="flex gap-4">
        <Link
          href="/tracker"
          className="rounded-lg bg-blue-600 px-6 py-3 text-white font-medium hover:bg-blue-700 transition-colors"
        >
          Open Tracker
        </Link>
        <Link
          href="/planner"
          className="rounded-lg bg-green-600 px-6 py-3 text-white font-medium hover:bg-green-700 transition-colors"
        >
          Open Planner
        </Link>
      </div>
    </div>
  );
}
