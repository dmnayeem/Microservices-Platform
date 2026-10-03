/**
 * Display-image policy (src/lib/image-policy.ts) — compressor + wiring.
 *
 * (a) Runs the server compressor on images generated in memory with sharp
 *     (photo 4000×3000 with an EXIF rotation, desktop text screenshot, phone
 *     screenshot, transparent PNG, small animated GIF, SVG, deliverable) and
 *     checks ≤ 100 KB, dimension caps, legibility floor, alpha, originals.
 * (b) Statically checks every display uploader / route goes through the policy
 *     and that marketplace deliverables are excluded.
 *
 * Read-only: no DB, no S3, no network. Writes preview PNGs only when
 * IMAGE_POLICY_OUT=<dir> is set (for eyeballing quality).
 *
 *   npx tsx --tsconfig tsconfig.script.json scripts/verify-image-policy.ts
 */
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";
import sharp from "sharp";
import { enforceDisplayImage } from "../src/lib/image-compress-server";
import {
  DISPLAY_MAX_BYTES,
  PURPOSE_MAX_EDGE,
  isAnimatedGif,
  purposeForFolder,
  resolvePurpose,
} from "../src/lib/image-policy";

let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : `  → ${JSON.stringify(detail)}`}`);
  if (!ok) failed++;
}
const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
const OUT = process.env.IMAGE_POLICY_OUT;

/* ── Fixtures ── */

/** Photo-like: smooth colour fields + texture + fine sensor noise, EXIF orientation 6. */
async function photo(): Promise<Buffer> {
  const W = 4000;
  const H = 3000;
  const raw = Buffer.alloc(W * H * 3);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      const sky = y < H * 0.45;
      const t = Math.sin(x / 37) * Math.cos(y / 23) * 18 + Math.sin((x + y) / 9) * 6;
      const n = (rnd() - 0.5) * 22;
      const r = sky ? 90 + (y / H) * 120 : 70 + Math.sin(x / 300) * 40 + t;
      const g = sky ? 140 + (y / H) * 80 : 110 + Math.cos(y / 210) * 35 + t;
      const b = sky ? 230 - (y / H) * 60 : 50 + t;
      raw[i] = Math.max(0, Math.min(255, r + n));
      raw[i + 1] = Math.max(0, Math.min(255, g + n));
      raw[i + 2] = Math.max(0, Math.min(255, b + n));
    }
  }
  return sharp(raw, { raw: { width: W, height: H, channels: 3 } })
    .jpeg({ quality: 92 })
    .withMetadata({ orientation: 6 }) // stored landscape, displays portrait
    .toBuffer();
}

function textSvg(W: number, H: number, lines: number, size: number): Buffer {
  const rows: string[] = [];
  for (let i = 0; i < lines; i++) {
    const y = 60 + i * (size + 10);
    rows.push(
      `<text x="40" y="${y}" font-family="Arial, sans-serif" font-size="${size}" fill="${i % 7 === 0 ? "#1a56db" : "#111"}">` +
        `Order #${10_000 + i} — Task proof: followed @revtype, liked post ${i}, comment “great work” at 12:${String(i % 60).padStart(2, "0")} PM</text>`
    );
  }
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
      `<rect width="100%" height="100%" fill="#fff"/><rect x="0" y="0" width="${W}" height="44" fill="#f3f4f6"/>` +
      rows.join("") +
      `</svg>`
  );
}

const desktopShot = () => sharp(textSvg(1920, 1080, 38, 18)).png().toBuffer();
const phoneShot = () => sharp(textSvg(1080, 2400, 60, 30)).png().toBuffer();

async function transparentPng(): Promise<Buffer> {
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="2000">` +
      `<circle cx="1000" cy="1000" r="800" fill="#7c3aed" fill-opacity="0.85"/>` +
      `<rect x="500" y="500" width="1000" height="1000" rx="120" fill="#22d3ee" fill-opacity="0.6"/>` +
      `<text x="1000" y="1060" text-anchor="middle" font-size="160" font-family="Arial" fill="#fff">RevType</text></svg>`
  );
  return sharp(svg).png().toBuffer();
}

async function animatedGif(): Promise<Buffer | null> {
  try {
    const frames = await Promise.all(
      ["#ef4444", "#22c55e", "#3b82f6"].map((c) =>
        sharp({ create: { width: 120, height: 80, channels: 4, background: c } }).png().toBuffer()
      )
    );
    return await sharp(frames, { join: { animated: true } }).gif({ delay: [200, 200, 200] }).toBuffer();
  } catch (err) {
    console.log("SKIP  animated gif fixture —", (err as Error).message);
    return null;
  }
}

async function main() {
  /* ── (a) compressor ── */
  const photoIn = await photo();
  const p = await enforceDisplayImage(photoIn, "image/jpeg", "IMG_0001.JPG", "post");
  const pm = await sharp(p.buffer).metadata();
  console.log(`      photo ${kb(photoIn.length)} 4000×3000 → ${kb(p.buffer.length)} ${pm.width}×${pm.height} ${pm.format}`);
  check("photo ≤ 100 KB", p.buffer.length <= DISPLAY_MAX_BYTES, kb(p.buffer.length));
  check("photo is WebP", pm.format === "webp" && p.mime === "image/webp" && p.fileName === "IMG_0001.webp", [pm.format, p.fileName]);
  check("photo long edge ≤ 1600", Math.max(pm.width!, pm.height!) <= PURPOSE_MAX_EDGE.post, [pm.width, pm.height]);
  check("photo EXIF orientation applied (portrait)", pm.height! > pm.width!, [pm.width, pm.height]);
  check("photo EXIF stripped", !pm.exif && (pm.orientation ?? 1) === 1);

  const av = await enforceDisplayImage(photoIn, "image/jpeg", "me.jpg", "avatar");
  const am = await sharp(av.buffer).metadata();
  check("avatar ≤ 100 KB and ≤ 512 px", av.buffer.length <= DISPLAY_MAX_BYTES && Math.max(am.width!, am.height!) <= 512, [kb(av.buffer.length), am.width, am.height]);

  const thumb = await enforceDisplayImage(photoIn, "image/jpeg", "t.jpg", "thumbnail");
  const tm = await sharp(thumb.buffer).metadata();
  check("thumbnail ≤ 100 KB and ≤ 1080 px", thumb.buffer.length <= DISPLAY_MAX_BYTES && Math.max(tm.width!, tm.height!) <= 1080, [kb(thumb.buffer.length), tm.width, tm.height]);

  const shotIn = await desktopShot();
  const s = await enforceDisplayImage(shotIn, "image/png", "shot.png", "proof");
  const sm = await sharp(s.buffer).metadata();
  console.log(`      desktop screenshot ${kb(shotIn.length)} 1920×1080 → ${kb(s.buffer.length)} ${sm.width}×${sm.height}`);
  check("screenshot ≤ 100 KB", s.buffer.length <= DISPLAY_MAX_BYTES, kb(s.buffer.length));
  check("screenshot still ≥ 1200 px wide", (sm.width ?? 0) >= 1200, sm.width);

  const phoneIn = await phoneShot();
  const ph = await enforceDisplayImage(phoneIn, "image/png", "phone.png", "proof");
  const phm = await sharp(ph.buffer).metadata();
  console.log(`      phone screenshot ${kb(phoneIn.length)} 1080×2400 → ${kb(ph.buffer.length)} ${phm.width}×${phm.height}`);
  check("phone screenshot ≤ 100 KB, long edge ≥ 1200", ph.buffer.length <= DISPLAY_MAX_BYTES && Math.max(phm.width!, phm.height!) >= 1200, [kb(ph.buffer.length), phm.width, phm.height]);

  const pngIn = await transparentPng();
  const t = await enforceDisplayImage(pngIn, "image/png", "logo.png", "cover");
  const tmeta = await sharp(t.buffer).metadata();
  console.log(`      transparent png ${kb(pngIn.length)} 2000×2000 → ${kb(t.buffer.length)} ${tmeta.width}×${tmeta.height}`);
  check("transparent PNG → WebP ≤ 100 KB", t.buffer.length <= DISPLAY_MAX_BYTES && tmeta.format === "webp", [kb(t.buffer.length), tmeta.format]);
  check("transparent PNG keeps alpha", !!tmeta.hasAlpha);
  const corner = await sharp(t.buffer).ensureAlpha().extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
  check("transparent corner still transparent", corner[3] === 0, [...corner]);

  // Already within policy → stored untouched (no second lossy pass).
  const again = await enforceDisplayImage(p.buffer, "image/webp", "IMG_0001.webp", "post");
  check("already-compressed WebP stored untouched", !again.changed && again.buffer === p.buffer, again.note);

  // ORIGINALS — byte-for-byte.
  const del = await enforceDisplayImage(photoIn, "image/jpeg", "stock.jpg", "deliverable");
  check("deliverable image byte-for-byte", !del.changed && del.buffer.equals(photoIn) && del.mime === "image/jpeg");
  const doc = await enforceDisplayImage(pngIn, "image/png", "receipt.png", "document");
  check("document image byte-for-byte", !doc.changed && doc.buffer.equals(pngIn));

  // SVG and animated GIF.
  const svg = textSvg(800, 200, 2, 20);
  const sv = await enforceDisplayImage(svg, "image/svg+xml", "logo.svg", "media");
  check("SVG untouched", !sv.changed && sv.buffer.equals(svg));
  const gif = await animatedGif();
  if (gif) {
    check("fixture GIF detected as animated", isAnimatedGif(gif));
    const g = await enforceDisplayImage(gif, "image/gif", "ad.gif", "media");
    check("small animated GIF kept as-is", !g.changed && g.buffer.equals(gif), g.note);
  }

  // Folder → purpose defaults.
  check("folder marketplace → deliverable", purposeForFolder("marketplace") === "deliverable");
  check("folder kyc → document", purposeForFolder("kyc") === "document");
  check("folder avatars/posts/task-proofs/ads", [
    purposeForFolder("avatars"), purposeForFolder("posts"), purposeForFolder("task-proofs"), purposeForFolder("ads"),
  ].join() === "avatar,post,proof,cover");
  check("explicit purpose wins; junk ignored", resolvePurpose("cover", "marketplace") === "cover" && resolvePurpose("nope", "posts") === "post");

  if (OUT) {
    mkdirSync(OUT, { recursive: true });
    // Decode the stored WebP and save as PNG (lossless) to inspect what users see.
    await sharp(p.buffer).png().toFile(join(OUT, "policy-photo.png"));
    await sharp(s.buffer).png().toFile(join(OUT, "policy-screenshot.png"));
    await sharp(s.buffer).extract({ left: 0, top: 0, width: 800, height: 300 }).png().toFile(join(OUT, "policy-screenshot-crop.png"));
    await sharp(ph.buffer).extract({ left: 0, top: 0, width: Math.min(700, phm.width!), height: 300 }).png().toFile(join(OUT, "policy-phone-crop.png"));
    await sharp(t.buffer).png().toFile(join(OUT, "policy-alpha.png"));
    writeFileSync(join(OUT, "policy-photo-original.jpg"), await sharp(photoIn).rotate().resize(1200).jpeg({ quality: 95 }).toBuffer());
    console.log(`      previews written to ${OUT}`);
  }

  /* ── (b) wiring ── */
  const root = join(__dirname, "..");
  const read = (f: string) => readFileSync(join(root, f), "utf8");

  for (const f of [
    "src/app/api/upload/route.ts",
    "src/app/api/media/upload/route.ts",
    "src/app/api/profile/photo/route.ts",
    "src/app/api/admin/ai/generate-image/route.ts",
    "src/lib/marketplace-studio.ts",
  ]) {
    check(`server backstop in ${f}`, /enforceDisplayImage\(/.test(read(f)));
  }
  check("PUT /api/upload enforces before uploadFile", (() => {
    const s2 = read("src/app/api/upload/route.ts");
    return s2.indexOf("enforceDisplayImage(") > 0 && s2.indexOf("enforceDisplayImage(") < s2.indexOf("uploadFile(key, stored.buffer");
  })());
  check("safety inspection still runs before the re-encode", (() => {
    const s2 = read("src/app/api/upload/route.ts");
    return s2.indexOf("inspectUpload(") > 0 && s2.indexOf("inspectUpload(") < s2.indexOf("enforceDisplayImage(");
  })());

  // Every client file that uploads through our direct routes must name a purpose / compress.
  const files: string[] = [];
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const full = join(d, n);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(n)) files.push(full);
    }
  };
  walk(join(root, "src"));
  const DOCUMENT_UPLOADERS: Record<string, RegExp> = {
    // folder implies "document" on the server (purposeForFolder) → original kept.
    "src/app/(main)/profile/become-tutor/_components/BecomeTutorForm.tsx": /"tutor-applications"/,
    "src/components/user/courses/player/AssignmentSubmitter.tsx": /"assignment-submissions"/,
  };
  for (const full of files) {
    const rel = relative(root, full).replace(/\\/g, "/");
    if (rel.startsWith("src/app/api/")) continue;
    const src = readFileSync(full, "utf8");
    if (!/fetch\(\s*["'`]\/api\/(media\/upload|upload|profile\/photo)["'`]/.test(src)) continue;
    if (rel === "src/lib/user-upload.ts") {
      check(`${rel} compresses by purpose`, /compressForPurpose\(/.test(src) && /append\("purpose"/.test(src));
      continue;
    }
    const doc = DOCUMENT_UPLOADERS[rel];
    if (doc) {
      check(`${rel} is a document uploader (original kept)`, doc.test(src) && purposeForFolder(doc.source.replace(/"/g, "")) === "document");
      continue;
    }
    check(`${rel} compresses before upload`, /compressFor(Purpose|Upload)\(/.test(src));
  }
  check("admin media library uploader compresses", /compressForPurpose\(/.test(read("src/lib/s3-multipart-upload.ts")));

  // Deliverables are excluded.
  const cl = read("src/components/user/marketplace/create-listing-view.tsx");
  const addDel = cl.slice(cl.indexOf("const addDeliverable"), cl.indexOf("const submit"));
  check("seller deliverable upload is purpose: deliverable", /purpose: "deliverable"/.test(addDel));
  check("seller gallery upload is a display purpose", /uploadUserFile\(f, "marketplace", \{ purpose: "cover" \}\)/.test(cl));
  check("seller screenshot fields are a display purpose", /purpose: "proof"/.test(cl) && !/uploadFn=\{uploadUserFile\}/.test(cl));
  const el = read("src/app/admin/marketplace/[id]/edit/_components/EditListingForm.tsx");
  const prod = el.slice(el.indexOf("const uploadProductFile"), el.indexOf("const [mediaPickerOpen"));
  check("admin product-file upload is purpose: deliverable", /purpose: "deliverable"/.test(prod));
  const studio = read("src/lib/marketplace-studio.ts");
  check("studio stores the deliverable raw bytes", /uploadFile\(fileKey, input\.bytes, input\.contentType\)/.test(studio));
  check("studio compresses only the preview", (studio.match(/enforceDisplayImage\(/g) ?? []).length === 1 && /wm\.buffer/.test(studio.slice(studio.indexOf("enforceDisplayImage("))));
  for (const f of [
    "src/app/api/admin/marketplace/studio/upload/route.ts",
    "src/app/admin/marketplace/studio/_components/StudioClient.tsx",
    "src/app/api/admin/company-finance/receipts/route.ts",
    "src/app/api/upload/multipart/route.ts",
  ]) {
    check(`${f} does not compress (original)`, !/image-compress|enforceDisplayImage|compressFor/.test(read(f)));
  }
  const lf = read("src/components/admin/marketplace/listing-form/MarketplaceListingForm.tsx");
  check("admin listing attachments keep originals", /set\("attachments", next\)\}\s*uploadEnabled\s*purpose="document"/.test(lf));

  console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
