import { z } from "zod";
import { sanitizeTaskAudience } from "@/lib/task-targeting";
import { sanitizeKycAudience } from "@/lib/banner-audience";
import {
  sanitizePopupDevices,
  sanitizePopupFrequency,
  sanitizePopupKind,
  sanitizePopupPaths,
  sanitizePopupPlacement,
  sanitizePopupPlanAudience,
  sanitizePopupSession,
  sanitizePopupSize,
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
  // Content
  videos: z.array(urlOrPath).max(10, "At most 10 videos").optional(),
  htmlCode: z.string().max(100_000).optional().nullable(),
  htmlHeight: z.number().int().min(80).max(1200).optional(),
  cta2Label: z.string().max(40).optional().nullable(),
  cta2Url: urlOrPath.optional().nullable(),
  size: z.string().optional(),
  // Audience
  planAudience: z.string().optional(),
  packageIds: z.array(z.string().max(40)).max(50).optional(),
  minLevel: z.number().int().min(0).max(1000).optional().nullable(),
  maxLevel: z.number().int().min(0).max(1000).optional().nullable(),
  minAccountDays: z.number().int().min(0).max(36500).optional().nullable(),
  maxAccountDays: z.number().int().min(0).max(36500).optional().nullable(),
  devices: z.array(z.string()).max(3).optional(),
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
    videos: (v.videos ?? []).map((u) => u.trim()).filter(Boolean),
    htmlCode: v.htmlCode?.trim() ? v.htmlCode : null,
    htmlHeight: v.htmlHeight ?? 320,
    cta2Label: v.cta2Label?.trim() || null,
    cta2Url: v.cta2Url || null,
    size: sanitizePopupSize(v.size),
    planAudience: sanitizePopupPlanAudience(v.planAudience),
    packageIds: [...new Set((v.packageIds ?? []).filter(Boolean))],
    minLevel: v.minLevel ?? null,
    maxLevel: v.maxLevel ?? null,
    minAccountDays: v.minAccountDays ?? null,
    maxAccountDays: v.maxAccountDays ?? null,
    devices: sanitizePopupDevices(v.devices),
  };
}
