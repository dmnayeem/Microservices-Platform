import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Who a fraud event / abuse case is about — one definition for the Fraud
 * Monitor and the Abuse Center.
 *
 * Sign-up checks (lib/device.ts) run BEFORE the account exists, so those
 * signals carry no userId — only the email that was tried and the device.
 * Both pages showed "—" for every one of them, leaving the admin with no one
 * to act on. Resolved here as: the account by id, else the account that email
 * became (a flagged sign-up still goes through), and in every case the
 * accounts already on that device — for a BLOCKED sign-up those are the
 * people behind it.
 */
export type SubjectPerson = { id: string; name: string | null; email: string; status: string };
export type Subject = { userId?: string | null; email?: string | null; deviceId?: string | null };
export type ResolvedSubject = { account: SubjectPerson | null; onDevice: SubjectPerson[]; email: string | null };

const SELECT = { id: true, name: true, email: true, status: true } as const;

export async function resolveSubjects(subjects: Subject[]) {
  const ids = new Set(subjects.map((s) => s.userId).filter((v): v is string => !!v));
  const emails = new Set(
    subjects.filter((s) => !s.userId && s.email).map((s) => s.email!.toLowerCase())
  );
  const devices = new Set(subjects.map((s) => s.deviceId).filter((v): v is string => !!v));

  const [byId, byEmail, onDevices] = await Promise.all([
    ids.size ? prisma.user.findMany({ where: { id: { in: [...ids] } }, select: SELECT }) : [],
    emails.size ? prisma.user.findMany({ where: { email: { in: [...emails] } }, select: SELECT }) : [],
    devices.size
      ? prisma.userDevice.findMany({
          where: { deviceId: { in: [...devices] } },
          select: { deviceId: true, user: { select: SELECT } },
        })
      : [],
  ]);

  const idMap = new Map((byId as SubjectPerson[]).map((u) => [u.id, u]));
  const emailMap = new Map((byEmail as SubjectPerson[]).map((u) => [u.email.toLowerCase(), u]));
  const deviceMap = new Map<string, SubjectPerson[]>();
  for (const r of onDevices as unknown as Array<{ deviceId: string; user: SubjectPerson }>) {
    const list = deviceMap.get(r.deviceId) ?? [];
    if (!list.some((u) => u.id === r.user.id)) list.push(r.user);
    deviceMap.set(r.deviceId, list);
  }

  const resolve = (s: Subject): ResolvedSubject => {
    const account =
      (s.userId ? idMap.get(s.userId) : undefined) ??
      (s.email ? emailMap.get(s.email.toLowerCase()) : undefined) ??
      null;
    const onDevice = (s.deviceId ? deviceMap.get(s.deviceId) ?? [] : []).filter((u) => u.id !== account?.id);
    return { account, onDevice, email: s.email ?? null };
  };

  /** Everyone any subject resolved to (for warning counts and the like). */
  const everyone = (): SubjectPerson[] => {
    const all = new Map<string, SubjectPerson>();
    for (const u of [...idMap.values(), ...emailMap.values(), ...[...deviceMap.values()].flat()]) all.set(u.id, u);
    return [...all.values()];
  };

  return { resolve, everyone };
}
