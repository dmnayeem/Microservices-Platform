import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * Render a course-completion certificate as a PDF (pure-JS, no native binary).
 * A4 landscape with a double indigo border, recipient name, course title,
 * issue date, and serial.
 */
export async function renderCertificatePdf(opts: {
  recipientName: string;
  courseTitle: string;
  serial: string;
  issuedAt: Date;
}): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([842, 595]); // A4 landscape
  const { width, height } = page.getSize();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

  const indigo = rgb(0.31, 0.27, 0.9);
  const dark = rgb(0.1, 0.12, 0.2);
  const gray = rgb(0.4, 0.43, 0.5);

  page.drawRectangle({
    x: 24, y: 24, width: width - 48, height: height - 48,
    borderColor: indigo, borderWidth: 3,
  });
  page.drawRectangle({
    x: 34, y: 34, width: width - 68, height: height - 68,
    borderColor: indigo, borderWidth: 1,
  });

  const clamp = (s: string, max: number) =>
    s.length > max ? s.slice(0, max - 1) + "…" : s;

  const center = (
    text: string,
    y: number,
    f: typeof font,
    size: number,
    color: ReturnType<typeof rgb>
  ) => {
    const w = f.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (width - w) / 2, y, size, font: f, color });
  };

  center("CERTIFICATE OF COMPLETION", height - 140, bold, 26, dark);
  center("This certifies that", height - 200, italic, 14, gray);
  center(clamp(opts.recipientName || "Student", 40), height - 245, bold, 30, indigo);
  center("has successfully completed", height - 295, italic, 14, gray);
  center(clamp(opts.courseTitle, 52), height - 335, bold, 20, dark);
  center(
    `Issued ${opts.issuedAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
    120, font, 12, gray
  );
  center(`Serial: ${opts.serial}`, 96, font, 10, gray);

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
