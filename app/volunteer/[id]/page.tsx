import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { requireVolunteer, UnauthorizedError } from "@/src/server/auth/session";
import { getApplicationDetail } from "@/src/server/volunteer/queries";
import { ReviewActions } from "../ReviewActions";

export const dynamic = "force-dynamic";

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    await requireVolunteer();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      redirect("/volunteer/login");
    }
    throw err;
  }

  const { id } = await params;
  const app = await getApplicationDetail(id);
  if (!app) notFound();

  return (
    <main className="flex-1 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <Link href="/volunteer/dashboard" className="text-sm underline">
          ← Back to dashboard
        </Link>

        <div>
          <h1 className="text-2xl font-bold">{app.preferredName}</h1>
          <p className="text-sm text-slate-500">
            {app.reviewStatus} · anchor: {app.anchorStatus}
          </p>
        </div>

        <dl className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 p-4 text-sm sm:grid-cols-2 dark:border-slate-700">
          <Detail label="Contact email" value={app.contactEmail} />
          <Detail label="College" value={app.college} />
          <Detail label="Course & year" value={app.courseYear} />
          <Detail label="District" value={app.district} />
          <Detail label="First-generation" value={app.firstGen ? "Yes" : "No"} />
          <Detail label="Tx hash" value={app.txHash ?? "—"} />
        </dl>

        <div>
          <h2 className="mb-1 text-sm font-semibold">Statement</h2>
          <p className="rounded-lg border border-slate-200 p-4 text-sm dark:border-slate-700">
            {app.statement}
          </p>
        </div>

        <ReviewActions applicationId={app.id} />

        <div>
          <h2 className="mb-2 text-sm font-semibold">Audit log</h2>
          <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
            {app.events.map((e, i) => (
              <li key={i} className="rounded-md border border-slate-200 p-2 dark:border-slate-700">
                <span className="font-medium">{e.action}</span> by {e.volunteerEmail} at{" "}
                {new Date(e.createdAt).toLocaleString()}
                {e.note && <div className="mt-1 italic">&quot;{e.note}&quot;</div>}
              </li>
            ))}
            {app.events.length === 0 && <li>No actions recorded yet.</li>}
          </ul>
        </div>
      </div>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
