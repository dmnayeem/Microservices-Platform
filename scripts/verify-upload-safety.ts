/**
 * Upload safety — the sniffer, name rules, ZIP inspector and serve headers,
 * checked on in-memory buffers. Read-only: no DB, no S3, no network.
 *
 *   npx tsx --tsconfig tsconfig.script.json scripts/verify-upload-safety.ts
 */
import { deflateRawSync } from "node:zlib";
import { randomBytes } from "node:crypto";
import {
  sniffBytes,
  checkUploadName,
  inspectUpload,
  inspectZip,
  listZipEntries,
  safeServeHeaders,
  svgHasActiveContent,
} from "../src/lib/upload-safety";
import { validateSettingValues } from "../src/lib/setting-guards";

let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : `  → ${JSON.stringify(detail)}`}`);
  if (!ok) failed++;
}

/* ── Minimal fixtures ── */
const bytes = (...a: number[]) => Buffer.from(a);
const pad = (b: Buffer, n = 64) => Buffer.concat([b, Buffer.alloc(n)]);

const PE = pad(Buffer.concat([Buffer.from("MZ"), Buffer.alloc(58), bytes(0x80, 0, 0, 0), Buffer.from("PE\0\0")]));
const ELF = pad(bytes(0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0));
const MACHO = pad(bytes(0xcf, 0xfa, 0xed, 0xfe, 7, 0, 0, 1));
const JPEG = pad(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46));
const PNG = pad(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a));
const PDF = Buffer.from("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n");
const PDF_LAUNCH = Buffer.from("%PDF-1.4\n1 0 obj << /OpenAction << /S /Launch /F (cmd.exe) >> >> endobj\n");
const MP4 = pad(Buffer.concat([bytes(0, 0, 0, 0x18), Buffer.from("ftypmp42")]));
const HTML = Buffer.from("  <!DOCTYPE html><html><body><script>alert(1)</script></body></html>");
const SVG = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>');
const SVG_JS = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect/></svg>');
const SHEBANG = Buffer.from("#!/bin/sh\nrm -rf /\n");

/** Build a real ZIP (deflate or stored) from entries. */
function zip(entries: { name: string; data: Buffer; store?: boolean; encrypted?: boolean; fakeUncompressed?: number }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const comp = e.store ? e.data : deflateRawSync(e.data);
    const method = e.store ? 0 : 8;
    const flags = 0x800 | (e.encrypted ? 1 : 0);
    const uncomp = e.fakeUncompressed ?? e.data.length;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(flags, 6);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(uncomp, 22);
    lh.writeUInt16LE(name.length, 26);
    locals.push(lh, name, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(flags, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(uncomp, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, name);
    offset += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

console.log("\n1. Sniffer — the bytes decide");
check("PE header → executable", sniffBytes(PE)?.family === "executable");
check("ELF → executable", sniffBytes(ELF)?.family === "executable");
check("Mach-O → executable", sniffBytes(MACHO)?.family === "executable");
check("#! script → script", sniffBytes(SHEBANG)?.family === "script");
check("JPEG → image", sniffBytes(JPEG)?.family === "image");
check("PNG → image", sniffBytes(PNG)?.family === "image");
check("PDF → pdf", sniffBytes(PDF)?.family === "pdf");
check("MP4 → video", sniffBytes(MP4)?.family === "video");
check("HTML (leading spaces) → html", sniffBytes(HTML)?.family === "html");
check("SVG → svg", sniffBytes(SVG)?.family === "svg");
check("ZIP → zip", sniffBytes(zip([{ name: "a.txt", data: Buffer.from("hi") }]))?.family === "zip");
check("plain text → unknown (null, never a block reason)", sniffBytes(Buffer.from("hello world, just text")) === null);
check("SVG with onload → active content", svgHasActiveContent(SVG_JS) && !svgHasActiveContent(SVG));

console.log("\n2. Disguised programs are always refused");
{
  const v1 = inspectUpload("invoice.pdf", "application/pdf", PE);
  check("PE renamed invoice.pdf → blocked", v1.block.length > 0, v1);
  const v2 = inspectUpload("photo.jpg", "image/jpeg", ELF);
  check("ELF renamed photo.jpg → blocked", v2.block.length > 0, v2);
  const v3 = inspectUpload("pack.zip", "application/zip", MACHO);
  check("Mach-O renamed pack.zip → blocked", v3.block.length > 0, v3);
  const v4 = inspectUpload("photo.png", "image/png", HTML);
  check("HTML renamed photo.png → blocked", v4.block.length > 0, v4);
  const v5 = inspectUpload("photo.jpg", "image/jpeg", zip([{ name: "a.txt", data: Buffer.from("x") }]));
  check("ZIP renamed photo.jpg → blocked (family mismatch)", v5.block.length > 0, v5);
  const v6 = inspectUpload("logo.png", "image/png", SVG);
  check("SVG in a user image slot → blocked", v6.block.length > 0, v6);
  const v7 = inspectUpload("logo.svg", "image/svg+xml", SVG, { allowSvg: true });
  check("plain SVG on an admin path → allowed", v7.block.length === 0 && v7.flags.length === 0, v7);
  const v8 = inspectUpload("logo.svg", "image/svg+xml", SVG_JS, { allowSvg: true });
  check("SVG with script on an admin path → blocked", v8.block.length > 0, v8);
}

console.log("\n3. Names");
check("x.pdf.exe → blocked", checkUploadName("x.pdf.exe", "application/pdf").block.length > 0);
check("run.sh → blocked", checkUploadName("run.sh", "application/zip").block.length > 0);
check("app.apk → blocked", checkUploadName("app.apk", "application/zip").block.length > 0);
check("trailing dot trick 'x.exe.' → blocked", checkUploadName("x.exe.", "application/pdf").block.length > 0);
check("RTL override name → blocked", checkUploadName("inv\u202Egpj.exe", "image/jpeg").block.length > 0);
check("setup.exe.zip → flagged (not blocked)", (() => { const n = checkUploadName("setup.exe.zip", "application/zip"); return n.block.length === 0 && n.flags.length > 0; })());
check(".zip sent as image/png → blocked", checkUploadName("a.zip", "image/png").block.length > 0);
check("declared application/x-msdownload → blocked", checkUploadName("a", "application/x-msdownload").block.length > 0);

console.log("\n4. Legitimate files pass untouched");
for (const [name, type, b] of [
  ["photo.jpg", "image/jpeg", JPEG],
  ["photo.png", "image/jpeg", JPEG], // renamed within a class — fine
  ["IMG_0001.PNG", "image/png", PNG],
  ["clip.mp4", "video/mp4", MP4],
  ["clip.mov", "video/quicktime", MP4],
  ["book.pdf", "application/pdf", PDF],
  ["notes", "application/pdf", PDF],
  ["template.zip", "application/zip", zip([
    { name: "index.html", data: Buffer.from("<html></html>") },
    { name: "js/app.js", data: Buffer.from("console.log(1)") },
    { name: "install.sh", data: Buffer.from("#!/bin/sh\necho hi") },
    { name: "img/logo.png", data: PNG },
  ])],
] as const) {
  const v = inspectUpload(name, type, b);
  check(`${name} (${type}) → accepted, no flags`, v.block.length === 0 && v.flags.length === 0, v);
}

console.log("\n5. ZIP inspector");
{
  const exeZip = zip([{ name: "readme.txt", data: Buffer.from("hi") }, { name: "bin/setup.exe", data: PE }]);
  const r1 = inspectZip(exeZip);
  check("zip with an .exe entry → programFiles + finding", r1.programFiles.includes("bin/setup.exe") && r1.findings.length > 0, r1);
  const v1 = inspectUpload("pack.zip", "application/zip", exeZip);
  check("…and inspectUpload flags (not blocks) it — policy decides", v1.block.length === 0 && v1.flags.length > 0, v1);

  const slip = inspectZip(zip([{ name: "../../etc/cron.d/x", data: Buffer.from("x") }]));
  check("zip slip (../) → finding", slip.findings.some((f) => f.includes("zip slip")), slip);
  const slip2 = inspectZip(zip([{ name: "C:/Windows/evil.txt", data: Buffer.from("x") }]));
  check("absolute drive path → finding", slip2.findings.some((f) => f.includes("zip slip")), slip2);

  const disguised = inspectZip(zip([{ name: "photos/cat.jpg", data: PE }]));
  check("PE hiding as cat.jpg inside a zip → finding", disguised.findings.some((f) => f.includes("disguised")), disguised);
  const disguisedStored = inspectZip(zip([{ name: "cat.jpg", data: ELF, store: true }]));
  check("…also when stored (no compression)", disguisedStored.findings.some((f) => f.includes("disguised")), disguisedStored);

  const nested = inspectZip(zip([{ name: "inner.zip", data: zip([{ name: "evil.scr", data: PE }]) }]));
  check("nested zip with a program → reported through the nesting", nested.programFiles.some((p) => p.includes("inner.zip → evil.scr")), nested);

  const enc = inspectZip(zip([{ name: "secret.docx", data: Buffer.from("xx"), encrypted: true, store: true }]));
  check("encrypted entry → finding", enc.findings.some((f) => f.includes("password")), enc);

  const bomb = inspectZip(zip([{ name: "big.bin.txt", data: Buffer.alloc(1000), fakeUncompressed: 3_000_000_000 }]));
  check("extreme ratio / size → zip bomb finding", bomb.findings.some((f) => f.includes("zip bomb")), bomb);

  const macro = inspectZip(zip([{ name: "word/document.xml", data: Buffer.from("<w/>") }, { name: "word/vbaProject.bin", data: Buffer.from("x") }]));
  check("docm with vbaProject.bin → macro finding", macro.findings.some((f) => f.includes("macros")), macro);

  const rar = inspectZip(zip([{ name: "stuff.rar", data: Buffer.from("Rar!\x1a\x07\x00") }]));
  check("nested .rar → 'can't be checked' finding", rar.findings.some((f) => f.includes("can't be checked")), rar);

  // Tail-only read (how a large S3 object is inspected).
  const big = zip([{ name: "a.txt", data: randomBytes(200_000) }, { name: "tool.exe", data: PE }]);
  const tailStart = big.length - 4096;
  const tail = listZipEntries(big.subarray(tailStart), tailStart, big.length);
  check("central directory read from the tail only", tail.entries.map((e) => e.name).join(",") === "a.txt,tool.exe", tail);

  check("not a zip → error, no throw", !!inspectZip(Buffer.from("garbage")).error);
}

console.log("\n6. PDF");
check("PDF with /Launch → flagged", inspectUpload("a.pdf", "application/pdf", PDF_LAUNCH).flags.length > 0);

console.log("\n7. Serve-side headers (/api/media proxy)");
{
  const img = safeServeHeaders("image/png", "media/images/a.png");
  check("image → inline, nosniff", !img["Content-Disposition"] && img["X-Content-Type-Options"] === "nosniff" && img["Content-Type"] === "image/png");
  const vid = safeServeHeaders("video/mp4", "posts/u/a.mp4");
  check("video → inline", !vid["Content-Disposition"] && vid["Content-Type"] === "video/mp4");
  const pdf = safeServeHeaders("application/pdf", "media/documents/a.pdf");
  check("pdf → inline (the app previews PDFs)", !pdf["Content-Disposition"] && pdf["Content-Type"] === "application/pdf");
  const html = safeServeHeaders("text/html", "task-proofs/u/x.html");
  check("html → attachment + octet-stream + sandbox", /^attachment/.test(html["Content-Disposition"] ?? "") && html["Content-Type"] === "application/octet-stream" && /sandbox/.test(html["Content-Security-Policy"] ?? ""));
  const svg = safeServeHeaders("image/svg+xml", "media/images/logo.svg");
  check("svg → inline for <img> but sandboxed", !svg["Content-Disposition"] && /sandbox/.test(svg["Content-Security-Policy"] ?? ""));
  const unk = safeServeHeaders(undefined, 'media/other/a"b.bin');
  check("unknown → attachment with a safe filename", unk["Content-Disposition"] === 'attachment; filename="a_b.bin"');
}

console.log("\n8. Setting guards");
check("policy 'review' accepted", validateSettingValues({ "security.upload_archive_policy": "review" }).length === 0);
check("policy 'nuke' rejected", validateSettingValues({ "security.upload_archive_policy": "nuke" }).length === 1);
check("VirusTotal key of 64 hex accepted", validateSettingValues({ "security.virustotal_api_key": "a".repeat(64) }).length === 0);
check("VirusTotal key with spaces/symbols rejected", validateSettingValues({ "security.virustotal_api_key": "not a key!" }).length === 1);
check("empty VirusTotal key accepted (= off)", validateSettingValues({ "security.virustotal_api_key": "" }).length === 0);

console.log(failed ? `\n${failed} FAILED` : "\nAll upload-safety checks passed.");
process.exit(failed ? 1 : 0);
