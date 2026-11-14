import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { offerCatalog, sellableOffers } from "../shared/offers.js";
import { homeMarkdown, llmsText, supportHtml, termsHtml } from "../worker/routes/pages.js";

const origin = "https://seofixkit.com";
const llms = llmsText(origin);
const home = homeMarkdown(origin);
const support = supportHtml(origin);
const terms = termsHtml(origin);
const offers = offerCatalog({ fixPackCheckoutEnabled: true, fixPackCheckoutReady: true });
const monitoringOffers = offerCatalog({
  fixPackCheckoutEnabled: true,
  fixPackCheckoutReady: true,
  monitoringCheckoutReady: true
});
const repairSprintOffers = offerCatalog({
  fixPackCheckoutReady: true,
  monitoringCheckoutReady: true,
  repairSprintCheckoutReady: true,
  fixPackCheckoutEnabled: true
});
const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const schema = homepageSchema(index);
const schemaTypes = schemaTypesFromGraph(schema);

assert.equal(
  sellableOffers(offers)
    .map((offer) => offer.key)
    .join(","),
  "fix_pack"
);
assert.equal(
  sellableOffers(monitoringOffers)
    .map((offer) => offer.key)
    .join(","),
  "fix_pack,proof_monitoring"
);
assert.equal(
  sellableOffers(repairSprintOffers)
    .map((offer) => offer.key)
    .join(","),
  "fix_pack,proof_monitoring"
);
assert.equal(repairSprintOffers.find((offer) => offer.key === "repair_sprint").checkoutConfigured, true);
assert.equal(home.includes("No ranking promise is made."), true);
assert.equal(support.includes("No ranking, traffic, or revenue promise is made."), true);
assert.equal(terms.includes("No ranking, indexing, traffic, revenue, or search-engine outcome is promised"), true);
assert.equal(/\$199-\$399\/mo/.test(llms), false);
assert.equal(/\$299-\$799\/mo/.test(llms), false);
for (const type of ["Organization", "WebSite", "SoftwareApplication", "FAQPage"]) {
  assert.equal(schemaTypes.has(type), true, `homepage schema should include ${type}`);
}
assert.equal(JSON.stringify(schema).includes('"price"'), false);
assert.equal(/guaranteed rankings|guarantees rankings|guarantees traffic/i.test(JSON.stringify(schema)), false);

console.log(JSON.stringify({ ok: true, checked: "product truth and offer gates" }));

function homepageSchema(html) {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match, "homepage JSON-LD script is present");
  return JSON.parse(match[1]);
}

function schemaTypesFromGraph(schema) {
  const nodes = Array.isArray(schema?.["@graph"]) ? schema["@graph"] : [schema];
  return new Set(nodes.map((node) => node?.["@type"]).filter(Boolean));
}
