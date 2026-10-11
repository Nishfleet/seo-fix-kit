import test from "node:test";
import assert from "node:assert/strict";
import { GO_LINKS, GUIDE_ROUTES, goRedirect } from "./guides.js";

const origin = "https://seofixkit.com";

test("each guide has a disclosure and only sponsored /go links", () => {
  for (const [path, render] of Object.entries(GUIDE_ROUTES)) {
    const html = render(origin);
    assert.match(html, /Disclosure:/, path);
    for (const m of html.matchAll(/href="https:\/\/seofixkit\.com\/go\/([a-z-]+)"([^>]*)>/g)) {
      assert.ok(GO_LINKS[m[1]], `${path} unknown go slug ${m[1]}`);
      assert.match(m[2], /rel="sponsored nofollow/, path);
    }
  }
});

test("go redirects known slugs and rejects unknown ones", () => {
  const r = goRedirect("/go/semrush");
  assert.equal(r.status, 302);
  assert.equal(r.headers.get("location"), GO_LINKS.semrush.url);
  assert.equal(goRedirect("/go/evil"), null);
  assert.equal(goRedirect("/go/__proto__"), null);
});
