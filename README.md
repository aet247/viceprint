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

## Deployment (live)

- **Production:** https://viceprint.pages.dev — Cloudflare Pages project `viceprint`
- **Repo:** github.com/aet247/viceprint (private). Push to `main`; deploy manually:
  `npx wrangler pages deploy dist --project-name viceprint` (build first, see Commands)
- **KV namespaces:** `RESERVATIONS` (`res-*` keys) + `LEADS` (contact leads) — IDs in `wrangler.toml`
  ⚠️ `wrangler kv key *` commands default to a **local simulation** — always pass
  `--remote` (e.g. `npx wrangler kv key list --namespace-id <id> --remote`) to
  inspect the real namespaces.
- **Secrets** (Cloudflare Pages → Settings → Environment variables, never in git):
  `PAYPAL_SECRET` + `RESEND_API_KEY` (both set, sandbox). Set secrets via
  `printf '%s' "$VAR" | npx wrangler pages secret put $VAR --project-name viceprint`
  then **redeploy** (Pages snapshots env at deploy time). `PAYPAL_CLIENT_ID` +
  `PUBLIC_PAYPAL_CLIENT_ID` (public sandbox ids) are in `wrangler.toml` `[vars]`.
- **Build-time public var:** `PUBLIC_PAYPAL_CLIENT_ID` (sandbox, set). Verified in
  production smoke tests (WI-9): reserve+refund E2E passed — real sandbox order
  `3RC88821N5175933C` → captured 750.00 EUR → reserved → refunded (capture GET
  shows `REFUNDED`); fake order → 400, tier amount mismatch → 400, re-cancel →
  409, wrong email → 404; dev-mode `ALLOW_UNVERIFIED=true` reserve worked and
  fail-closed without it.

### Launch blockers (spec §11) — do NOT go live before these clear

1. **PayPal live credentials** (business account holder): set `PAYPAL_ENV=live`,
   `PAYPAL_CLIENT_ID`, `PUBLIC_PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`.
2. **Real domain + DNS** (`astro.config.mjs` `site` + Pages custom domain; CNAME → `viceprint.pages.dev`).
3. **Impressum / privacy data** — legal pages render nothing until
   `content/site-settings.json` is filled (business name, address, contact, etc.).
4. **WEEE / GPSR data** from the supplier (spec §4) — still TBD.
5. **German copy review** — `de.json` is a DRAFT machine translation (`_meta.status`).
6. **Resend sending domain** — test mode (`onboarding@resend.dev`) only delivers to
   the account owner's address; verify a domain for real delivery.

### Editing content (no rebuilds needed for text)

- `content/site-settings.json` — business email, WEEE/GPSR, legal data
- `content/specs.json` — machine specs (unconfirmed items render as TBD)
- `content/faq/*.json` — FAQ items (feeds the FAQ section + JSON-LD)
- `src/i18n/en.json` / `src/i18n/de.json` — all copy
