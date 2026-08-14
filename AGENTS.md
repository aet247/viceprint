# AGENTS.md — Maintenance runbook (viceprint site)

Cloudflare Pages project `viceprint` · production: https://viceprint.pages.dev
Brand (display): **Automatic Nail Art Machine** (renamed from VICEPRINT on 2026-08-14)
Repo: github.com/aet247/viceprint (private) · stack: Astro 5 + React islands · EN `/`, DE `/de/`

## Build

```bash
npm install --no-audit --no-fund
npm run build          # → dist/ ; NODE_OPTIONS memory flag is BAKED INTO the script
npm run test           # vitest (src/lib/contact.ts handler tests)
```

The `build` script already sets `NODE_OPTIONS=--max-old-space-size=2048`. The build
**OOMs on low-RAM machines** at the default heap, so do NOT remove that flag. If you
edit `package.json`, keep the flag on `build`.

## Deploy — the reliable path

GitHub pushes do **NOT** reliably update the live site: Cloudflare's git build can OOM
and silently keep serving the last good build (this wasted a full session once). Always
deploy `dist/` directly with Wrangler:

```bash
export CLOUDFLARE_ACCOUNT_ID="59a7231016014670cd4b9f4cd0a17202"
export CLOUDFLARE_API_KEY="<global API key>"     # global key needs CLOUDFLARE_EMAIL too
export CLOUDFLARE_EMAIL="aetcrypto@gmail.com"     # only required with a global key
# …or instead use an API Token (no email needed):
# export CLOUDFLARE_API_TOKEN="<token with Cloudflare Pages:Edit>"

npm run build
npx wrangler pages deploy dist --project-name viceprint
```

- **Credentials are never in the repo.** Obtain a fresh Cloudflare Global API Key or an
  API Token (Account: Cloudflare Pages → Edit) from the dashboard / account owner. The
  key is rotated periodically — never hardcode or commit it.
- Account ID `59a7231016014670cd4b9f4cd0a17202`, project name `viceprint`.
- Production alias is `viceprint.pages.dev`. The deploy prints a hash URL
  (e.g. `74d682d8.viceprint.pages.dev`) that is just a direct link to that build.

## Gotchas

- **Stale deployment URLs.** Links like `74a9bb90.viceprint.pages.dev` are fixed
  snapshots of old deploys and will NOT change. Always open `viceprint.pages.dev`.
- **Branch tracking is mismatched.** Local `main` now tracks `origin/main`, but a
  second remote branch `master` also exists (historical). If you rely on git, push
  explicitly. Prefer the Wrangler deploy above — it does not depend on git state.
- **Brand vs identifiers.** Display name is "Automatic Nail Art Machine", while the
  domain (`viceprint.pages.dev`), repo name, Cloudflare project name, and the
  `viceprint-consent` localStorage key are intentionally still `viceprint`. Do not
  "fix" these unless the owner migrates the domain.
- **KV namespaces** `RESERVATIONS` (`res-*`) + `LEADS` — IDs in `wrangler.toml`.
  `wrangler kv key *` defaults to a LOCAL simulation; pass `--remote` to inspect real data.
- **Secrets** (Cloudflare Pages → Settings → Environment variables, never in git):
  `PAYPAL_SECRET` (live) + `RESEND_API_KEY`. `PUBLIC_PAYPAL_CLIENT_ID` +
  `PAYPAL_CLIENT_ID` (public live ids) live in `wrangler.toml` `[vars]`;
  `PAYPAL_ENV = "live"`.
- **`astro dev`** island hydration is broken on this toolchain — verify UI changes
  against `npm run build` + the `dist/` output, not the dev server.

## Editing content (no code change needed for copy)

- `content/site-settings.json` — business email, WEEE/GPSR, legal data
- `content/specs.json` — machine specs (unconfirmed items render as TBD)
- `content/faq/*.json` — FAQ items (feeds FAQ section + JSON-LD)
- `src/i18n/en.json` / `src/i18n/de.json` — all visible copy

After any change: `npm run build` then `npx wrangler pages deploy dist --project-name viceprint`.
