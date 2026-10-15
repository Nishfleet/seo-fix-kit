import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { repairSprintEligibilityFromProposals } from "../../../shared/offers.js";
import { apiErrorMessage, apiRequest } from "../../api.js";
import StatusMessage from "../../StatusMessage.jsx";
import {
  fixPackCheckoutDisabled,
  fixPackCheckoutErrorOutcome,
  fixPackCheckoutOutcome,
  fixPackRepairTarget
} from "../../fix-pack-checkout.js";
import { monitoringCheckoutErrorOutcome, monitoringCheckoutOutcome } from "../../monitoring-checkout.js";
import { usePricingPreview } from "../../hooks/usePricingPreview.js";
import { FixKitIncludes } from "./FixKitPanel.jsx";
import { beforeAfterText, formatDate } from "../../lib/format.js";
import { proposalStatusLabel, checkoutMessage, statusLabel } from "../../lib/labels.js";
import { queryKeys } from "../../lib/queries.js";
import { loadRepairQueue, requestFixQuote, patchRepairProposalApproval } from "../../lib/requests.js";

export function FixRequestStatusPanel({ fixRequest, checkoutReturned }) {
  const status = fixRequest?.status || (checkoutReturned ? "checkout_created" : "new");
  const label = fixRequest?.statusLabel || statusLabel(status);
  const message = checkoutMessage(status, checkoutReturned);

  return (
    <section className={`fix-status-panel ${status}`}>
      <div>
        <p className="beta-eyebrow">Fix Pack</p>
        <h2>{label}</h2>
        <p>{message}</p>
      </div>
      {fixRequest && (
        <dl>
          {fixRequest.paidAt && (
            <div>
              <dt>Paid</dt>
              <dd>{formatDate(fixRequest.paidAt)}</dd>
            </div>
          )}
          {fixRequest.inProgressAt && (
            <div>
              <dt>Started</dt>
              <dd>{formatDate(fixRequest.inProgressAt)}</dd>
            </div>
          )}
          {fixRequest.deliveredAt && (
            <div>
              <dt>Delivered</dt>
              <dd>{formatDate(fixRequest.deliveredAt)}</dd>
            </div>
          )}
          {fixRequest.dueAt && (
            <div>
              <dt>Expected by</dt>
              <dd>{formatDate(fixRequest.dueAt)}</dd>
            </div>
          )}
          {fixRequest.nextUpdateAt && (
            <div>
              <dt>Next update</dt>
              <dd>{formatDate(fixRequest.nextUpdateAt)}</dd>
            </div>
          )}
          {fixRequest.customerNote && (
            <div>
              <dt>Note</dt>
              <dd>{fixRequest.customerNote}</dd>
            </div>
          )}
          {fixRequest.deliveryUrl && (
            <div>
              <dt>Delivery</dt>
              <dd>
                <a href={fixRequest.deliveryUrl} target="_blank" rel="noreferrer">
                  Open delivery link
                </a>
              </dd>
            </div>
          )}
          {fixRequest.finalReportPath && (
            <div>
              <dt>Final rerun</dt>
              <dd>
                <a href={fixRequest.finalReportPath}>Open rerun report</a>
              </dd>
            </div>
          )}
          {fixRequest.beforeAfterSummary && (
            <div>
              <dt>Before and after</dt>
              <dd>{beforeAfterText(fixRequest.beforeAfterSummary)}</dd>
            </div>
          )}
        </dl>
      )}
    </section>
  );
}

export function RepairProposalPanel({ reportId, initialProposals = [], repairSprint = null }) {
  const [updatedById, setUpdatedById] = useState({});
  const queryClient = useQueryClient();
  const proposals = initialProposals.map((proposal) => updatedById[proposal.id] || proposal);
  const [savingId, setSavingId] = useState("");
  const [sprintCheckoutStatus, setSprintCheckoutStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);

  function showMessage(text, isError = false) {
    setMessage(text);
    setMessageIsError(isError);
  }

  async function updateProposal(proposal, action) {
    setSavingId(proposal.id);
    showMessage("");
    const result = await patchRepairProposalApproval(reportId, proposal.id, { action });
    setSavingId("");
    if (!result.ok) {
      showMessage(result.error || "That change didn’t save. Try again.", true);
      return;
    }
    setUpdatedById((current) => ({ ...current, [proposal.id]: result.proposal }));
    queryClient.invalidateQueries({ queryKey: queryKeys.report(reportId), exact: true });
    setSprintCheckoutStatus("idle");
    showMessage(action === "approve" ? "Repair approved." : "Repair dismissed.");
  }

  async function startRepairSprintCheckout() {
    if (sprintCheckoutStatus === "submitting") return;
    setSprintCheckoutStatus("submitting");
    showMessage("");
    try {
      const { response, payload } = await apiRequest("/api/beta/repair-sprint-checkout", {
        method: "POST",
        body: { reportId }
      });
      if (!response.ok || !payload.ok) {
        throw new Error(apiErrorMessage(payload, "Repair Sprint checkout is unavailable.", ["error", "message"]));
      }
      const outcome = monitoringCheckoutOutcome(payload, { offerName: "Repair Sprint" });
      setSprintCheckoutStatus(outcome.status);
      showMessage(outcome.message, outcome.status === "error" || outcome.status === "unavailable");
      if (outcome.checkoutUrl) window.location.assign(outcome.checkoutUrl);
    } catch (error) {
      const outcome = monitoringCheckoutErrorOutcome(error, { offerName: "Repair Sprint" });
      setSprintCheckoutStatus(outcome.status);
      showMessage(outcome.message, true);
    }
  }

  const executableProposals = proposals.filter((proposal) => proposal.executionMode !== "unsupported");
  const executableCount = executableProposals.length;
  const approvedCount = executableProposals.filter((proposal) => proposal.approvalStatus === "approved").length;
  const currentRepairSprint = repairSprint
    ? {
        ...repairSprint,
        ...repairSprintEligibilityFromProposals(proposals, repairSprint.hasPaidRequest ? { status: "paid" } : null, {
          checkoutReady: Boolean(repairSprint.checkoutReady || repairSprint.checkoutLive)
        })
      }
    : null;

  return (
    <section className="repair-proposal-panel">
      <div className="section-heading">
        <div>
          <p className="beta-eyebrow">Proposed fixes</p>
          <h2>Approve the fixes you want made</h2>
        </div>
        <div className="proposal-summary">
          <span>{approvedCount} approved</span>
          <span>{executableCount} supported</span>
          <span>{proposals.length} total</span>
        </div>
      </div>
      {currentRepairSprint && (
        <div className={`repair-sprint-strip ${currentRepairSprint.status}`}>
          <div>
            <span className="status-pill">Repair Sprint</span>
            {currentRepairSprint.checkoutLive && <strong>Price shown at checkout</strong>}
          </div>
          <p>{currentRepairSprint.message}</p>
          {currentRepairSprint.checkoutLive && (
            <button
              className="action-link paid-action"
              disabled={sprintCheckoutStatus === "submitting"}
              onClick={startRepairSprintCheckout}
              type="button"
            >
              {sprintCheckoutStatus === "submitting" ? "Opening checkout…" : "Start Repair Sprint"}
            </button>
          )}
        </div>
      )}
      <StatusMessage tone={messageIsError ? "error" : "success"}>{message}</StatusMessage>
      <div className="repair-proposal-list">
        {proposals.map((proposal) => (
          <article className={`repair-proposal-card ${proposal.approvalStatus}`} key={proposal.id}>
            <div className="proposal-card-main">
              <div>
                <span className="status-pill">{proposal.executionModeLabel || proposal.executionMode}</span>
                <span className="status-pill">{proposalStatusLabel(proposal.approvalStatus)}</span>
                {proposal.deliveryStatus && (
                  <span className="status-pill">{proposalStatusLabel(proposal.deliveryStatus)}</span>
                )}
                <h3>{proposal.generatedTitle || proposal.issueTitle}</h3>
                <p>{proposal.generatedSummary || proposal.proposal?.fix}</p>
              </div>
              <div className="proposal-actions">
                <button
                  className="action-link paid-action"
                  disabled={
                    savingId === proposal.id ||
                    proposal.approvalStatus === "approved" ||
                    proposal.executionMode === "unsupported"
                  }
                  onClick={() => updateProposal(proposal, "approve")}
                  type="button"
                >
                  {savingId === proposal.id ? "Saving…" : "Approve"}
                </button>
                <button
                  className="action-link"
                  disabled={savingId === proposal.id || proposal.approvalStatus === "dismissed"}
                  onClick={() => updateProposal(proposal, "dismiss")}
                  type="button"
                >
                  Dismiss
                </button>
              </div>
            </div>
            <dl className="proposal-proof">
              {proposal.proof?.evidence && (
                <div>
                  <dt>Evidence</dt>
                  <dd>{proposal.proof.evidence}</dd>
                </div>
              )}
              {proposal.acceptance?.length > 0 && (
                <div>
                  <dt>Done when</dt>
                  <dd>{proposal.acceptance[0]}</dd>
                </div>
              )}
              {proposal.proposal?.snippet && (
                <div>
                  <dt>Snippet</dt>
                  <dd>
                    <code>{proposal.proposal.snippet}</code>
                  </dd>
                </div>
              )}
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

export function FixQuotePanel({ report, hasPriorityFixes }) {
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const pricing = usePricingPreview(hasPriorityFixes);
  const repairQueueQuery = useQuery({
    queryKey: queryKeys.repairQueue(report.id),
    queryFn: () => loadRepairQueue(report.id),
    enabled: Boolean(hasPriorityFixes && report.id)
  });
  const repairQueue = {
    status: repairQueueQuery.isLoading ? "loading" : repairQueueQuery.isError ? "error" : "idle",
    items: repairQueueQuery.data?.items || []
  };
  const selectedRepair = fixPackRepairTarget(report, repairQueue.items);
  const selectedRepairIsLive = selectedRepair?.source === "repair_queue";
  const checkoutDisabled = fixPackCheckoutDisabled({
    hasPriorityFixes,
    pricingStatus: pricing.status,
    status
  });
  const priceLabel =
    pricing.status === "available"
      ? pricing.displayPrice
      : pricing.status === "loading"
        ? "Loading price…"
        : "Price unavailable";

  return (
    <aside className="paid-panel">
      <div>
        <p className="beta-eyebrow">{hasPriorityFixes ? "Fix Pack" : "Next step"}</p>
        <h3>
          {hasPriorityFixes
            ? "Get every fix ready to ship, plus a guided repair pass"
            : "Nothing here needs a Fix Pack"}
        </h3>
        {hasPriorityFixes && (
          <div className={`price-preview ${pricing.status}`}>
            <strong>{priceLabel}</strong>
            <span>
              {pricing.status === "available"
                ? "One-time, for this report. Local tax included. Paid through Dodo Payments."
                : pricing.status === "loading"
                  ? "Checking the current price."
                  : "Checkout opens once the price loads."}
            </span>
          </div>
        )}
        <p>
          {hasPriorityFixes
            ? "Download every fix as files your developer or AI tool can use today. Then we go through the fixes with you and rerun the audit to show what got fixed. We don’t guarantee rankings or traffic."
            : "Rerun the audit after you change content or templates."}
        </p>
        {hasPriorityFixes && <FixKitIncludes reportId={report.id} />}
        {hasPriorityFixes && selectedRepair?.title && (
          <p className="quiet-note">
            {selectedRepairIsLive ? "Starts with" : "Top problem"}: {selectedRepair.title}
          </p>
        )}
        {hasPriorityFixes && repairQueue.status === "loading" && (
          <p className="quiet-note">Checking your repair queue…</p>
        )}
        {hasPriorityFixes && repairQueue.status === "error" && (
          <p className="quiet-note">Your repair queue didn’t load. Checkout will start with the first open problem.</p>
        )}
      </div>
      {hasPriorityFixes ? (
        <span className="checkout-action">
          <button
            className="action-link paid-action"
            disabled={checkoutDisabled}
            onClick={async () => {
              setStatus("submitting");
              setMessage("");
              try {
                const result = await requestFixQuote(report.id, selectedRepairIsLive ? selectedRepair : null);
                const outcome = fixPackCheckoutOutcome(result);
                setStatus(outcome.status);
                setMessage(outcome.message);
                if (outcome.checkoutUrl) {
                  window.location.assign(outcome.checkoutUrl);
                }
              } catch (error) {
                const outcome = fixPackCheckoutErrorOutcome(error);
                setStatus(outcome.status);
                setMessage(outcome.message);
              }
            }}
            type="button"
          >
            {status === "success" ? "Request sent" : status === "submitting" ? "Opening checkout…" : "Buy Fix Pack"}
          </button>
          {(message || pricing.status === "error") && (
            <small
              className={`checkout-message ${status === "error" || pricing.status === "error" ? "error" : status}`}
            >
              {message || pricing.message}
            </small>
          )}
          {pricing.status === "error" && (
            <small className="checkout-message">
              <button className="action-link" onClick={() => pricing.reload()} type="button">
                Reload price
              </button>{" "}
              or email <a href="mailto:support@seofixkit.com">support@seofixkit.com</a>
            </small>
          )}
        </span>
      ) : null}
    </aside>
  );
}
