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

`de.json` carries a `_meta.status` flag — the German copy was machine-translated
and **accepted by the business owner** (reviewed 2026-08-13); the "German
translation pending" notice was removed from all `/de/` legal pages. Treat as
final launch copy unless the owner requests changes.

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
  `PAYPAL_SECRET` (LIVE) + `RESEND_API_KEY` (both set). Set secrets via
  `printf '%s' "$VAR" | npx wrangler pages secret put $VAR --project-name viceprint`
  then **redeploy** (Pages snapshots env at deploy time).   `PAYPAL_CLIENT_ID` +
  `PUBLIC_PAYPAL_CLIENT_ID` (public LIVE ids) are in `wrangler.toml` `[vars]`;
  `PAYPAL_ENV = "live"` selects the live PayPal API base.
- **Build-time public var:** `PUBLIC_PAYPAL_CLIENT_ID` (live, set). Sandbox E2E
  verified in production smoke tests (WI-9): reserve+refund passed — real sandbox order
  `3RC88821N5175933C` → captured 750.00 EUR → reserved → refunded (capture GET
  shows `REFUNDED`); fake order → 400, tier amount mismatch → 400, re-cancel →
  409, wrong email → 404; dev-mode `ALLOW_UNVERIFIED=true` reserve worked and
  fail-closed without it.

### Launch blockers (spec §11) — status as of 2026-08-13

1. **PayPal live credentials** — ✅ DONE. `PAYPAL_ENV=live`, live `PAYPAL_CLIENT_ID`
   + `PUBLIC_PAYPAL_CLIENT_ID` in `wrangler.toml` `[vars]`, live `PAYPAL_SECRET`
    set via Cloudflare secret. Live OAuth token verified (creds valid). **Live
    smoke test (capture + refund) POSTPONED by owner — will run later.**
2. **Real domain + DNS** — ⏸ POSTPONED (B2). `astro.config.mjs` `site` still
   `https://viceprint.pages.dev`; custom domain later.
3. **Impressum / privacy data** — ⏸ POSTPONED (B3). `content/site-settings.json`
   still empty; legal pages render entity-less until filled.
 4. **WEEE / GPSR data** — 🟡 WORKAROUND IDENTIFIED (B4). Direct AliExpress dropship
    makes VICEPRINT the EU importer/economic operator (GPSR Reg. 2023/988 Art. 16).
    Compliant path: (a) appoint an EU Responsible Person / Authorised-Rep service
    (€150–500/yr, e.g. Euverify/EuroComply) for the required EU legal presence + address;
    (b) carry RP + importer + manufacturer details on the **digital packing slip /
    accompanying document** (Art. 16(3)) since single dropship units can't be physically
    labelled; (c) obtain CE/WEEE/technical file from the AliExpress seller. RP name/address
    + WEEE number stay TODO until the service is engaged and seller docs received.
5. **German copy review** — ✅ DONE (B5). Owner accepted the translation; `_meta.status`
   set to "Reviewed" and the "German translation pending" notices removed from
   `LegalContent.astro` + `de/legal/withdrawal.astro`.
 6. **Resend sending domain** — 🟡 PARTIAL (B6). `BUSINESS_EMAIL` set to
    `digitalvalueLLC@proton.me` (display + send). Owner confirmed emails ARE delivering
    (test mode, e.g. reservation-cancel mail ID `23c6a0c0-ddc9-4c28-a3b9-58f73214a5aa`,
    Aug 08). Caveat: `proton.me` is not a Resend-verifiable domain, so production *sending
    FROM* it still needs a verified domain (test mode delivers to the owner only). Owner
    action: verify a domain in Resend for real production delivery.

### Editing content (no rebuilds needed for text)

- `content/site-settings.json` — business email, WEEE/GPSR, legal data
- `content/specs.json` — machine specs (unconfirmed items render as TBD)
- `content/faq/*.json` — FAQ items (feeds the FAQ section + JSON-LD)
- `src/i18n/en.json` / `src/i18n/de.json` — all copy
