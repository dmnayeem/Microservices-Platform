"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Sparkles,
  Search,
  Upload,
  RefreshCw,
  Check,
  AlertTriangle,
  Layers,
  ExternalLink,
  Film,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { mediaSrc } from "@/lib/media-url";

type Brand = { id: string; name: string };
type Category = {
  assetType: string;
  label: string;
  deliverableKind: string | null;
  subTypes: { slug: string; label: string }[];
};
type Model = { id: string; label: string; hint: string; ready?: boolean };
type Shape = { id: string; label: string };

type Asset = {
  fileUrl: string;
  fileKey: string;
  previewUrl: string;
  width: number | null;
  height: number | null;
  bytes: number;
  /** Set when the watermarked preview could not be produced. */
  previewError?: string;
};
type Metadata = {
  title: string;
  description: string;
  richDescription: string;
  keywords: string[];
  niche: string;
};
type StockItem = {
  id: number | string;
  title: string;
  thumbnail: string;
  sourceUrl: string;
  license: string | null;
};

type Source = "AI_IMAGE" | "STOCK_IMPORT" | "UPLOAD";
type BatchLine = { prompt: string; state: "waiting" | "running" | "done" | "failed"; note?: string };

const LICENSES = [
  "Standard (royalty-free)",
  "Extended",
  "Editorial only",
  "Exclusive",
];

async function call(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

export function StudioClient({
  brands,
  categories,
  models,
  shapes,
  videoModels,
  magnificReady,
  geminiReady,
  anyImageProviderReady,
}: {
  brands: Brand[];
  categories: Category[];
  models: Model[];
  shapes: Shape[];
  videoModels: Model[];
  magnificReady: boolean;
  geminiReady: boolean;
  anyImageProviderReady: boolean;
}) {
  const router = useRouter();

  const [source, setSource] = useState<Source>("AI_IMAGE");
  const [assetType, setAssetType] = useState("STOCK_PHOTO");
  const [subType, setSubType] = useState("");
  const [brandId, setBrandId] = useState("");
  const [price, setPrice] = useState("5");
  const [license, setLicense] = useState(LICENSES[0]);

  // AI source
  // Start on a model that can actually run. Defaulting to the first in the
  // list picks a Magnific model even on an account with only a Gemini key, and
  // the first thing the admin sees is then a 503.
  const [model, setModel] = useState(
    (models.find((m) => m.ready) ?? models[0])?.id ?? "fluxDev"
  );
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState(shapes[0]?.id ?? "square_1_1");

  // Stock source
  const [kind, setKind] = useState<"resources" | "icons" | "videos">("resources");
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<StockItem[]>([]);
  const [searching, setSearching] = useState(false);

  // Draft under review
  const [asset, setAsset] = useState<Asset | null>(null);
  const [meta, setMeta] = useState<Metadata | null>(null);
  const [subject, setSubject] = useState("");
  const [aiGenerated, setAiGenerated] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  // Animate the reviewed still into a clip
  const [videoModel, setVideoModel] = useState(videoModels[0]?.id ?? "hailuo");
  const [videoPrompt, setVideoPrompt] = useState("");

  // Batch
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchText, setBatchText] = useState("");
  const [batch, setBatch] = useState<BatchLine[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);

  const cat = categories.find((c) => c.assetType === assetType);
  const priceNum = Number(price);
  const priceValid = Number.isFinite(priceNum) && priceNum > 0;

  const resetDraft = () => {
    setAsset(null);
    setMeta(null);
    setSubject("");
  };

  /* ---------------- sources ---------------- */

  const generate = async () => {
    if (prompt.trim().length < 3) {
      toast.error("Describe what to generate");
      return;
    }
    setBusy("generate");
    try {
      const r = await call("/api/admin/marketplace/studio/asset", {
        source: "AI_IMAGE",
        assetType,
        subType: subType || null,
        brandId: brandId || null,
        model,
        prompt: prompt.trim(),
        aspectRatio: aspect,
      });
      setAsset(r.asset);
      setMeta(r.metadata ?? blankMeta(prompt.trim()));
      setSubject(r.subject ?? prompt.trim());
      setAiGenerated(true);
      if (r.asset?.previewError) toast.error(r.asset.previewError);
      if (r.metadataError) toast.error(r.metadataError);
      else toast.success("Generated — review and publish");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setBusy(null);
    }
  };

  const search = async () => {
    if (!term.trim()) {
      toast.error("Type something to search for");
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(
        `/api/admin/marketplace/studio/stock?term=${encodeURIComponent(term.trim())}&kind=${kind}`
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Search failed");
      setResults(json.items ?? []);
      if ((json.items ?? []).length === 0) toast.error("Nothing matched that search");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Search failed");
    } finally {
      setSearching(false);
    }
  };

  const importItem = async (item: StockItem) => {
    setBusy(`import-${item.id}`);
    try {
      const r = await call("/api/admin/marketplace/studio/asset", {
        source: "STOCK_IMPORT",
        assetType,
        subType: subType || null,
        brandId: brandId || null,
        resourceId: item.id,
        kind,
        sourceTitle: item.title,
      });
      setAsset(r.asset);
      setMeta(r.metadata ?? blankMeta(item.title));
      setSubject(r.subject ?? item.title);
      setAiGenerated(false);
      if (r.asset?.previewError) toast.error(r.asset.previewError);
      if (r.metadataError) toast.error(r.metadataError);
      else toast.success("Imported — review and publish");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(null);
    }
  };

  const upload = async (file: File) => {
    setBusy("upload");
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("assetType", assetType);
      if (subType) fd.set("subType", subType);
      if (brandId) fd.set("brandId", brandId);
      fd.set("subject", file.name);
      const res = await fetch("/api/admin/marketplace/studio/upload", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      setAsset(json.asset);
      setMeta(json.metadata ?? blankMeta(file.name));
      setSubject(json.subject ?? file.name);
      setAiGenerated(false);
      if (json.asset?.previewError) toast.error(json.asset.previewError);
      if (json.metadataError) toast.error(json.metadataError);
      else toast.success("Uploaded — review and publish");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  };

  const rerollCopy = async () => {
    if (!subject) return;
    setBusy("copy");
    try {
      const r = await call("/api/admin/marketplace/studio/metadata", {
        assetType,
        subType: subType || null,
        subject,
        brandId: brandId || null,
      });
      setMeta(r.metadata);
      toast.success("New copy written");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not rewrite the copy");
    } finally {
      setBusy(null);
    }
  };

  const publish = async () => {
    if (!asset || !meta) return;
    if (!priceValid) {
      toast.error("Set a price above zero");
      return;
    }
    setBusy("publish");
    try {
      const r = await call("/api/admin/marketplace/studio/publish", {
        assetType,
        subType: subType || null,
        brandId: brandId || null,
        price: priceNum,
        license,
        aiGenerated,
        status: "ACTIVE",
        asset,
        metadata: meta,
      });
      toast.success(`"${r.listing.title}" is live`);
      resetDraft();
      setPrompt("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not publish");
    } finally {
      setBusy(null);
    }
  };

  const queueVideo = async () => {
    if (!asset) return;
    if (videoPrompt.trim().length < 3) {
      toast.error("Describe the motion you want");
      return;
    }
    if (!priceValid) {
      toast.error("Set a price above zero");
      return;
    }
    setBusy("video");
    try {
      const r = await call("/api/admin/marketplace/studio/video", {
        model: videoModel,
        prompt: videoPrompt.trim(),
        assetType: "STOCK_VIDEO",
        brandId: brandId || null,
        price: priceNum,
        license,
        source: { fileKey: asset.fileKey, previewUrl: asset.previewUrl },
      });
      toast.success(r.message ?? "Queued");
      setVideoPrompt("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not queue the clip");
    } finally {
      setBusy(null);
    }
  };

  /* ---------------- batch ---------------- */

  const runBatch = async () => {
    const lines = batchText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length >= 3);
    if (lines.length === 0) {
      toast.error("Put one prompt per line");
      return;
    }
    if (!priceValid) {
      toast.error("Set a price above zero");
      return;
    }

    const queue: BatchLine[] = lines.map((p) => ({ prompt: p, state: "waiting" }));
    setBatch(queue);
    setBatchRunning(true);

    // Sequential on purpose. Each item is a separate request so one failure
    // cannot lose the rest, and firing them in parallel would hit the image
    // API's rate limit and bill for work that gets dropped.
    let ok = 0;
    for (let i = 0; i < queue.length; i++) {
      setBatch((b) => b.map((x, j) => (j === i ? { ...x, state: "running" } : x)));
      try {
        const gen = await call("/api/admin/marketplace/studio/asset", {
          source: "AI_IMAGE",
          assetType,
          subType: subType || null,
          brandId: brandId || null,
          model,
          prompt: queue[i].prompt,
          aspectRatio: aspect,
        });
        await call("/api/admin/marketplace/studio/publish", {
          assetType,
          subType: subType || null,
          brandId: brandId || null,
          price: priceNum,
          license,
          aiGenerated: true,
          // Batch output lands in the existing admin review queue rather than
          // going live unseen — nobody eyeballed these before they published.
          status: "PENDING_REVIEW",
          asset: gen.asset,
          metadata: gen.metadata ?? blankMeta(queue[i].prompt),
        });
        ok++;
        setBatch((b) =>
          b.map((x, j) => (j === i ? { ...x, state: "done", note: "queued for review" } : x))
        );
      } catch (e) {
        setBatch((b) =>
          b.map((x, j) =>
            j === i
              ? { ...x, state: "failed", note: e instanceof Error ? e.message : "failed" }
              : x
          )
        );
      }
    }

    setBatchRunning(false);
    toast.success(`${ok} of ${queue.length} created — approve them in Marketplace → Pending review`);
    router.refresh();
  };

  /* ---------------- render ---------------- */

  // Generation works off whichever provider has a key; only the stock library
  // is Magnific's alone.
  const disabled = !anyImageProviderReady;
  const stockDisabled = !magnificReady;

  return (
    <div className="space-y-5">
      {!anyImageProviderReady && (
        <Banner tone="warn">
          <strong>No image AI key is set.</strong> Paste a Magnific, Gemini or OpenAI key in{" "}
          Settings → Integrations → AI and generation turns on straight away — no redeploy.
          Uploading your own file works regardless.
        </Banner>
      )}
      {anyImageProviderReady && !magnificReady && (
        <Banner tone="info">
          <strong>MAGNIFIC_API_KEY is not set.</strong> Generation still works through your
          other key; only the stock library and video generation are Magnific&apos;s.
        </Banner>
      )}
      {!geminiReady && (
        <Banner tone="info">
          <strong>GEMINI_API_KEY is not set.</strong> Assets still store fine — you will just
          write the title and description yourself.
        </Banner>
      )}

      {/* Shared settings */}
      <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm">
          <span className="text-gray-400">Category</span>
          <select
            value={assetType}
            onChange={(e) => {
              setAssetType(e.target.value);
              setSubType("");
            }}
            className="mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
          >
            {categories.map((c) => (
              <option key={c.assetType} value={c.assetType}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="text-gray-400">Sub-type</span>
          <select
            value={subType}
            onChange={(e) => setSubType(e.target.value)}
            disabled={!cat?.subTypes.length}
            className="mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white disabled:opacity-50"
          >
            <option value="">{cat?.subTypes.length ? "None" : "Not applicable"}</option>
            {cat?.subTypes.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="text-gray-400">Storefront</span>
          <select
            value={brandId}
            onChange={(e) => setBrandId(e.target.value)}
            className="mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
          >
            <option value="">My admin account</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="text-gray-400">Price (USD)</span>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            className={`mt-1 w-full bg-gray-900 border rounded-lg px-3 py-2 text-white ${
              priceValid ? "border-gray-700" : "border-red-500/60"
            }`}
          />
        </label>

        <label className="text-sm lg:col-span-2">
          <span className="text-gray-400">Licence</span>
          <select
            value={license}
            onChange={(e) => setLicense(e.target.value)}
            className="mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
          >
            {LICENSES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>

        <p className="text-xs text-gray-500 sm:col-span-2 lg:col-span-2 self-end">
          The watermarked preview is public. The full-resolution file is only released
          after purchase.
        </p>
      </div>

      {/* Source picker */}
      <div className="flex flex-wrap gap-2">
        <Tab active={source === "AI_IMAGE"} onClick={() => setSource("AI_IMAGE")} icon={Sparkles}>
          Generate with AI
        </Tab>
        <Tab active={source === "STOCK_IMPORT"} onClick={() => setSource("STOCK_IMPORT")} icon={Search}>
          Stock library
        </Tab>
        <Tab active={source === "UPLOAD"} onClick={() => setSource("UPLOAD")} icon={Upload}>
          Upload a file
        </Tab>
      </div>

      {/* AI */}
      {source === "AI_IMAGE" && (
        <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="text-gray-400">Model</span>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id} disabled={m.ready === false}>
                    {m.label}
                    {m.ready === false ? " — no API key" : ""}
                  </option>
                ))}
              </select>
              <span className="text-xs text-gray-500">
                {models.find((m) => m.id === model)?.hint}
              </span>
            </label>
            <label className="text-sm">
              <span className="text-gray-400">Shape</span>
              <select
                value={aspect}
                onChange={(e) => setAspect(e.target.value)}
                className="mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
              >
                {shapes.map((sh) => (
                  <option key={sh.id} value={sh.id}>
                    {sh.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="text-sm block">
            <span className="text-gray-400">Prompt</span>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder="A minimal flat-lay of accounting tools on a pale desk, soft daylight, top-down"
              className="mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={generate}
              disabled={disabled || busy !== null}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-white text-sm font-medium"
            >
              {busy === "generate" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              Generate one
            </button>
            <button
              onClick={() => setBatchOpen((v) => !v)}
              disabled={disabled}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg text-white text-sm"
            >
              <Layers className="w-4 h-4" />
              {batchOpen ? "Hide batch" : "Batch mode"}
            </button>
          </div>

          {batchOpen && (
            <div className="border-t border-gray-700 pt-3 space-y-3">
              <label className="text-sm block">
                <span className="text-gray-400">One prompt per line</span>
                <textarea
                  value={batchText}
                  onChange={(e) => setBatchText(e.target.value)}
                  rows={5}
                  placeholder={"coffee shop interior, warm morning light\nteam meeting in a bright office\nstack of coins on a white desk"}
                  className="mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white font-mono text-xs"
                />
              </label>
              <p className="text-xs text-amber-300/80 inline-flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
                Every line spends generation credit. Results are created as{" "}
                <strong className="mx-1">Pending review</strong> so you approve them before
                buyers see them.
              </p>
              <button
                onClick={runBatch}
                disabled={batchRunning || busy !== null}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-white text-sm font-medium"
              >
                {batchRunning ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Layers className="w-4 h-4" />
                )}
                Run batch
              </button>

              {batch.length > 0 && (
                <ul className="space-y-1 text-xs">
                  {batch.map((b, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="w-16 shrink-0 text-gray-500">
                        {b.state === "waiting" && "waiting"}
                        {b.state === "running" && "running…"}
                        {b.state === "done" && <span className="text-emerald-400">done</span>}
                        {b.state === "failed" && <span className="text-red-400">failed</span>}
                      </span>
                      <span className="text-gray-300 truncate">{b.prompt}</span>
                      {b.note && <span className="text-gray-500">— {b.note}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* Stock */}
      {source === "STOCK_IMPORT" && (
        <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {(["resources", "icons", "videos"] as const).map((k) => (
              <button
                key={k}
                onClick={() => {
                  setKind(k);
                  setResults([]);
                }}
                className={`px-3 py-1.5 rounded-lg text-sm ${
                  kind === k ? "bg-indigo-600 text-white" : "bg-gray-900 text-gray-300 hover:bg-gray-700"
                }`}
              >
                {k === "resources" ? "Photos & vectors" : k === "icons" ? "Icons" : "Videos"}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder="Search the library…"
              className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
            />
            <button
              onClick={search}
              disabled={stockDisabled || searching}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-white text-sm"
            >
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Search
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Searching is free. Importing an item spends one download from your plan.
          </p>

          {results.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {results.map((r) => (
                <div key={String(r.id)} className="bg-gray-900 border border-gray-700 rounded-lg overflow-hidden">
                  <div className="aspect-square bg-gray-950 flex items-center justify-center overflow-hidden">
                    {r.thumbnail ? (
                      // Remote stock thumbnails from an external CDN.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.thumbnail} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-gray-600 text-xs">no preview</span>
                    )}
                  </div>
                  <div className="p-2 space-y-1">
                    <p className="text-[11px] text-gray-300 line-clamp-2" title={r.title}>
                      {r.title}
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => importItem(r)}
                        disabled={busy !== null}
                        className="flex-1 px-2 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded text-white text-[11px]"
                      >
                        {busy === `import-${r.id}` ? "Importing…" : "Import"}
                      </button>
                      {r.sourceUrl && (
                        <a
                          href={r.sourceUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="p-1 text-gray-500 hover:text-gray-300"
                          title="View on Magnific"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Upload */}
      {source === "UPLOAD" && (
        <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 space-y-3">
          <label className="text-sm block">
            <span className="text-gray-400">Choose a file (max 25MB)</span>
            <input
              type="file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
                e.target.value = "";
              }}
              disabled={busy !== null}
              className="mt-1 w-full text-sm text-gray-300 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-indigo-600 file:text-white hover:file:bg-indigo-500"
            />
          </label>
          {busy === "upload" && (
            <p className="text-sm text-gray-400 inline-flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Storing and watermarking…
            </p>
          )}
          <p className="text-xs text-gray-500">
            Images get a watermarked preview automatically. Videos, audio and documents keep
            their file — add a cover image on the listing afterwards.
          </p>
        </div>
      )}

      {/* Draft review */}
      {asset && meta && (
        <div className="bg-gray-800/60 border border-indigo-500/40 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-medium inline-flex items-center gap-2">
              <Check className="w-5 h-5 text-emerald-400" />
              Review and publish
            </h2>
            <button onClick={resetDraft} className="text-gray-400 hover:text-white text-sm">
              Discard
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-[220px_1fr]">
            <div className="space-y-2">
              <div className="aspect-square bg-gray-950 rounded-lg overflow-hidden border border-gray-700 flex items-center justify-center">
                {asset.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={mediaSrc(asset.previewUrl)}
                    alt="Watermarked preview"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <span className="text-amber-300/80 text-[11px] px-3 text-center">
                    {/* The reason, not just the absence. Publishing needs a
                        preview, so a blank box with no explanation left the
                        admin guessing at a 400 they could not act on. */}
                    {asset.previewError ?? "No image preview for this file type"}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-500">
                {asset.width && asset.height ? `${asset.width}×${asset.height} preview · ` : ""}
                {(asset.bytes / 1024 / 1024).toFixed(2)}MB deliverable
              </p>
            </div>

            <div className="space-y-3">
              <label className="text-sm block">
                <span className="text-gray-400">Title</span>
                <input
                  value={meta.title}
                  onChange={(e) => setMeta({ ...meta, title: e.target.value })}
                  maxLength={100}
                  className="mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
                />
              </label>
              <label className="text-sm block">
                <span className="text-gray-400">Short description</span>
                <textarea
                  value={meta.description}
                  onChange={(e) => setMeta({ ...meta, description: e.target.value })}
                  rows={2}
                  maxLength={1000}
                  className="mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
                />
              </label>
              <label className="text-sm block">
                <span className="text-gray-400">Full description (markdown)</span>
                <textarea
                  value={meta.richDescription}
                  onChange={(e) => setMeta({ ...meta, richDescription: e.target.value })}
                  rows={6}
                  className="mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs font-mono"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm block">
                  <span className="text-gray-400">Keywords (comma separated)</span>
                  <input
                    value={meta.keywords.join(", ")}
                    onChange={(e) =>
                      setMeta({
                        ...meta,
                        keywords: e.target.value
                          .split(",")
                          .map((k) => k.trim())
                          .filter(Boolean),
                      })
                    }
                    className="mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
                  />
                </label>
                <label className="text-sm block">
                  <span className="text-gray-400">Niche</span>
                  <input
                    value={meta.niche}
                    onChange={(e) => setMeta({ ...meta, niche: e.target.value })}
                    className="mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
                  />
                </label>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  onClick={publish}
                  disabled={busy !== null || !priceValid}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-white text-sm font-medium"
                >
                  {busy === "publish" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  Publish at ${priceValid ? priceNum.toFixed(2) : "—"}
                </button>
                <button
                  onClick={rerollCopy}
                  disabled={busy !== null || !geminiReady}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg text-white text-sm"
                >
                  {busy === "copy" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  Rewrite copy
                </button>
              </div>
            </div>
          </div>

          {/* Animate this still into a clip. Only for an image we can hand to
              the model as a first frame. */}
          {asset.width !== null && videoModels.length > 0 && (
            <div className="border-t border-gray-700 pt-4 space-y-3">
              <h3 className="text-white text-sm font-medium inline-flex items-center gap-2">
                <Film className="w-4 h-4 text-indigo-400" />
                Turn this into a video
              </h3>
              <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
                <label className="text-sm">
                  <span className="text-gray-400">Model</span>
                  <select
                    value={videoModel}
                    onChange={(e) => setVideoModel(e.target.value)}
                    className="mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
                  >
                    {videoModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-gray-500">
                    {videoModels.find((m) => m.id === videoModel)?.hint}
                  </span>
                </label>
                <label className="text-sm">
                  <span className="text-gray-400">Describe the motion</span>
                  <textarea
                    value={videoPrompt}
                    onChange={(e) => setVideoPrompt(e.target.value)}
                    rows={2}
                    placeholder="Slow push in, steam rising from the cup, gentle light flicker"
                    className="mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
                  />
                </label>
              </div>
              <p className="text-xs text-gray-500">
                A clip takes minutes, so nothing waits here. It is filed as a
                <strong className="mx-1">Stock video</strong> listing in
                <strong className="mx-1">Pending review</strong> straight away, and the
                scheduler attaches the file when it is ready — no webhook involved.
              </p>
              <button
                onClick={queueVideo}
                disabled={busy !== null || !priceValid}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-white text-sm font-medium"
              >
                {busy === "video" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Film className="w-4 h-4" />
                )}
                Queue clip at ${priceValid ? priceNum.toFixed(2) : "—"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function blankMeta(subject: string): Metadata {
  return {
    title: subject.slice(0, 100),
    description: "",
    richDescription: "",
    keywords: [],
    niche: "",
  };
}

function Tab({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm ${
        active ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"
      }`}
    >
      <Icon className="w-4 h-4" />
      {children}
    </button>
  );
}

function Banner({ tone, children }: { tone: "warn" | "info"; children: React.ReactNode }) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 text-sm ${
        tone === "warn"
          ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
          : "border-sky-500/40 bg-sky-500/10 text-sky-200"
      }`}
    >
      {children}
    </div>
  );
}
