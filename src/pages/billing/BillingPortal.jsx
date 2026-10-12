import { useEffect, useState } from "react";
import { Link } from "react-router";
import { apiErrorMessage, apiRequest } from "../../api.js";
import StatusMessage from "../../StatusMessage.jsx";
import { deliveryReadinessLabel, deliveryReadinessText } from "../../delivery-readiness-copy.js";
import {
  monitoringCheckoutDisabled,
  monitoringCheckoutErrorOutcome,
  monitoringCheckoutOutcome
} from "../../monitoring-checkout.js";
import { Metric } from "../../components/Metric.jsx";
import { formatDate } from "../../lib/format.js";
import { statusLabel } from "../../lib/labels.js";
import { loadBillingSummary } from "../../lib/requests.js";

export function BillingPortal({ ownerEmail }) {
  const [billing, setBilling] = useState(null);
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("Loading billing.");
  const [monitoringCheckoutStatus, setMonitoringCheckoutStatus] = useState("idle");
  const [monitoringCheckoutMessage, setMonitoringCheckoutMessage] = useState("");

  useEffect(() => {
    loadBillingSummary(setBilling, setStatus, setMessage);
  }, []);

  const requests = billing?.requests || [];
  const payments = billing?.payments || [];
  const pricing = billing?.pricing || {};
  const subscription = billing?.subscriptionState || {};
  const monitoring = billing?.monitoring || {};
  const monitoringOffer = monitoring.offer || {};
  const pricingUnavailable = pricing.status !== "available" && status !== "loading";
  const priceLabel = pricing.status === "available" ? pricing.displayPrice : "Loading Dodo price";
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

  return (
    <section className="billing-shell">
      <div className="section-heading billing-heading">
        <div>
          <p className="beta-eyebrow">Billing</p>
          <h1>Fix Pack billing</h1>
          <p className="session-note">Private beta session: {billing?.owner?.email || ownerEmail || "active"}</p>
        </div>
        <button
          className="action-link"
          disabled={status === "loading"}
          onClick={() => loadBillingSummary(setBilling, setStatus, setMessage)}
          type="button"
        >
          {status === "loading" ? "Refreshing" : "Refresh"}
        </button>
      </div>

      <StatusMessage tone={status}>{message}</StatusMessage>

      <section className="metric-strip billing-metrics" aria-label="Billing summary">
        <Metric label="Product" value={billing?.product?.name || "Fix Pack"} />
        <Metric label="Requests" value={requests.length} />
        <Metric label="Payments" value={payments.length} />
        <Metric label="Subscription" value={subscription.status === "not_live" ? "None" : subscription.label || "Active"} />
      </section>

      <section className="billing-grid">
        <div className="billing-panel">
          <div className="section-heading">
            <p className="beta-eyebrow">Dodo checkout</p>
            <h2>{billing?.product?.name || "SEO Fix Pack"}</h2>
          </div>
          {pricingUnavailable ? (
            // Customers get a neutral line; pricing/config detail stays on the admin ops page.
            <p className="quiet-note">Checkout opens from a report with proven fixes.</p>
          ) : (
            <div className={`price-preview ${pricing.status === "available" ? "available" : "loading"}`}>
              <strong>{priceLabel}</strong>
              <span>
                {pricing.status === "available" ? "Pulled from Dodo before checkout." : "Checking the live payment source."}
              </span>
            </div>
          )}
          <p>{billing?.product?.description || "One proof-backed repair pass plus one rerun after fixes."}</p>
          {!pricingUnavailable && (
            <p className="quiet-note">
              {billing?.product?.checkoutNote || "Checkout starts from a report with proven fixes."}
            </p>
          )}
        </div>

        <div className="billing-panel">
          <div className="section-heading">
            <p className="beta-eyebrow">Subscription</p>
            <h2>{subscription.label || "No recurring subscription"}</h2>
          </div>
          <p>{subscription.message || "SEO Fix Kit currently sells one-time Fix Pack requests. Repair Agent and Growth Add-On subscriptions remain roadmap."}</p>
          <p className="quiet-note">Provider: {billing?.provider?.name || "Dodo Payments"}</p>
        </div>

        <div className="billing-panel">
          <div className="section-heading">
            <p className="beta-eyebrow">Proof Monitoring</p>
            <h2>{monitoring.status === "active" ? "Monitoring active" : monitoring.checkoutReady ? "Start weekly monitoring" : "Monitoring checkout gated"}</h2>
          </div>
          <p>{monitoring.message || monitoringOffer.description || "Weekly proof monitoring watches verified sites and reports deltas."}</p>
          <button
            className="action-link paid-action"
            disabled={monitoringDisabled}
            onClick={startMonitoringCheckout}
            type="button"
          >
            {monitoringCheckoutStatus === "submitting" ? "Opening checkout" : "Start monitoring checkout"}
          </button>
          <StatusMessage tone={monitoringCheckoutStatus}>{monitoringCheckoutMessage}</StatusMessage>
          <p className="quiet-note">
            Entitlement activates only after Dodo sends the subscription webhook. This does not execute repairs.
          </p>
        </div>
      </section>

      <OfferLadder offers={billing?.offers || []} />

      <section className="billing-panel billing-list-panel">
        <div className="section-heading">
          <p className="beta-eyebrow">Requests</p>
          <h2>Fix Pack status</h2>
        </div>
        <div className="billing-list">
          {requests.map((request) => {
            const readiness = request.deliveryReadiness || {};
            return (
              <article className={`billing-row ${request.status}`} key={request.id}>
                <div>
                  <span className="status-pill">{request.statusLabel || statusLabel(request.status)}</span>
                  <h3>{request.targetHost || request.targetUrl}</h3>
                  <p>{request.issueCount || 0} findings · score {request.score ?? "unknown"}</p>
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
                  {request.reportPath && <Link discover="none" to={request.reportPath}>Report</Link>}
                  {request.briefPath && <a href={request.briefPath}>Brief</a>}
                  {request.deliveryUrl && <a href={request.deliveryUrl} target="_blank" rel="noreferrer">Delivery</a>}
                </div>
              </article>
            );
          })}
          {!requests.length && (
            <p className="quiet-note">
              No Fix Pack requests yet. Run an audit, open a report with proven fixes, then start checkout from that report.
              <Link discover="none" className="inline-link" to="/beta"> Run an audit</Link>
            </p>
          )}
        </div>
      </section>

      <section className="billing-panel billing-list-panel">
        <div className="section-heading">
          <p className="beta-eyebrow">Payment history</p>
          <h2>Dodo records</h2>
        </div>
        <div className="billing-list">
          {payments.map((payment) => (
            <article className={`billing-row ${payment.type}`} key={`${payment.id}-${payment.type}`}>
              <div>
                <span className="status-pill">{payment.type.replaceAll("_", " ")}</span>
                <h3>{payment.targetHost || "Dodo payment"}</h3>
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
                {payment.reportPath && <Link discover="none" to={payment.reportPath}>Report</Link>}
              </div>
            </article>
          ))}
          {!payments.length && <p className="quiet-note">No paid Dodo records for this beta account yet.</p>}
        </div>
      </section>
    </section>
  );
}

export function OfferLadder({ offers = [] }) {
  if (!offers.length) return null;
  return (
    <section className="billing-panel offer-ladder">
      <div className="section-heading">
        <p className="beta-eyebrow">Offer ladder</p>
        <h2>Current and gated products</h2>
      </div>
      <div className="offer-card-grid">
        {offers.map((offer) => (
          <article className={`offer-card ${offer.stage}`} key={offer.key}>
            <div>
              <span className="status-pill">{offer.statusLabel}</span>
              <h3>{offer.name}</h3>
              <strong>{offer.priceRange}</strong>
              <p>{offer.description}</p>
            </div>
            <p className="quiet-note">{offer.availability}</p>
            <div className="offer-requirements">
              {(offer.requirements || []).slice(0, 4).map((requirement) => (
                <span key={requirement}>{requirement}</span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
