import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { apiErrorMessage, apiRequest } from "../../api.js";
import StatusMessage from "../../StatusMessage.jsx";
import { deliveryReadinessLabel, deliveryReadinessText } from "../../delivery-readiness-copy.js";
import {
  monitoringCheckoutDisabled,
  monitoringCheckoutErrorOutcome,
  monitoringCheckoutOutcome
} from "../../monitoring-checkout.js";
import { PageHeader } from "../../components/AppShell.jsx";
import { formatDate } from "../../lib/format.js";
import { statusLabel } from "../../lib/labels.js";
import { queryKeys } from "../../lib/queries.js";
import { fetchBillingSummary } from "../../lib/requests.js";

export function BillingPortal() {
  const billingQuery = useQuery({ queryKey: queryKeys.billing, queryFn: fetchBillingSummary });
  const billing = billingQuery.data || null;
  const [monitoringCheckoutStatus, setMonitoringCheckoutStatus] = useState("idle");
  const [monitoringCheckoutMessage, setMonitoringCheckoutMessage] = useState("");

  const requests = billing?.requests || [];
  const payments = billing?.payments || [];
  const pricing = billing?.pricing || {};
  const monitoring = billing?.monitoring || {};
  const monitoringOffer = monitoring.offer || {};
  const pricingUnavailable = pricing.status !== "available";
  const priceLabel = pricing.status === "available" ? pricing.displayPrice : "";
  const monitoringDisabled = monitoringCheckoutDisabled({
    checkoutReady: Boolean(monitoring.checkoutReady),
    status: monitoringCheckoutStatus,
    hasEligibleSite: monitoring.hasEligibleSite !== false
  });

  async function startMonitoringCheckout() {
    setMonitoringCheckoutStatus("submitting");
    setMonitoringCheckoutMessage("");
    try {
      const { response, payload } = await apiRequest("/api/beta/monitoring-checkout", {
        method: "POST",
        credentials: "include",
        headers: { accept: "application/json" },
        body: {}
      });
      if (!response.ok && payload.checkoutAvailable !== false) {
        throw new Error(apiErrorMessage(payload, "Proof Monitoring checkout is unavailable.", ["error", "message"]));
      }
      const outcome = monitoringCheckoutOutcome(payload);
      setMonitoringCheckoutStatus(outcome.status === "redirecting" ? "success" : outcome.status);
      setMonitoringCheckoutMessage(outcome.message);
      if (outcome.checkoutUrl) {
        window.location.href = outcome.checkoutUrl;
      }
    } catch (error) {
      const outcome = monitoringCheckoutErrorOutcome(error);
      setMonitoringCheckoutStatus(outcome.status);
      setMonitoringCheckoutMessage(outcome.message);
    }
  }

  const monitoringActive = monitoring.status === "active";
  return (
    <div className="app-page">
      <PageHeader
        title="Billing"
        description="Your plan, Fix Packs, and payment history. Payments are processed securely by Dodo Payments."
      />

      {billingQuery.isError && (
        <StatusMessage tone="error">{billingQuery.error?.message || "Could not load billing."}</StatusMessage>
      )}

      <section className="app-card" aria-labelledby="plan-title">
        <div className="app-card-head">
          <h2 id="plan-title">Your plan</h2>
          <span className="status-pill">{monitoringActive ? "Proof Monitoring" : "Free beta"}</span>
        </div>
        <p className="app-card-text">
          {monitoringActive
            ? "Proof Monitoring is active: verified sites are rerun every week and changes are reported."
            : "Audits and weekly monitoring for verified sites are free while SEO Fix Kit is in beta. You only pay for a Fix Pack when a report finds real problems."}
        </p>
        {monitoring.checkoutReady && !monitoringActive && (
          <div>
            <button
              className="app-button"
              disabled={monitoringDisabled}
              onClick={startMonitoringCheckout}
              type="button"
            >
              {monitoringCheckoutStatus === "submitting" ? "Opening checkout…" : "Start Proof Monitoring"}
            </button>
            <StatusMessage tone={monitoringCheckoutStatus}>{monitoringCheckoutMessage}</StatusMessage>
            <p className="app-footnote">{monitoring.message || monitoringOffer.description}</p>
          </div>
        )}
      </section>

      <section className="app-card" aria-labelledby="fixpack-title">
        <div className="app-card-head">
          <h2 id="fixpack-title">{billing?.product?.name || "SEO Fix Pack"}</h2>
          {!pricingUnavailable && <strong className="billing-price">{priceLabel}</strong>}
        </div>
        <p className="app-card-text">
          One proof-backed repair pass for a report, plus one rerun to confirm the fixes worked.
        </p>
        <p className="app-footnote">
          One-time payment per report. Start a Fix Pack from any report that finds real problems; the final price is
          shown at checkout.
        </p>
      </section>

      <section className="app-card" aria-labelledby="requests-title">
        <div className="app-card-head">
          <h2 id="requests-title">Fix Packs</h2>
        </div>
        <div className="billing-list">
          {requests.map((request) => {
            const readiness = request.deliveryReadiness || {};
            return (
              <article className={`billing-row ${request.status}`} key={request.id}>
                <div>
                  <span className="status-pill">{request.statusLabel || statusLabel(request.status)}</span>
                  <h3>{request.targetHost || request.targetUrl}</h3>
                  <p>
                    {request.issueCount || 0} problems · score {request.score ?? "–"}
                  </p>
                  {readiness.status && (
                    <div className={`delivery-readiness ${readiness.status}`}>
                      <strong>{deliveryReadinessLabel(readiness)}</strong>
                      <span>{deliveryReadinessText(readiness)}</span>
                    </div>
                  )}
                </div>
                <div className="billing-row-meta">
                  {request.paidAt && <span>Paid {formatDate(request.paidAt)}</span>}
                  {request.dueAt && <span>Due {formatDate(request.dueAt)}</span>}
                  {request.nextUpdateAt && <span>Next update {formatDate(request.nextUpdateAt)}</span>}
                  {request.deliveredAt && <span>Delivered {formatDate(request.deliveredAt)}</span>}
                </div>
                <div className="queue-links">
                  {request.reportPath && (
                    <Link discover="none" to={request.reportPath}>
                      Report
                    </Link>
                  )}
                  {request.briefPath && <a href={request.briefPath}>Brief</a>}
                  {request.deliveryUrl && (
                    <a href={request.deliveryUrl} target="_blank" rel="noreferrer">
                      Delivery
                    </a>
                  )}
                </div>
              </article>
            );
          })}
          {!requests.length && (
            <p className="app-empty">
              No Fix Packs yet.{" "}
              <Link discover="none" className="inline-link" to="/beta#new-audit">
                Run an audit
              </Link>{" "}
              and start one from a report with real problems.
            </p>
          )}
        </div>
      </section>

      <section className="app-card" aria-labelledby="payments-title">
        <div className="app-card-head">
          <h2 id="payments-title">Payment history</h2>
        </div>
        <div className="billing-list">
          {payments.map((payment) => (
            <article className={`billing-row ${payment.type}`} key={`${payment.id}-${payment.type}`}>
              <div>
                <span className="status-pill">{payment.type.replaceAll("_", " ")}</span>
                <h3>{payment.targetHost || "Payment"}</h3>
                <p>{payment.displayReference || payment.statusLabel || "Payment record"}</p>
              </div>
              <div className="billing-row-meta">
                {payment.displayAmount && <span>{payment.displayAmount}</span>}
                {payment.displayRefundAmount && <span>Refund {payment.displayRefundAmount}</span>}
                {payment.paidAt && <span>Paid {formatDate(payment.paidAt)}</span>}
                {payment.refundedAt && <span>Refunded {formatDate(payment.refundedAt)}</span>}
                {payment.disputedAt && <span>Disputed {formatDate(payment.disputedAt)}</span>}
              </div>
              <div className="queue-links">
                {payment.reportPath && (
                  <Link discover="none" to={payment.reportPath}>
                    Report
                  </Link>
                )}
              </div>
            </article>
          ))}
          {!payments.length && <p className="app-empty">No payments yet.</p>}
        </div>
      </section>
    </div>
  );
}
