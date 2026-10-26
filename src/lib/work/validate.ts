import { z } from "zod";
import { MEMBER_ROLES, RECURRENCES, TASK_VISIBILITY, WORK_PRIORITIES } from "@/lib/work/model";
import { STAFF_ROLES } from "@/lib/staff";

/** Request shapes for Team Work APIs (kept out of route files: a route may only export handlers). */

export const targetSchema = z.object({
  label: z.string().trim().min(1).max(120),
  platformId: z.string().min(1).max(64).nullish(),
  unitLabel: z.string().trim().min(1).max(40).default("items"),
  quantity: z.number().int().min(0).max(10_000_000),
  assigneeId: z.string().min(1).max(64).nullish(),
});

export const taskInputSchema = z.object({
  title: z.string().trim().min(3).max(200),
  summary: z.string().trim().max(500).nullish(),
  instructions: z.string().max(200_000).nullish(),
  projectId: z.string().min(1).max(64).nullish(),
  milestoneId: z.string().min(1).max(64).nullish(),
  categoryId: z.string().min(1).max(64).nullish(),
  teamId: z.string().min(1).max(64).nullish(),
  managerId: z.string().min(1).max(64).nullish(),
  priority: z.enum(WORK_PRIORITIES).default("NORMAL"),
  visibility: z.enum(TASK_VISIBILITY).default("PARTICIPANTS"),
  visibleDepartmentId: z.string().min(1).max(64).nullish(),
  visibleRoles: z.array(z.string().max(40)).max(20).default([]),
  recurrence: z.enum(RECURRENCES).default("NONE"),
  targetMode: z.enum(["SHARED", "INDIVIDUAL"]).default("SHARED"),
  reviewRequired: z.boolean().default(true),
  evidenceRequired: z.boolean().default(false),
  acceptance: z.string().trim().max(5000).nullish(),
  estimatedHours: z.number().min(0).max(10_000).nullish(),
  startAt: z.coerce.date().nullish(),
  dueAt: z.coerce.date().nullish(),
  dependsOnId: z.string().min(1).max(64).nullish(),
  draft: z.boolean().default(false),
  members: z
    .array(z.object({ userId: z.string().min(1).max(64), role: z.enum(MEMBER_ROLES) }))
    .max(100)
    .default([]),
  targets: z.array(targetSchema).max(30).default([]),
});

/** Shared target/member rules for create and edit. Returns an error or null. */
export function targetMemberProblem(
  mode: "SHARED" | "INDIVIDUAL",
  members: { userId: string; role: string }[],
  targets: { assigneeId?: string | null }[]
): string | null {
  const ids = members.map((m) => m.userId);
  if (new Set(ids).size !== ids.length) return "A person is listed twice.";
  const assignees = new Set(members.filter((m) => m.role === "ASSIGNEE").map((m) => m.userId));
  if (mode === "SHARED" && targets.some((t) => t.assigneeId)) {
    return "With a shared target, targets are not given to one person.";
  }
  if (mode === "INDIVIDUAL") {
    if (targets.some((t) => !t.assigneeId || !assignees.has(t.assigneeId))) {
      return "With individual targets, every target must belong to one of the assignees.";
    }
  }
  return null;
}


/** Department / role visibility needs its target; roles must be staff roles. */
export function visibilityProblem(v: string, departmentId: string | null | undefined, roles: string[]): string | null {
  if (v === "DEPARTMENT" && !departmentId) return "Choose the department that can see this task.";
  if (v === "ROLES") {
    if (!roles.length) return "Choose at least one role that can see this task.";
    if (roles.some((r) => !(STAFF_ROLES as readonly string[]).includes(r))) return "Only staff roles can be chosen.";
  }
  return null;
}
