"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Upload,
  X,
  Check,
  ShieldCheck,
  Globe,
  LayoutDashboard,
  Users,
  Shirt,
  Smartphone,
  Gamepad2,
  Code,
  FileText,
  Briefcase,
  Box,
  Boxes,
  Image as ImageIcon,
  Video as VideoIcon,
  Music as MusicIcon,
  BookOpen,
  type LucideIcon,
} from "lucide-react";
import { toast } from "@/lib/toast";
import {
  CATEGORIES,
  getCategory,
  getFieldsFor,
  getDeliverableKind,
  canBeUnlimited,
  requiresDeliverable,
  isServiceType,
  SERVICE_ASSET_TYPE,
  type CategoryField,
} from "@/lib/marketplace-categories";
import { CategoryFieldInput } from "@/components/admin/marketplace/listing-form/CategoryFieldInput";
import { uploadUserFile } from "@/lib/user-upload";
import {
  MAX_REQUIREMENTS,
  PACKAGE_IDS,
  PACKAGE_LABEL,
  REQUIREMENT_TYPES,
  REQUIREMENT_TYPE_LABEL,
  readPackages,
  readRequirements,
  type PackageId,
  type RequirementType,
} from "@/lib/service-packages";

const ICONS: Record<string, LucideIcon> = {
  Globe,
  LayoutDashboard,
  Users,
  Shirt,
  Smartphone,
  Gamepad2,
  Code,
  FileText,
  Briefcase,
  Box,
  Boxes,
  Image: ImageIcon,
  Video: VideoIcon,
  Music: MusicIcon,
  BookOpen,
};

const DELIVERABLE_ACCEPT: Record<string, string> = {
  image: "image/*",
  video: "video/*",
  audio: "audio/*",
  document: ".pdf,.epub,.mobi,application/pdf,application/epub+zip",
  file: "*/*",
};

type Tier = { id: string; name: string; price: number; description?: string };

/** An existing service being edited (services mode only). */
export interface ServiceEditInitial {
  id: string;
  title: string;
  description: string;
  subType: string | null;
  price: number;
  details: Record<string, unknown> | null;
  images: string[];
}

type PkgDraft = {
  id: PackageId;
  enabled: boolean;
  name: string;
  description: string;
  price: number;
  deliveryDays: number;
  revisions: number;
  itemsText: string;
};
type ReqDraft = { id: string; label: string; type: RequirementType; required: boolean };

const fieldCls =
  "w-full px-3 py-2 bg-(--app-page) border border-(--app-line) rounded-lg text-(--app-ink) text-sm placeholder:text-(--app-ink-3) focus:outline-none focus:border-(--app-accent-edge)";

function initialPackages(details: unknown, price: number): PkgDraft[] {
  const saved = readPackages(details);
  return PACKAGE_IDS.map((id, i) => {
    const p = saved.find((x) => x.id === id);
    return p
      ? {
          id,
          enabled: true,
          name: p.name,
          description: p.description,
          price: p.price,
          deliveryDays: p.deliveryDays,
          revisions: p.revisions,
          itemsText: p.items.join("\n"),
        }
      : {
          id,
          enabled: saved.length === 0 && i === 0,
          name: PACKAGE_LABEL[id],
          description: "",
          price: Math.max(0.5, Math.round(price * [1, 2, 4][i] * 100) / 100),
          deliveryDays: [3, 5, 7][i],
          revisions: [1, 2, 3][i],
          itemsText: "",
        };
  });
}

/** Category screenshot fields are display images (proof-legible, ≤ 100 KB). */
const uploadListingScreenshot = (file: File) =>
  uploadUserFile(file, "marketplace", { purpose: "proof" });

/** Digital product types — services are offered from /services/create. */
const PRODUCT_CATEGORIES = CATEGORIES.filter((c) => !isServiceType(c.assetType));

export function CreateListingView({
  licenseTiersEnabled = false,
  suggestedTiers = [],
  mode = "products",
  initial,
}: {
  licenseTiersEnabled?: boolean;
  suggestedTiers?: Tier[];
  /** "services" fixes the type to SERVICE and words the form for freelancers. */
  mode?: "products" | "services";
  /** Edit an existing service instead of creating one (services mode). */
  initial?: ServiceEditInitial;
} = {}) {
  const router = useRouter();
  const services = mode === "services";
  const editing = services && !!initial;

  const [assetType, setAssetType] = useState<string>(services ? SERVICE_ASSET_TYPE : "");
  const [subType, setSubType] = useState<string>(initial?.subType ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [price, setPrice] = useState<number>(initial?.price ?? 9.99);
  // Service packages (Basic / Standard / Premium) + order questions.
  const [usePackages, setUsePackages] = useState(() => readPackages(initial?.details).length > 0);
  const [pkgs, setPkgs] = useState<PkgDraft[]>(() => initialPackages(initial?.details, initial?.price ?? 9.99));
  const [reqs, setReqs] = useState<ReqDraft[]>(() => readRequirements(initial?.details));
  const [exclusive, setExclusive] = useState(false);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [images, setImages] = useState<string[]>(initial?.images ?? []);
  const [files, setFiles] = useState<string[]>([]); // deliverable(s)
  const [details, setDetails] = useState<Record<string, unknown>>(() => {
    const d = { ...(initial?.details ?? {}) };
    delete d.packages;
    delete d.requirements;
    return d;
  });
  const [affType, setAffType] = useState<"" | "PERCENT" | "FIXED">("");
  const [affValue, setAffValue] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);

  const cat = assetType ? getCategory(assetType) : null;
  const fields: CategoryField[] = useMemo(
    () =>
      (assetType ? getFieldsFor(assetType, subType || null) : []).filter(
        // Each package carries its own delivery time and revisions.
        (f) => !(services && usePackages && (f.key === "turnaroundDays" || f.key === "revisions"))
      ),
    [assetType, subType, services, usePackages]
  );
  const setPkg = (i: number, patch: Partial<PkgDraft>) =>
    setPkgs((prev) => prev.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const setReq = (i: number, patch: Partial<ReqDraft>) =>
    setReqs((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const enabledPkgs = pkgs.filter((p) => p.enabled);
  const startingAt = enabledPkgs.length ? Math.min(...enabledPkgs.map((p) => p.price || 0)) : 0;
  const deliverableKind = assetType ? getDeliverableKind(assetType) : null;
  const repeatable = assetType ? canBeUnlimited(assetType) : false;
  const needsDeliverable = assetType ? requiresDeliverable(assetType) : false;

  const setField = (key: string, v: unknown) =>
    setDetails((prev) => ({ ...prev, [key]: v }));

  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const stringOrNull = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;

  const pickType = (t: string) => {
    setAssetType(t);
    setSubType("");
    setDetails({});
    setFiles([]);
  };

  const addGalleryFiles = async (list: FileList) => {
    const arr = Array.from(list).slice(0, 8 - images.length);
    if (arr.length === 0) return;
    setUploadingGallery(true);
    try {
      const urls = await Promise.all(arr.map((f) => uploadUserFile(f, "marketplace-media", { purpose: "cover" })));
      setImages((prev) => [...prev, ...urls]);
    } catch (err) {
      toast.error("Image upload failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setUploadingGallery(false);
    }
  };

  const addDeliverable = async (file: File) => {
    setUploadingFile(true);
    try {
      // The product itself: stored byte-for-byte, never compressed.
      const url = await uploadUserFile(file, "marketplace", { purpose: "deliverable" });
      setFiles([url]); // one deliverable per stock-media listing
      toast.success("File uploaded — we'll analyse it on submit");
    } catch (err) {
      toast.error("File upload failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setUploadingFile(false);
    }
  };

  /** Service details as saved: category fields + packages + order questions. */
  const serviceDetails = () => {
    const d: Record<string, unknown> = { ...details };
    if (usePackages) {
      delete d.turnaroundDays;
      delete d.revisions;
    }
    d.packages = usePackages
      ? enabledPkgs.map((p) => ({
          id: p.id,
          name: p.name.trim() || PACKAGE_LABEL[p.id],
          description: p.description.trim(),
          price: p.price,
          deliveryDays: p.deliveryDays,
          revisions: p.revisions,
          items: p.itemsText.split("\n").map((x) => x.trim()).filter(Boolean),
        }))
      : [];
    d.requirements = reqs
      .filter((r) => r.label.trim())
      .map((r) => ({ ...r, label: r.label.trim() }));
    return d;
  };

  const submit = async () => {
    if (!assetType) return toast.error("Pick a category first");
    if (!title.trim() || description.trim().length < 10)
      return toast.error("Add a title and a description (10+ chars)");
    if (services && usePackages) {
      if (enabledPkgs.length === 0) return toast.error("Turn on at least one package");
      const bad = enabledPkgs.find((p) => !(p.price >= 0.5) || !(p.deliveryDays >= 1));
      if (bad) return toast.error(`${PACKAGE_LABEL[bad.id]}: set a price (min $0.50) and a delivery time (1+ days)`);
    } else if (price <= 0) return toast.error("Price must be greater than 0");
    if (editing && initial) {
      setBusy(true);
      try {
        const res = await fetch(`/api/marketplace/listings/${initial.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim(),
            images,
            subType: subType || null,
            details: serviceDetails(),
            ...(usePackages ? {} : { price }),
          }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
        toast.success("Service updated", {
          description: "Changes to a live service are reviewed before they go live.",
        });
        router.push("/services/my");
      } catch (err) {
        toast.error("Failed to save", { description: err instanceof Error ? err.message : "Try again" });
      } finally {
        setBusy(false);
      }
      return;
    }
    if (cat?.subTypes?.length && !subType)
      return toast.error(services ? "Choose a service category" : "Choose a sub-type");
    if (needsDeliverable && files.length === 0)
      return toast.error("Upload the file you're selling");

    setBusy(true);
    try {
      const res = await fetch("/api/marketplace/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          category: cat?.label ?? assetType,
          assetType,
          subType: subType || null,
          details: services ? serviceDetails() : details,
          // A packaged service is priced by its cheapest package (the server
          // enforces the same).
          price: services && usePackages ? startingAt : price,
          currency: "USD",
          // Only meaningful for a repeatable category; the server clamps
          // anything else back to ONE_OFF. A service takes any number of orders.
          saleMode: services || (repeatable && !exclusive) ? "UNLIMITED" : "ONE_OFF",
          // Ignored by the server unless the admin has tiers switched on and
          // the category is one that can be sold repeatedly.
          licenseTiers: !services && tiers.length > 0 ? tiers : undefined,
          affiliateCommissionType: affType || null,
          affiliateCommissionValue: affType && affValue > 0 ? affValue : null,
          images,
          files,
          // Mirror the shared metric fields into their real columns (filters).
          assetAgeMonths: num(details.assetAgeMonths),
          niche: stringOrNull(details.niche),
          monthlyRevenue: num(details.monthlyRevenue),
          monthlyProfit: num(details.monthlyProfit),
          monthlyExpenses: num(details.monthlyExpenses),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success("Submitted for review", {
        description: "An admin will approve it before it goes live.",
      });
      router.push(services ? "/services/my" : "/marketplace/my");
    } catch (err) {
      toast.error("Failed to submit", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 max-w-3xl mx-auto pb-24">
      {services ? (
        <div>
          <h1 className="text-xl font-bold text-white">{editing ? "Edit service" : "Offer a service"}</h1>
          <p className="text-sm text-(--app-ink-3) mt-0.5">
            Tell buyers what you will do, how long it takes and how many
            revisions are included. Buyers pay into escrow when they order, and
            you are paid once the work is delivered. New services are reviewed
            before going live.
          </p>
        </div>
      ) : (
        <div>
          <h1 className="text-xl font-bold text-white">Sell a digital asset</h1>
          <p className="text-sm text-(--app-ink-3) mt-0.5">
            Digital goods only — accounts, domains, websites, platforms, stock
            photos/videos/music and more. New listings are reviewed before going
            live. Offering a service instead? Use Services → Offer a service.
          </p>
        </div>
      )}

      {/* Step 1 — category (fixed for services) */}
      {!services && (
        <section className="glass rounded-xl p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-(--app-ink-3) mb-2">
            1 · Category
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {PRODUCT_CATEGORIES.map((c) => {
              const Icon = ICONS[c.iconKey] ?? Box;
              const active = c.assetType === assetType;
              return (
                <button
                  key={c.assetType}
                  type="button"
                  onClick={() => pickType(c.assetType)}
                  className={`text-left rounded-xl border p-3 transition-colors ${
                    active
                      ? "border-(--app-accent-edge) bg-(--app-cta)/10"
                      : "border-(--app-line) bg-(--app-page) hover:border-(--app-line)"
                  }`}
                >
                  <Icon
                    className={`w-5 h-5 mb-1.5 ${active ? "text-(--app-accent-ink)" : "text-(--app-ink-3)"}`}
                  />
                  <p className="text-sm font-semibold text-white leading-tight">
                    {c.label}
                  </p>
                  <p className="text-[11px] text-(--app-ink-3) mt-0.5 line-clamp-2">
                    {c.description}
                  </p>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {assetType && (
        <>
          {/* Sub-type */}
          {cat?.subTypes && cat.subTypes.length > 0 && (
            <section className="glass rounded-xl p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-(--app-ink-3) mb-2">
                {services ? "1 · Service category" : "Type"}
              </p>
              <div className="flex flex-wrap gap-2">
                {cat.subTypes.map((s) => (
                  <button
                    key={s.slug}
                    type="button"
                    onClick={() => setSubType(s.slug)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                      subType === s.slug
                        ? "bg-(--app-cta) text-(--app-on-cta)"
                        : "bg-(--app-surface-2) text-(--app-ink-2) hover:bg-(--app-surface-hover)"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Step 2 — basics */}
          <section className="glass rounded-xl p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-(--app-ink-3)">
              2 · Basics
            </p>
            <div>
              <label className="block text-xs font-medium text-(--app-ink-3) mb-1.5">
                Title *
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
                placeholder={services ? "I will design a logo for your brand" : "What are you selling?"}
                className="w-full px-3 py-2 bg-(--app-page) border border-(--app-line) rounded-lg text-(--app-ink) text-sm placeholder:text-(--app-ink-3) focus:outline-none focus:border-(--app-accent-edge)"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-(--app-ink-3) mb-1.5">
                Description *
              </label>
              <textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={1000}
                placeholder={
                  services
                    ? "What you will do, what you need from the buyer to start, and how you work…"
                    : "Tell buyers what they're getting…"
                }
                className="w-full px-3 py-2 bg-(--app-page) border border-(--app-line) rounded-lg text-(--app-ink) text-sm placeholder:text-(--app-ink-3) focus:outline-none focus:border-(--app-accent-edge) resize-none"
              />
            </div>
            {services && usePackages ? (
              <p className="text-xs text-(--app-ink-3)">
                Priced by your packages — buyers see{" "}
                <strong className="text-white tabular-nums">Starting at ${startingAt.toLocaleString()}</strong>.
              </p>
            ) : (
            <div className="w-40">
              <label className="block text-xs font-medium text-(--app-ink-3) mb-1.5">
                Price (USD) *
              </label>
              <input
                type="number"
                step="0.01"
                min={0.5}
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                className="w-full px-3 py-2 bg-(--app-page) border border-(--app-line) rounded-lg text-(--app-ink) text-sm focus:outline-none focus:border-(--app-accent-edge)"
              />
            </div>
            )}
            {/* Licence tiers. Only where the admin has switched them on AND the
                category is sold repeatedly — a domain has one buyer, so three
                licence levels would promise something it cannot deliver. */}
            {licenseTiersEnabled && repeatable && !exclusive && !services && (
              <div className="w-full space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-(--app-ink-3)">
                    Licence tiers (optional)
                  </label>
                  {tiers.length === 0 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setTiers(
                          suggestedTiers.map((t, i) => ({
                            ...t,
                            price: Math.max(0.5, price * (i === 0 ? 1 : 4)),
                          }))
                        )
                      }
                      className="text-xs text-(--app-accent-ink) hover:underline"
                    >
                      Add standard + extended
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setTiers([])}
                      className="text-xs text-(--app-ink-3) hover:text-(--app-ink)"
                    >
                      Remove tiers
                    </button>
                  )}
                </div>
                {tiers.length > 0 && (
                  <>
                    {tiers.map((t, i) => (
                      <div key={t.id} className="flex gap-2">
                        <input
                          value={t.name}
                          onChange={(e) =>
                            setTiers((prev) =>
                              prev.map((x, j) =>
                                j === i ? { ...x, name: e.target.value } : x
                              )
                            )
                          }
                          className="flex-1 px-3 py-2 bg-(--app-page) border border-(--app-line) rounded-lg text-(--app-ink) text-sm"
                        />
                        <input
                          type="number"
                          step="0.01"
                          min={0.5}
                          value={t.price}
                          onChange={(e) =>
                            setTiers((prev) =>
                              prev.map((x, j) =>
                                j === i ? { ...x, price: Number(e.target.value) } : x
                              )
                            )
                          }
                          className="w-28 px-3 py-2 bg-(--app-page) border border-(--app-line) rounded-lg text-(--app-ink) text-sm"
                        />
                      </div>
                    ))}
                    <p className="text-[11px] text-(--app-ink-3)">
                      The cheapest tier becomes the listing price, so the card and the
                      checkout always agree.
                    </p>
                  </>
                )}
              </div>
            )}

            {/* Only offered where it is a real choice. A domain or an account
                can only ever go to one buyer, so showing a toggle there would
                promise something the category cannot deliver. */}
            {repeatable && !services && (
              <div className="w-full">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exclusive}
                    onChange={(e) => setExclusive(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span className="text-xs text-(--app-ink-2)">
                    Sell this once, to a single buyer
                    <span className="block text-(--app-ink-3)">
                      {exclusive
                        ? "The listing leaves the shop as soon as someone buys it."
                        : "By default this stays on sale and is licensed to every buyer who wants it."}
                    </span>
                  </span>
                </label>
              </div>
            )}
          </section>

          {/* Step 3 — category-specific fields */}
          {fields.length > 0 && (
            <section className="glass rounded-xl p-4 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-(--app-ink-3)">
                {services ? "3 · Delivery & revisions" : "3 · Details"}
              </p>
              {fields.map((f) => (
                <CategoryFieldInput
                  key={f.key}
                  field={f}
                  value={details[f.key]}
                  onChange={(v) => setField(f.key, v)}
                  uploadFn={uploadListingScreenshot}
                />
              ))}
            </section>
          )}

          {services && (
            <section className="glass rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wider text-(--app-ink-3)">
                  4 · Packages (optional)
                </p>
                <label className="inline-flex items-center gap-2 text-xs text-(--app-ink-2) cursor-pointer">
                  <input type="checkbox" checked={usePackages} onChange={(e) => setUsePackages(e.target.checked)} />
                  Offer Basic / Standard / Premium
                </label>
              </div>
              {!usePackages ? (
                <p className="text-[11px] text-(--app-ink-3)">
                  One price for everyone. Turn packages on to offer up to three levels, each with its own
                  price, delivery time, revisions and what&apos;s included.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {pkgs.map((p, i) => (
                    <div
                      key={p.id}
                      className={`rounded-xl border p-3 space-y-2 ${
                        p.enabled ? "border-(--app-accent-edge)/50" : "border-(--app-line) opacity-70"
                      }`}
                    >
                      <label className="flex items-center justify-between gap-2 cursor-pointer">
                        <span className="text-sm font-bold text-white">{PACKAGE_LABEL[p.id]}</span>
                        <input
                          type="checkbox"
                          checked={p.enabled}
                          onChange={(e) => setPkg(i, { enabled: e.target.checked })}
                        />
                      </label>
                      {p.enabled && (
                        <>
                          <input
                            value={p.name}
                            maxLength={60}
                            onChange={(e) => setPkg(i, { name: e.target.value })}
                            placeholder="Package name"
                            className={fieldCls}
                          />
                          <textarea
                            rows={2}
                            maxLength={300}
                            value={p.description}
                            onChange={(e) => setPkg(i, { description: e.target.value })}
                            placeholder="What this package covers"
                            className={`${fieldCls} resize-none`}
                          />
                          <div className="grid grid-cols-3 gap-1.5">
                            <label className="text-[10px] text-(--app-ink-3)">
                              Price $
                              <input
                                type="number"
                                min={0.5}
                                step="0.01"
                                value={p.price}
                                onChange={(e) => setPkg(i, { price: Number(e.target.value) })}
                                className={fieldCls}
                              />
                            </label>
                            <label className="text-[10px] text-(--app-ink-3)">
                              Days
                              <input
                                type="number"
                                min={1}
                                max={365}
                                value={p.deliveryDays}
                                onChange={(e) => setPkg(i, { deliveryDays: Math.floor(Number(e.target.value)) })}
                                className={fieldCls}
                              />
                            </label>
                            <label className="text-[10px] text-(--app-ink-3)">
                              Revisions
                              <input
                                type="number"
                                min={0}
                                max={20}
                                value={p.revisions}
                                onChange={(e) => setPkg(i, { revisions: Math.floor(Number(e.target.value)) })}
                                className={fieldCls}
                              />
                            </label>
                          </div>
                          <textarea
                            rows={3}
                            value={p.itemsText}
                            onChange={(e) => setPkg(i, { itemsText: e.target.value })}
                            placeholder={"Included items, one per line\ne.g. Source file\nCommercial use"}
                            className={`${fieldCls} resize-none`}
                          />
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {services && (
            <section className="glass rounded-xl p-4 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-(--app-ink-3)">
                5 · Order requirements (optional)
              </p>
              <p className="text-[11px] text-(--app-ink-3)">
                Questions the buyer answers when ordering — the answers appear in the order conversation.
              </p>
              {reqs.map((r, i) => (
                <div key={r.id} className="flex flex-wrap items-center gap-2">
                  <input
                    value={r.label}
                    maxLength={200}
                    onChange={(e) => setReq(i, { label: e.target.value })}
                    placeholder="e.g. What is your brand name?"
                    className={`${fieldCls} flex-1 min-w-48`}
                  />
                  <select
                    value={r.type}
                    onChange={(e) => setReq(i, { type: e.target.value as RequirementType })}
                    className="px-2 py-2 bg-(--app-page) border border-(--app-line) rounded-lg text-(--app-ink) text-sm"
                  >
                    {REQUIREMENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {REQUIREMENT_TYPE_LABEL[t]}
                      </option>
                    ))}
                  </select>
                  <label className="inline-flex items-center gap-1 text-xs text-(--app-ink-2)">
                    <input
                      type="checkbox"
                      checked={r.required}
                      onChange={(e) => setReq(i, { required: e.target.checked })}
                    />
                    Required
                  </label>
                  <button
                    type="button"
                    onClick={() => setReqs((prev) => prev.filter((_, j) => j !== i))}
                    className="p-1.5 text-(--app-ink-3) hover:text-rose-300"
                    aria-label="Remove question"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {reqs.length < MAX_REQUIREMENTS && (
                <button
                  type="button"
                  onClick={() =>
                    setReqs((prev) => [
                      ...prev,
                      { id: `q${Date.now().toString(36)}`, label: "", type: "text", required: true },
                    ])
                  }
                  className="text-xs font-semibold text-(--app-accent-ink) hover:underline"
                >
                  + Add a question
                </button>
              )}
            </section>
          )}

          {/* Deliverable file (stock media) */}
          {needsDeliverable && (
            <section className="glass rounded-xl p-4 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-(--app-ink-3)">
                The file you&apos;re selling *
              </p>
              <p className="text-[11px] text-(--app-ink-3) inline-flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                We read the file&apos;s metadata (camera/EXIF, codec, hash) so
                reviewers can confirm it&apos;s your original — not a download.
              </p>
              {files.length > 0 ? (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-(--app-page) border border-(--app-line) text-xs">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-(--app-ink-2) truncate min-w-0 flex-1">
                    {files[0].split("/").pop()}
                  </span>
                  <button
                    type="button"
                    onClick={() => setFiles([])}
                    className="text-(--app-ink-3) hover:text-rose-300"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 py-3 rounded-lg border-2 border-dashed border-(--app-line) hover:border-(--app-accent-edge)/50 cursor-pointer text-sm text-(--app-ink-2)">
                  {uploadingFile ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  {uploadingFile ? "Uploading…" : "Upload file"}
                  <input
                    type="file"
                    hidden
                    accept={DELIVERABLE_ACCEPT[deliverableKind ?? "file"]}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) addDeliverable(f);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
              )}
            </section>
          )}

          {/* Affiliate reward — sellers can let others promote for a cut.
              Set when the service is created; not part of an edit. */}
          {!editing && (
          <section className="glass rounded-xl p-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-(--app-ink-3)">
              Affiliate reward (optional)
            </p>
            <p className="text-[11px] text-(--app-ink-3)">
              Let others promote this and earn a reward on each sale they drive —
              paid from your cut. Leave off to disable.
            </p>
            <div className="flex items-center gap-2">
              <select
                value={affType}
                onChange={(e) =>
                  setAffType(e.target.value as "" | "PERCENT" | "FIXED")
                }
                className="px-3 py-2 bg-(--app-page) border border-(--app-line) rounded-lg text-(--app-ink) text-sm focus:outline-none focus:border-(--app-accent-edge)"
              >
                <option value="">No affiliate</option>
                <option value="PERCENT">% of sale</option>
                <option value="FIXED">Fixed $</option>
              </select>
              {affType && (
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    step={affType === "PERCENT" ? 1 : 0.01}
                    value={affValue || ""}
                    onChange={(e) => setAffValue(Number(e.target.value))}
                    placeholder={affType === "PERCENT" ? "e.g. 20" : "e.g. 5.00"}
                    className="w-32 pl-7 pr-3 py-2 bg-(--app-page) border border-(--app-line) rounded-lg text-(--app-ink) text-sm focus:outline-none focus:border-(--app-accent-edge)"
                  />
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-(--app-ink-3) text-sm">
                    {affType === "PERCENT" ? "%" : "$"}
                  </span>
                </div>
              )}
            </div>
          </section>
          )}

          {/* Gallery images */}
          <section className="glass rounded-xl p-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-(--app-ink-3)">
              Gallery images
            </p>
            {images.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                {images.map((img, i) => (
                  <div
                    key={i}
                    className="relative aspect-square rounded-lg overflow-hidden bg-(--app-surface-2)"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setImages(images.filter((_, x) => x !== i))}
                      className="absolute top-1 right-1 p-0.5 rounded-full bg-black/60 text-white"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {images.length < 8 && (
              <label className="flex items-center justify-center gap-2 py-3 rounded-lg border-2 border-dashed border-(--app-line) hover:border-(--app-accent-edge)/50 cursor-pointer text-sm text-(--app-ink-2)">
                {uploadingGallery ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                {uploadingGallery ? "Uploading…" : "Add images"}
                <input
                  type="file"
                  hidden
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    if (e.target.files) addGalleryFiles(e.target.files);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
            )}
          </section>

          <button
            onClick={submit}
            disabled={busy || uploadingFile || uploadingGallery}
            className="w-full py-3 rounded-xl bg-(--app-cta) hover:bg-(--app-cta) text-(--app-on-cta) font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            {editing ? "Save changes" : "Submit for review"}
          </button>
        </>
      )}
    </div>
  );
}
