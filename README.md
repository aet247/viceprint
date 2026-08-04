# VICEPRINT — founder presale landing page

Single-page presale site for the VICEPRINT digital nail printer. Static-first
Astro 5 build with React islands (audience tabs, contact form), deployed to
Cloudflare Pages. EN at `/`, German at `/de/`.

## Commands

```bash
npm install --no-audit --no-fund     # 3.2 GB box: never parallel installs/builds
NODE_OPTIONS=--max-old-space-size=768 npm run check   # astro check (TS)
NODE_OPTIONS=--max-old-space-size=768 npm run build   # astro build → dist/
npm run test                         # vitest (src/lib/contact.ts handler tests)
npm run dev                          # astro dev (island hydration broken on this
                                     # toolchain — verify against dist/ build)
```

## i18n

All copy lives in `src/i18n/en.json` / `src/i18n/de.json`; `src/i18n/t.ts` is a
tiny lookup (`t(locale)`), components take a `locale` prop, pages compose via
`src/components/Page.astro`. Prices, brand name and URLs are untranslated.

`de.json` carries a `_meta.status` DRAFT flag — the German copy is a machine
translation and needs a native German review before launch. Never ship `/de/`
as finished German copy.

## API

`POST /api/contact` (Astro API route, `prerender = false`) accepts
`{ company, name, email, country, message, wholesale? }`. Validation is
server-side (400 on missing/invalid/over-length fields; company/name/country
≤ 200 chars, message ≤ 2000, email regex). Success returns `{ ok: true }` and
logs the lead to the `LEADS` KV namespace + emails `BUSINESS_EMAIL` via Resend.
Without credentials (no `RESEND_API_KEY` / `BUSINESS_EMAIL` / KV binding) it
logs a skip message and still returns `{ ok: true }` — the build and local dev
work before credentials exist. Logic is factored into `src/lib/contact.ts`
(`handleContact(input, deps)` with injected KV/email deps) so step 10's
reservation API can mirror it and tests need no network.
