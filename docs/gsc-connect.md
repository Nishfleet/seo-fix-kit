# Google Search Console connection (read-only)

One-click Google Search Console connect for signed-in owners. Read-only: the
worker asks Google for the `webmasters.readonly` scope only and can never write
to Search Console. The owner can disconnect, which deletes the stored token.

## How it is built

- OAuth runs through [Arctic](https://arcticjs.dev), the OAuth 2.0 client
  library (`arctic` 3.x, MIT). npm currently marks `arctic` and several of its
  `@oslojs/*` dependencies as no longer supported; it is kept deliberately:
  the owner pinned it for this connector (2026-11-12 decision in `MEMORY.md`),
  and every OAuth code path here is the library's code rather than hand-written,
  so the surface to audit stays small and isolated behind `worker/lib/gsc.js`.
  `Google.createAuthorizationURL` (PKCE,
  S256), `validateAuthorizationCode` (code exchange) and `refreshAccessToken`
  (token refresh) are all the library's code; we never hand-write the
  authorization request, the exchange or the refresh. `access_type=offline` and
  `prompt=consent` are appended to the library-built URL, exactly as Arctic's
  Google provider documentation prescribes, so Google issues a refresh token.
- The refresh token is encrypted with AES-GCM through the Workers Web Crypto
  API (`crypto.subtle`) before it touches D1, keyed by the `GSC_TOKEN_SECRET`
  secret. Disconnecting revokes the token with Arctic's `revokeToken` and
  deletes the rows (`gsc_connections`, `gsc_page_data`).
- Clicks and impressions per page come from the Search Console Search Analytics
  API (90-day window, `dimensions: ["page"]`) for the owner's verified
  property: `sc-domain:` first, then `https://www.` / `https://` URL
  properties.
- `shared/gsc-traffic.js` reorders the repair queue by clicks at risk. A fault
  is only credited with a page's clicks when the fault's page URL matches a
  Search Console row of the connected property, host included, and faults on
  pages without traffic keep the severity ordering and get no reason. Each
  fault on a page with traffic gets a one-line reason ("Ranked first: this page
  earns N clicks over the last 90 days from Google…"). Without a connection the
  queue keeps its severity ordering.
- The keyword/CSV file upload stays as the fallback and is unchanged.

## Routes

| Route | What it does |
| --- | --- |
| `POST /api/gsc/connect` | Signed-in owner starts the flow; returns the Arctic authorization URL. |
| `GET /api/gsc/callback` | Google redirects back; the code is exchanged, the refresh token is encrypted and stored. |
| `GET /api/gsc/connection` | Connection status + 90-day summary for the report panel. |
| `POST /api/gsc/sync` | Refreshes the token (Arctic), pulls the 90-day per-page rows, stores them. |
| `POST /api/gsc/disconnect` | Revokes and deletes the token and the page data. |

Tables: `gsc_connections`, `gsc_auth_states`, `gsc_page_data`
(`migrations/0099_gsc_connections.sql`).

## Account step (Nish, pending)

The code is ready for the Google account step. In the Google Cloud console:

1. Create an OAuth client (type: Web application) for seo-fix-kit.
2. Authorized redirect URI: `https://seofixkit.com/api/gsc/callback` (and the
   preview origin you test on, e.g. `https://<preview-host>/api/gsc/callback`).
3. Configure the consent screen; SEO Fix Kit asks only for
   `https://www.googleapis.com/auth/webmasters.readonly` (read-only).
4. Set the Worker secrets:
   `npx cf workers secrets update GOOGLE_CLIENT_ID --worker seo-fix-kit --text <id>`,
   the same for `GOOGLE_CLIENT_SECRET`, and generate a random 32-byte value for
   `GSC_TOKEN_SECRET`.

Until those are set, `/api/gsc/connection` reports `configured: false`, the
report panel stays hidden, and the endpoints answer 503 with a message naming
the pending account step. Locally and on previews, the same three variables can
be set through the dev environment; Google's own test-mode users are what the
"Done" gate runs on.
