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
import { toast } from "sonner";
import {
  CATEGORIES,
  getCategory,
  getFieldsFor,
  getDeliverableKind,
  requiresDeliverable,
  type CategoryField,
} from "@/lib/marketplace-categories";
import { CategoryFieldInput } from "@/components/admin/marketplace/listing-form/CategoryFieldInput";
import { uploadUserFile } from "@/lib/user-upload";

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

export function CreateListingView() {
  const router = useRouter();

  const [assetType, setAssetType] = useState<string>("");
  const [subType, setSubType] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState<number>(9.99);
  const [images, setImages] = useState<string[]>([]);
  const [files, setFiles] = useState<string[]>([]); // deliverable(s)
  const [details, setDetails] = useState<Record<string, unknown>>({});
  const [affType, setAffType] = useState<"" | "PERCENT" | "FIXED">("");
  const [affValue, setAffValue] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);

  const cat = assetType ? getCategory(assetType) : null;
  const fields: CategoryField[] = useMemo(
    () => (assetType ? getFieldsFor(assetType, subType || null) : []),
    [assetType, subType]
  );
  const deliverableKind = assetType ? getDeliverableKind(assetType) : null;
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
      const urls = await Promise.all(arr.map((f) => uploadUserFile(f)));
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
      const url = await uploadUserFile(file);
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

  const submit = async () => {
    if (!assetType) return toast.error("Pick a category first");
    if (!title.trim() || description.trim().length < 10)
      return toast.error("Add a title and a description (10+ chars)");
    if (price <= 0) return toast.error("Price must be greater than 0");
    if (cat?.subTypes?.length && !subType)
      return toast.error("Choose a sub-type");
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
          details,
          price,
          currency: "USD",
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
      router.push("/marketplace/my");
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
      <div>
        <h1 className="text-xl font-bold text-white">Sell a digital asset</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Digital goods only — accounts, domains, websites, platforms, stock
          photos/videos/music and more. New listings are reviewed before going
          live.
        </p>
      </div>

      {/* Step 1 — category */}
      <section className="glass rounded-xl p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
          1 · Category
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {CATEGORIES.map((c) => {
            const Icon = ICONS[c.iconKey] ?? Box;
            const active = c.assetType === assetType;
            return (
              <button
                key={c.assetType}
                type="button"
                onClick={() => pickType(c.assetType)}
                className={`text-left rounded-xl border p-3 transition-colors ${
                  active
                    ? "border-indigo-500 bg-indigo-500/10"
                    : "border-gray-800 bg-gray-950 hover:border-gray-600"
                }`}
              >
                <Icon
                  className={`w-5 h-5 mb-1.5 ${active ? "text-indigo-300" : "text-gray-400"}`}
                />
                <p className="text-sm font-semibold text-white leading-tight">
                  {c.label}
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">
                  {c.description}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {assetType && (
        <>
          {/* Sub-type */}
          {cat?.subTypes && cat.subTypes.length > 0 && (
            <section className="glass rounded-xl p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                Type
              </p>
              <div className="flex flex-wrap gap-2">
                {cat.subTypes.map((s) => (
                  <button
                    key={s.slug}
                    type="button"
                    onClick={() => setSubType(s.slug)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                      subType === s.slug
                        ? "bg-indigo-500 text-white"
                        : "bg-gray-800 text-gray-300 hover:bg-gray-700"
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
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
              2 · Basics
            </p>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Title *
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
                placeholder="What are you selling?"
                className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Description *
              </label>
              <textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={1000}
                placeholder="Tell buyers what they're getting…"
                className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-none"
              />
            </div>
            <div className="w-40">
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Price (USD) *
              </label>
              <input
                type="number"
                step="0.01"
                min={0.5}
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
          </section>

          {/* Step 3 — category-specific fields */}
          {fields.length > 0 && (
            <section className="glass rounded-xl p-4 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
                3 · Details
              </p>
              {fields.map((f) => (
                <CategoryFieldInput
                  key={f.key}
                  field={f}
                  value={details[f.key]}
                  onChange={(v) => setField(f.key, v)}
                  uploadFn={uploadUserFile}
                />
              ))}
            </section>
          )}

          {/* Deliverable file (stock media) */}
          {needsDeliverable && (
            <section className="glass rounded-xl p-4 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
                The file you&apos;re selling *
              </p>
              <p className="text-[11px] text-gray-500 inline-flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                We read the file&apos;s metadata (camera/EXIF, codec, hash) so
                reviewers can confirm it&apos;s your original — not a download.
              </p>
              {files.length > 0 ? (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-gray-950 border border-gray-800 text-xs">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-gray-300 truncate flex-1">
                    {files[0].split("/").pop()}
                  </span>
                  <button
                    type="button"
                    onClick={() => setFiles([])}
                    className="text-gray-500 hover:text-rose-300"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 py-3 rounded-lg border-2 border-dashed border-gray-700 hover:border-indigo-500/50 cursor-pointer text-sm text-gray-300">
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

          {/* Affiliate reward — sellers can let others promote for a cut */}
          <section className="glass rounded-xl p-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
              Affiliate reward (optional)
            </p>
            <p className="text-[11px] text-gray-500">
              Let others promote this and earn a reward on each sale they drive —
              paid from your cut. Leave off to disable.
            </p>
            <div className="flex items-center gap-2">
              <select
                value={affType}
                onChange={(e) =>
                  setAffType(e.target.value as "" | "PERCENT" | "FIXED")
                }
                className="px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
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
                    className="w-32 pl-7 pr-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
                  />
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                    {affType === "PERCENT" ? "%" : "$"}
                  </span>
                </div>
              )}
            </div>
          </section>

          {/* Gallery images */}
          <section className="glass rounded-xl p-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
              Gallery images
            </p>
            {images.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                {images.map((img, i) => (
                  <div
                    key={i}
                    className="relative aspect-square rounded-lg overflow-hidden bg-gray-800"
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
              <label className="flex items-center justify-center gap-2 py-3 rounded-lg border-2 border-dashed border-gray-700 hover:border-indigo-500/50 cursor-pointer text-sm text-gray-300">
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
            className="w-full py-3 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            Submit for review
          </button>
        </>
      )}
    </div>
  );
}
