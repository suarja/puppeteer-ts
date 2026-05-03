# pdf-service — Be Viral PDF renderer

Express + Puppeteer microservice deployed on Railway. Receives an
HTML payload from the Be Viral Next.js app (Vercel) and returns a
PDF buffer rendered by the system Chromium.

## Endpoints

| Method | Path     | Auth                  | Purpose                              |
|--------|----------|-----------------------|--------------------------------------|
| GET    | /health  | none                  | Readiness probe (Railway healthcheck) |
| POST   | /pdf     | `X-PDF-Secret` header | Render HTML → PDF                    |

## Request shape (POST /pdf)

```http
POST /pdf
Content-Type: application/json
X-PDF-Secret: <shared secret>

{
  "html": "<!DOCTYPE html>...</html>",
  "filename": "guide.pdf",
  "options": {
    "format": "A4",
    "printBackground": true,
    "margin": { "top": "14mm", "right": "12mm", "bottom": "14mm", "left": "12mm" }
  }
}
```

Response: `200 application/pdf` (body = PDF buffer) on success.
`401` on bad secret. `400` if `html` missing. `500` on render error.

## Env vars

| Var      | Required | Notes                                        |
|----------|----------|----------------------------------------------|
| PORT     | no       | Auto-set by Railway. Defaults to 3000 local. |
| PDF_SECRET | yes    | Must match `PDF_SERVICE_SECRET` on Vercel.   |

Generate the secret with `openssl rand -hex 32`.

## Local dev

```bash
npm install
PDF_SECRET=local-dev-secret npm run dev
# in another shell:
curl -X POST http://localhost:3000/pdf \
  -H "Content-Type: application/json" \
  -H "X-PDF-Secret: local-dev-secret" \
  -d '{"html":"<h1>Hello PDF</h1>","filename":"hello.pdf"}' \
  --output hello.pdf
```

## Deploy

`railway.toml` configures nixpacks build with the system Chromium
binary at `/usr/bin/google-chrome-stable`. The healthcheck at
`/health` lets Railway gate routing on a successful boot.
