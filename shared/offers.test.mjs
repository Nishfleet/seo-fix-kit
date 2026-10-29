import assert from "node:assert/strict";
import test from "node:test";
import { BETA_MONITOR_LIMIT, OFFER_CATALOG, PAID_MONITOR_LIMIT } from "./offers.js";

const monitoringOffer = OFFER_CATALOG.find((offer) => offer.key === "proof_monitoring");

test("a paid monitoring plan never covers fewer sites than the free beta allowance", () => {
  assert.ok(
    PAID_MONITOR_LIMIT >= BETA_MONITOR_LIMIT,
    `paid monitoring covers ${PAID_MONITOR_LIMIT} sites, the free beta allowance covers ${BETA_MONITOR_LIMIT}`
  );
  assert.equal(monitoringOffer.limits.monitoredSites, PAID_MONITOR_LIMIT);
});

test("every offer carries the copy a buyer reads before paying", () => {
  for (const offer of OFFER_CATALOG) {
    assert.ok(offer.name && offer.description && offer.availability, `${offer.key} needs buyer-facing copy`);
    assert.ok(offer.requirements.length > 0, `${offer.key} needs its requirements listed`);
  }
});
