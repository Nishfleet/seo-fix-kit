const CUSTOMER_DELIVERY_BLOCKER_TEXT = {
  payment_unconfirmed: "Waiting for payment confirmation.",
  status_not_deliverable: "The repair pass isn’t ready to deliver yet.",
  proposal_state_unavailable: "Proposed fix status can’t be shown right now. Check back shortly.",
  approved_proposal_missing: "Approve a proposed fix on the report so we can continue.",
  customer_note_missing: "We’re writing your delivery note.",
  delivery_link_missing: "We’re preparing your delivery link.",
  final_rerun_missing: "The final rerun report isn’t attached yet."
};

export function deliveryReadinessLabel(readiness = {}) {
  if (readiness.status === "delivered") return "Delivered";
  if (readiness.readyForDelivery) return "Ready to deliver";
  if (readiness.status === "blocked") return "Not ready to deliver";
  if (readiness.readyForStart) return "Ready to start";
  return "Waiting to start";
}

export function deliveryReadinessText(readiness = {}) {
  if (readiness.status === "delivered") return "Your delivery note and rerun report are attached.";
  if (readiness.readyForDelivery) {
    return "Delivery note, link, approval and rerun report are ready.";
  }
  const blockers = (readiness.blockers || [])
    .map((blocker) => CUSTOMER_DELIVERY_BLOCKER_TEXT[blocker.id] || "We’re still working on this repair pass.")
    .filter(Boolean);
  const uniqueBlockers = [...new Set(blockers)];
  if (uniqueBlockers.length) return uniqueBlockers.slice(0, 3).join(" ");
  return "Waiting for payment confirmation and the repair work.";
}
