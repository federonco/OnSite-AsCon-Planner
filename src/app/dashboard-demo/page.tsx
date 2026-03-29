import { redirect } from "next/navigation";

/** Legacy URL — planner uses the dashboard design system */
export default function DashboardDemoRedirectPage() {
  redirect("/planner");
}
