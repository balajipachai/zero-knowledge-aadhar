import { redirect } from "next/navigation";
import Link from "next/link";
import { requireVolunteer, UnauthorizedError } from "@/src/server/auth/session";
import { getCycleSummary, listApplications } from "@/src/server/volunteer/queries";
import { LogoutButton } from "../LogoutButton";

export const dynamic = "force-dynamic";

export default async function VolunteerDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  try {
    await requireVolunteer();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      redirect("/volunteer/login");
    }
    throw err;
  }

  const { status } = await searchParams;
  const [summary, applications] = await Promise.all([
    getCycleSummary(),
    listApplications({ reviewStatus: status }),
  ]);

  return (
    <main className="flex-1 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Cycle dashboard</h1>
          <LogoutButton />
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Verified entries" value={summary.verified} />
          <StatCard label="Duplicates turned away" value={summary.duplicates} />
          <StatCard label="Awaiting review" value={summary.awaitingReview} />
          <StatCard label="Shortlisted" value={summary.shortlisted} />
          <StatCard
            label="Awarded"
            value={`${summary.awarded} / ${summary.awarded + summary.slotsRemaining}`}
          />
          <StatCard label="Slots remaining" value={summary.slotsRemaining} />
          <StatCard label="Anchor pending" value={summary.anchorPending} />
        </div>

        {summary.otherRejections.length > 0 && (
          <div>
            <h2 className="mb-2 text-sm font-semibold">Other rejections</h2>
            <ul className="flex flex-wrap gap-2 text-xs">
              {summary.otherRejections.map((r) => (
                <li
                  key={r.reason}
                  className="rounded-full border border-slate-300 px-3 py-1 dark:border-slate-600"
                >
                  {r.reason}: {r.count}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            <FilterLink label="All" active={!status} href="/volunteer/dashboard" />
            <FilterLink
              label="Awaiting review"
              active={status === "awaiting_review"}
              href="/volunteer/dashboard?status=awaiting_review"
            />
            <FilterLink
              label="Shortlisted"
              active={status === "shortlisted"}
              href="/volunteer/dashboard?status=shortlisted"
            />
            <FilterLink
              label="Awarded"
              active={status === "awarded"}
              href="/volunteer/dashboard?status=awarded"
            />
            <FilterLink
              label="Rejected"
              active={status === "rejected"}
              href="/volunteer/dashboard?status=rejected"
            />
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-100 dark:bg-slate-800">
                <tr>
                  <th className="px-3 py-2">Applicant</th>
                  <th className="px-3 py-2">College</th>
                  <th className="px-3 py-2">District</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Anchor</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((app) => (
                  <tr key={app.id} className="border-t border-slate-200 dark:border-slate-700">
                    <td className="px-3 py-2">
                      <Link href={`/volunteer/${app.id}`} className="underline">
                        {app.preferredName}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{app.college}</td>
                    <td className="px-3 py-2">{app.district}</td>
                    <td className="px-3 py-2">{app.reviewStatus}</td>
                    <td className="px-3 py-2">{app.anchorStatus}</td>
                  </tr>
                ))}
                {applications.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                      No applications match this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}

function FilterLink({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 ${
        active
          ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
          : "border-slate-300 dark:border-slate-600"
      }`}
    >
      {label}
    </Link>
  );
}
