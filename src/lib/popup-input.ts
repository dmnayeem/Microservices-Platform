import { z } from "zod";
import { sanitizeTaskAudience } from "@/lib/task-targeting";
import { sanitizeKycAudience } from "@/lib/banner-audience";
import {
  sanitizePopupFrequency,
  sanitizePopupKind,
  sanitizePopupPaths,
  sanitizePopupPlacement,
  sanitizePopupSession,
} from "@/lib/popups";

const urlOrPath = z
  .string()
  .max(1000)
  .refine((v) => v === "" || v.startsWith("/") || /^https?:\/\//i.test(v), "Use a full https:// link or a path like /wallet");

export const popupSchema = z.object({
  title: z.string().trim().min(2, "Title is required").max(120),
  kind: z.string().optional(),
  body: z.string().max(50_000).optional().nullable(),
  imageUrl: urlOrPath.optional().nullable(),
  ctaLabel: z.string().max(40).optional().nullable(),
  ctaUrl: urlOrPath.optional().nullable(),
  placement: z.string().optional(),
  paths: z.union([z.array(z.string()), z.string()]).optional(),
  sessionAudience: z.string().optional(),
  frequency: z.string().optional(),
  delaySeconds: z.number().int().min(0).max(60).optional(),
  priority: z.number().int().min(-100).max(100).optional(),
  isActive: z.boolean().optional(),
  startsAt: z.string().datetime().optional().nullable().or(z.literal("")),
  endsAt: z.string().datetime().optional().nullable().or(z.literal("")),
});

/** Validated body → the columns to write (audience included). */
export function popupData(body: Record<string, unknown>, v: z.infer<typeof popupSchema>) {
  const placement = sanitizePopupPlacement(v.placement);
  return {
    title: v.title,
    kind: sanitizePopupKind(v.kind),
    body: v.body?.trim() ? v.body : null,
    imageUrl: v.imageUrl || null,
    ctaLabel: v.ctaLabel?.trim() || null,
    ctaUrl: v.ctaUrl || null,
    placement,
    paths: placement === "PATHS" ? sanitizePopupPaths(v.paths) : [],
    sessionAudience: sanitizePopupSession(v.sessionAudience),
    frequency: sanitizePopupFrequency(v.frequency),
    delaySeconds: v.delaySeconds ?? 2,
    priority: v.priority ?? 0,
    isActive: v.isActive ?? true,
    startsAt: v.startsAt ? new Date(v.startsAt) : null,
    endsAt: v.endsAt ? new Date(v.endsAt) : null,
    ...sanitizeTaskAudience(body),
    kycAudience: sanitizeKycAudience(body.kycAudience),
  };
}
