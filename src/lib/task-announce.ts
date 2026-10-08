import { prisma } from "@/lib/prisma";
import { createBroadcast, deliverBroadcast, type BroadcastChannels } from "@/lib/broadcast";
import type { AudienceCriteria } from "@/lib/audience";

/**
 * "Tell users about this task" — the channels the admin ticks on the task form
 * (in-app notification / push / email). Nothing ticked = nothing is sent.
 *
 * Sent through the ordinary broadcast pipeline (lib/broadcast.ts), so it is
 * durable, resumable, rate-limited and obeys the email switches like every
 * other broadcast. Goes to the task's own audience only: its country / area /
 * gender / age targeting, minimum level and minimum plan.
 *
 * Once per task (`Task.announcedAt`, claimed with a CAS) and only once the task
 * is live: a draft or hidden task announces on the save that makes it live.
 * A task with a future start date is announced at that time.
 */

export function parseTaskNotify(v: unknown): BroadcastChannels | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const c = { inApp: o.inApp === true, push: o.push === true, email: o.email === true };
  return c.inApp || c.push || c.email ? c : null;
}

type AnnounceTask = {
  id: string;
  title: string;
  description: string;
  pointsReward: number;
  status: string;
  hidden: boolean;
  startsAt: Date | null;
  expiresAt: Date | null;
  minLevel: number;
  requiredAccessLevel: number;
  countries: string[];
  regions: string[];
  divisions: string[];
  districts: string[];
  subDistricts: string[];
  postalCodes: string[];
  genders: string[];
  minAge: number | null;
  maxAge: number | null;
};

async function criteriaFor(task: AnnounceTask): Promise<AudienceCriteria> {
  const c: AudienceCriteria = {};
  if (task.countries.length) c.countries = task.countries;
  if (task.regions.length) c.regions = task.regions;
  if (task.divisions.length) c.divisions = task.divisions;
  if (task.districts.length) c.districts = task.districts;
  if (task.subDistricts.length) c.subDistricts = task.subDistricts;
  if (task.postalCodes.length) c.postalCodes = task.postalCodes;
  if (task.genders.length) c.genders = task.genders;
  if (task.minAge != null) c.minAge = task.minAge;
  if (task.maxAge != null) c.maxAge = task.maxAge;
  if (task.minLevel > 1) c.minLevel = task.minLevel;
  if (task.requiredAccessLevel > 0) {
    const pkgs = await prisma.package.findMany({
      where: { accessLevel: { gte: task.requiredAccessLevel } },
      select: { slug: true },
    });
    // No plan reaches that level: nobody can do the task, so nobody is told.
    c.packages = pkgs.length ? pkgs.map((p) => p.slug) : ["__none__"];
  }
  return c;
}

const plain = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

/** Returns the broadcast id when one was created. Never throws. */
export async function announceTask(
  task: AnnounceTask,
  channels: BroadcastChannels | null,
  actorId: string
): Promise<string | null> {
  try {
    if (!channels) return null;
    if (task.status !== "ACTIVE" || task.hidden) return null;
    if (task.expiresAt && task.expiresAt.getTime() <= Date.now()) return null;

    const claimed = await prisma.task.updateMany({
      where: { id: task.id, announcedAt: null },
      data: { announcedAt: new Date() },
    });
    if (claimed.count !== 1) return null;

    const criteria = await criteriaFor(task);
    const hasCriteria = Object.keys(criteria).length > 0;
    const blurb = plain(task.description).slice(0, 140);
    const reward = `Earn ${task.pointsReward.toLocaleString()} points`;

    const b = await createBroadcast({
      createdById: actorId,
      title: `New task: ${task.title}`.slice(0, 120),
      message: blurb ? `${reward} — ${blurb}` : `${reward}. Open it now.`,
      type: "TASK",
      emailSubject: `New task: ${task.title}`.slice(0, 150),
      actionUrl: `/tasks/${task.id}`,
      actionLabel: "Open task",
      channels,
      targetKind: hasCriteria ? "SEGMENT" : "ALL",
      criteria: hasCriteria ? criteria : null,
      scheduledFor: task.startsAt,
    });

    if (b.status !== "SCHEDULED") {
      // First slice now; the scheduler carries the rest.
      await deliverBroadcast(b.id, { maxMs: 8_000 }).catch(() => {});
    }
    return b.id;
  } catch (e) {
    console.error("[task-announce] failed:", e);
    return null;
  }
}
