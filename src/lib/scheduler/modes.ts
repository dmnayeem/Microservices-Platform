import { getSetting, saveSetting } from "@/lib/system-settings";
import { SCHEDULED_JOBS, type JobMode } from "@/lib/scheduler/jobs";

/**
 * Auto / Manual per job, chosen by the owner on /admin/scheduler.
 *
 * One SystemSetting row holds the whole map (`{ "<job>": "auto" | "manual" }`).
 * A job missing from the map uses its registry `defaultMode` (auto unless the
 * job says otherwise), so adding a job never needs a data change.
 *
 * Manual only stops the SCHEDULE — site-traffic ticks and a secret-keyed call to
 * `/api/cron/<job>`. The admin's "Run now" always runs.
 */
export const JOB_MODES_KEY = "scheduler.job_modes";

function isMode(v: unknown): v is JobMode {
  return v === "auto" || v === "manual";
}

/** Every registered job's effective mode. Cached with the other settings. */
export async function getJobModes(): Promise<Record<string, JobMode>> {
  const stored = await getSetting<Record<string, unknown> | null>(
    JOB_MODES_KEY,
    null
  );
  const out: Record<string, JobMode> = {};
  for (const j of SCHEDULED_JOBS) {
    const v = stored && typeof stored === "object" ? stored[j.name] : undefined;
    out[j.name] = isMode(v) ? v : (j.defaultMode ?? "auto");
  }
  return out;
}

export async function getJobMode(name: string): Promise<JobMode> {
  return (await getJobModes())[name] ?? "auto";
}

/** Set one job's mode. Returns the mode it had before. */
export async function setJobMode(
  name: string,
  mode: JobMode
): Promise<JobMode> {
  const current = await getJobModes();
  const previous = current[name] ?? "auto";
  await saveSetting(JOB_MODES_KEY, { ...current, [name]: mode }, "scheduler");
  return previous;
}
