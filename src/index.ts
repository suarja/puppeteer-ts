import express, { type Request, type Response } from "express";
import puppeteer, { type Browser } from "puppeteer";

/**
 * PDF rendering microservice. Receives an HTML payload from the
 * Be Viral Next.js app (Vercel) and returns a PDF buffer rendered
 * by Puppeteer + the system Chromium provided by Railway's nixpacks
 * build (PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
 * is set in railway.toml).
 *
 * Auth: shared secret in `X-PDF-Secret` header. Set on Railway as the
 * env var PDF_SECRET, and on Vercel as PDF_SERVICE_SECRET. The two
 * must match.
 *
 * Endpoints:
 *   GET  /health  → readiness probe (no auth)
 *   POST /pdf     → render HTML to PDF (auth required)
 */

const PORT = Number(process.env.PORT ?? 3000);
const SECRET = process.env.PDF_SECRET;

if (!SECRET) {
  console.error("[pdf-service] PDF_SECRET env var is required.");
  process.exit(1);
}

const app = express();
// 10MB cap — a guide HTML stays well under that even with inline
// SVG / base64 thumbnails. Adjust if a real client trips it.
app.use(express.json({ limit: "10mb" }));

// Cache one Chromium instance across requests. Cold start is ~1s
// for launch — re-using cuts every subsequent /pdf call to a few
// hundred ms.
let browserPromise: Promise<Browser> | null = null;
async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    });
  }
  return browserPromise;
}

// Re-launch the browser on disconnection (Chromium can crash on rare
// OOM events in Railway containers).
async function getHealthyBrowser(): Promise<Browser> {
  const browser = await getBrowser();
  if (!browser.connected) {
    browserPromise = null;
    return getBrowser();
  }
  return browser;
}

interface PdfRequestBody {
  html?: string;
  filename?: string;
  options?: Record<string, unknown>;
}

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, service: "pdf-renderer" });
});

app.post("/pdf", async (req: Request, res: Response) => {
  const provided = req.headers["x-pdf-secret"];
  if (typeof provided !== "string" || provided !== SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const body = req.body as PdfRequestBody;
  const html = body.html;
  if (typeof html !== "string" || html.trim().length === 0) {
    return res.status(400).json({ error: "html required" });
  }

  const filename = body.filename ?? "document.pdf";
  const options = body.options ?? {};

  const startedAt = Date.now();
  try {
    const browser = await getHealthyBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(html, {
        waitUntil: "networkidle0",
        timeout: 30000,
      });
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: {
          top: "14mm",
          right: "12mm",
          bottom: "14mm",
          left: "12mm",
        },
        ...options,
      });
      const ms = Date.now() - startedAt;
      console.log(
        `[pdf-service] rendered ${pdf.byteLength}B in ${ms}ms — filename=${filename}`,
      );
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(filename)}"`,
      );
      res.send(Buffer.from(pdf));
    } finally {
      await page.close().catch(() => {});
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[pdf-service] render failed:", message);
    res.status(500).json({ error: "render_failed", detail: message });
  }
});

app.listen(PORT, () => {
  console.log(`[pdf-service] listening on :${PORT}`);
});
