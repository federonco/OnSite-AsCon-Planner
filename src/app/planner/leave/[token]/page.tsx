import LeavePublicForm from "./LeavePublicForm";

export default function PlannerLeavePublicPage({ params }: { params: { token: string } }) {
  const token = decodeURIComponent(params.token);
  return (
    <main className="min-h-dvh bg-neutral-50 px-4 py-16 dark:bg-neutral-950">
      <LeavePublicForm token={token} />
    </main>
  );
}
