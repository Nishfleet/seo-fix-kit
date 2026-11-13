# Shopify store audit sample (2026-11-12)

Source of the problem counts on `/shopify-seo-audit`. Sample was run with the
product's own audit engine (`server/audit/engine.js`, engine v0.9.0, the same
engine behind `/check` and beta audits), plus `buildPlatformSeoAudit` from
`shared/platform-seo-audit.js` on each combined report.

## Method

- Date: 2026-11-12.
- 29 public Shopify stores attempted; each was confirmed to run Shopify
  (`cdn.shopify.com` / `myshopify.com` / Shopify theme markers in the served
  HTML) before auditing.
- 3 stores excluded before counting: 1 engine error (an unrelated internal
  exception during the audit), and 2 whose product/collection page picks failed
  because the store redirected to a different domain mid-audit.
- 26 stores completed the full coverage: homepage, one product page, one
  collection page = 3 pages each, 78 pages total. Product/collection URLs were
  picked from the store's public `products.json` / `collections.json`, falling
  back to its sitemap.
- Every page was fetched, rendered in headless Chromium, and audited by the
  engine. No store was logged into; no Shopify admin surface was touched.
- Per the consent gate: stores are not named on the page or as examples of
  problems anywhere. Only counts are published.

## Shopify platform checks (engine `buildPlatformSeoAudit`, 26 stores)

| Check | Status across stores | Count detail |
| --- | --- | --- |
| Product schema | needs_repair 25, not_applicable 1 | 51 product-like pages checked, 13 with rendered `Product` schema (25%). On real `/products/` URLs: 13 of 25 pages had `Product` schema; 12 of 26 stores had at least one audited product page without it (9 of those 12 emit `ProductGroup` instead, 3 had no product markup in the rendered DOM). Note: the engine's check requires the exact `Product` type. |
| BreadcrumbList schema | needs_review 15, passed 10, not_applicable 1 | 57 product/collection pages checked, 25 with rendered `BreadcrumbList`. |
| Faceted/variant URLs | needs_review 20, passed 6 | 211 filter/sort/pagination/variant links appeared in rendered links. |
| Thin category content | passed 26 | 0 stores flagged — not surfaced in this sample. |
| Out-of-stock handling | needs_review 1, passed 25 | 2 pages in 1 store. |

Note: the engine flags homepages that read like product pages ("Add to cart",
"SKU") as product-like, which is why the engine-level product-schema status is
needs_repair for 25 of 26 stores. The `/products/`-URL count above is the
meaningful figure and is what the page reports, labelled as such.

## General findings (presence across stores, any of the 3 pages)

| Finding | Stores (of 26) |
| --- | --- |
| Basic security headers missing | 26 |
| Render-blocking resources | 25 |
| Many third-party resources | 25 |
| Heading hierarchy needs cleanup | 24 |
| Social share image incomplete | 21 |
| URL redirects before rendering | 20 |
| Heavy JavaScript payload | 19 |
| Heavy image payload | 19 |
| Meta description needs tightening | 19 |
| Slow rendered load | 16 |
| Broken internal links | 15 |
| Large total page payload | 15 |
| AI Answer Readiness: helpful structured data not proven | 12 |
| Multiple H1s | 11 |
| Images missing alt attributes | 11 |
| Missing meta description | 10 |
| Missing H1 | 8 |
| Broken external links | 7 |
| HSTS security header missing | 6 |
| Missing or weak title | 3 |
| Missing canonical URL | 3 |
| Canonical conflicts with noindex | 3 |
| Noindex found | 3 |

## Reproduction

Run the same audit per store with the repo's engine (`server/audit/engine.js`,
`maxPages: 1` per URL), then `buildPlatformSeoAudit({ pages })` on the combined
pages of each store. The runner script used for this sample lives outside the
repo (temporary working directory); the counts above are the complete output
used on the page.
