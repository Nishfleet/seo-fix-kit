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
import { Badge, EmptyState, LoadError, SkeletonRows } from "../../components/AppStates.jsx";
import { formatDate } from "../../lib/format.js";
import { statusLabel } from "../../lib/labels.js";
import { queryKeys } from "../../lib/queries.js";
import { fetchBillingSummary } from "../../lib/requests.js";

const PAYMENT_TONES = { payment: "good", refund: "neutral", dispute: "bad", failed_payment: "bad" };

function paymentTypeLabel(type = "") {
  const text = String(type).replaceAll("_", " ");
  return text ? text[0].toUpperCase() + text.slice(1) : "Payment";
}

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
        description="Your plan, Fix Packs and payments. Dodo Payments handles checkout as the merchant of record."
      />

      {billingQuery.isError && (
        <LoadError
          message={billingQuery.error?.message || "Billing details didn’t load. Try again."}
          onRetry={() => billingQuery.refetch()}
        />
      )}
      {billingQuery.isPending && (
        <section className="app-card" aria-label="Loading billing">
          <SkeletonRows rows={4} label="Loading billing" />
        </section>
      )}
      {billing && (
        <>
          <section className="app-card" aria-labelledby="plan-title">
            <div className="app-card-head">
              <h2 id="plan-title">Your plan</h2>
              <Badge tone={monitoringActive ? "good" : "info"}>
                {monitoringActive ? "Proof Monitoring" : "Free beta"}
              </Badge>
            </div>
            <p className="app-card-text">
              {monitoringActive
                ? "Proof Monitoring is on. Your verified sites are rerun every week."
                : "Audits and weekly checks for verified sites are free during the beta. You pay only if you buy a Fix Pack."}
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
              One guided repair pass on a report’s problems, plus one rerun to check the fixes.
            </p>
            <p className="app-footnote">
              One-time payment per report. Buy it from the Problems tab of any report. You see the final price before
              you pay.
            </p>
          </section>

          <section className="app-card" aria-labelledby="requests-title">
            <div className="app-card-head">
              <h2 id="requests-title">Fix Packs</h2>
            </div>
            {requests.length ? (
              <ul className="site-list">
                {requests.map((request) => {
                  const readiness = request.deliveryReadiness || {};
                  const dates = [
                    request.paidAt && `Paid ${formatDate(request.paidAt)}`,
                    request.dueAt && `Due ${formatDate(request.dueAt)}`,
                    request.nextUpdateAt && `Next update ${formatDate(request.nextUpdateAt)}`,
                    request.deliveredAt && `Delivered ${formatDate(request.deliveredAt)}`
                  ].filter(Boolean);
                  return (
                    <li className="site-row" key={request.id}>
                      <div className="site-row-main">
                        <div className="site-row-title">
                          <h3>{request.targetHost || request.targetUrl}</h3>
                          <Badge tone={request.status === "delivered" ? "good" : "info"}>
                            {request.statusLabel || statusLabel(request.status)}
                          </Badge>
                        </div>
                        <p>
                          {request.issueCount || 0} problems · score {request.score ?? "–"}
                          {dates.length ? ` · ${dates.join(" · ")}` : ""}
                        </p>
                        {readiness.status && (
                          <p className="site-row-note">
                            <strong>{deliveryReadinessLabel(readiness)}.</strong> {deliveryReadinessText(readiness)}
                          </p>
                        )}
                      </div>
                      <div className="site-row-actions">
                        {request.reportPath && (
                          <Link discover="none" className="app-button-secondary" to={request.reportPath}>
                            Open report
                          </Link>
                        )}
                        {request.briefPath && (
                          <a className="app-button-secondary" href={request.briefPath}>
                            Download brief
                          </a>
                        )}
                        {request.deliveryUrl && (
                          <a className="app-button" href={request.deliveryUrl} target="_blank" rel="noreferrer">
                            Open delivery
                          </a>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState icon="wrench">
                No Fix Packs yet.{" "}
                <Link discover="none" className="inline-link" to="/beta#new-audit">
                  Run an audit
                </Link>
                , then buy one from the report if you want help with the fixes.
              </EmptyState>
            )}
          </section>

          <section className="app-card" aria-labelledby="payments-title">
            <div className="app-card-head">
              <h2 id="payments-title">Payment history</h2>
            </div>
            {payments.length ? (
              <div className="app-table" role="table" aria-label="Payments">
                <div className="app-table-row app-table-headrow app-table-row-payments" role="row">
                  <span role="columnheader">Date</span>
                  <span role="columnheader">Description</span>
                  <span role="columnheader">Amount</span>
                  <span role="columnheader">Type</span>
                </div>
                {payments.map((payment) => {
                  const date = payment.disputedAt || payment.refundedAt || payment.paidAt;
                  const description = [payment.targetHost, payment.displayReference].filter(Boolean).join(" · ");
                  return (
                    <div
                      className="app-table-row app-table-row-payments"
                      role="row"
                      key={`${payment.id}-${payment.type}`}
                    >
                      <span role="cell" className="app-table-muted">
                        {date ? formatDate(date) : "–"}
                      </span>
                      <span role="cell" className="app-table-primary">
                        {payment.reportPath ? (
                          <Link discover="none" to={payment.reportPath}>
                            {description || "Payment"}
                          </Link>
                        ) : (
                          description || payment.statusLabel || "Payment"
                        )}
                      </span>
                      <span role="cell">
                        {payment.displayRefundAmount ? `−${payment.displayRefundAmount}` : payment.displayAmount || "–"}
                      </span>
                      <span role="cell">
                        <Badge tone={PAYMENT_TONES[payment.type] || "neutral"}>{paymentTypeLabel(payment.type)}</Badge>
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState icon="receipt">No payments yet.</EmptyState>
            )}
          </section>
        </>
      )}
    </div>
  );
}
