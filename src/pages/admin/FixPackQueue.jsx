import { useState } from "react";
import StatusMessage from "../../StatusMessage.jsx";
import { beforeAfterText, formatDate, datetimeLocalValue } from "../../lib/format.js";
import { statusLabel } from "../../lib/labels.js";
import { patchAdminFixRequest } from "../../lib/requests.js";

export function FixPackQueue({ adminToken, emailConfigured, requests, opsHealth, statusCounts, onUpdated }) {
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState("");
  const [message, setMessage] = useState("");

  function draftFor(request) {
    return drafts[request.id] || {
      status: request.status || "checkout_created",
      assignedTo: request.assignedTo || "",
      deliveryUrl: request.deliveryUrl || "",
      finalReportId: request.finalReportId || "",
      dueAt: request.dueAt || "",
      nextUpdateAt: request.nextUpdateAt || "",
      statusReason: request.statusReason || "",
      customerNote: request.customerNote || "",
      adminNote: request.adminNote || ""
    };
  }

  function updateDraft(id, patch) {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...(current[id] || {}),
        ...patch
      }
    }));
  }

  async function save(request) {
    setSavingId(request.id);
    setMessage("");
    const result = await patchAdminFixRequest(adminToken, request.id, draftFor(request));
    setSavingId("");
    if (!result.ok) {
      setMessage(result.error || "Could not update the Fix Pack request.");
      return;
    }
    setMessage("Fix Pack queue updated.");
    onUpdated();
  }

  return (
    <section className="admin-panel fix-queue-panel">
      <div className="section-heading queue-heading">
        <div>
          <p className="beta-eyebrow">Paid fulfillment</p>
          <h2>SEO Fix Pack queue</h2>
        </div>
        <div className="queue-summary">
          <span>Checkout {statusCounts.checkout_created || 0}</span>
          <span>Paid {statusCounts.paid || 0}</span>
          <span>In progress {statusCounts.in_progress || 0}</span>
          <span>Delivered {statusCounts.delivered || 0}</span>
          <span>Overdue {opsHealth.overdue || 0}</span>
          <span>{emailConfigured ? "Email on" : "Email config missing"}</span>
        </div>
      </div>
      {message && <StatusMessage tone={message.includes("Could") ? "error" : "success"}>{message}</StatusMessage>}
      <div className="fix-queue-list">
        {requests.map((request) => {
          const draft = draftFor(request);
          const proposalSummary = request.repairProposalSummary || {};
          return (
            <article className={`fix-queue-card ${request.status}`} key={request.id}>
              <div className="fix-queue-main">
                <div>
                  <span className="status-pill">{request.statusLabel || statusLabel(request.status)}</span>
                  {request.isTest && <span className="status-pill test-pill">Test</span>}
                  <h3>{request.targetHost || request.targetUrl}</h3>
                  <p>{request.ownerEmail}</p>
                  <p>{request.issueCount || 0} findings · score {request.score ?? "unknown"}</p>
                  {proposalSummary.status === "ready" && (
                    <p>
                      {proposalSummary.approved || 0}/{proposalSummary.executable || 0} executable proposals approved
                      {proposalSummary.delivered ? ` · ${proposalSummary.delivered} delivered` : ""}
                    </p>
                  )}
                </div>
                <div className="queue-links">
                  <a href={request.reportPath}>Report</a>
                  <a href={request.briefPath}>Brief</a>
                  {request.checkoutUrl && <a href={request.checkoutUrl} target="_blank" rel="noreferrer">Checkout</a>}
                </div>
              </div>
              <div className="fulfillment-grid">
                <label>
                  Status
                  <select
                    onChange={(event) => updateDraft(request.id, { status: event.target.value })}
                    value={draft.status}
                  >
                    <option value="checkout_created">Checkout opened</option>
                    {request.status === "paid" && <option value="paid" disabled>Dodo paid</option>}
                    <option value="in_progress">In progress</option>
                    <option value="delivered">Delivered</option>
                  </select>
                </label>
                <label>
                  Assigned
                  <input
                    onChange={(event) => updateDraft(request.id, { assignedTo: event.target.value })}
                    placeholder="Owner"
                    value={draft.assignedTo}
                  />
                </label>
                <label>
                  Delivery URL
                  <input
                    onChange={(event) => updateDraft(request.id, { deliveryUrl: event.target.value })}
                    placeholder="https://..."
                    value={draft.deliveryUrl}
                  />
                </label>
                <label>
                  Final rerun report ID
                  <input
                    onChange={(event) => updateDraft(request.id, { finalReportId: event.target.value })}
                    placeholder="report id"
                    value={draft.finalReportId}
                  />
                </label>
                <label>
                  Due
                  <input
                    onChange={(event) => updateDraft(request.id, { dueAt: event.target.value })}
                    type="datetime-local"
                    value={datetimeLocalValue(draft.dueAt)}
                  />
                </label>
                <label>
                  Next update
                  <input
                    onChange={(event) => updateDraft(request.id, { nextUpdateAt: event.target.value })}
                    type="datetime-local"
                    value={datetimeLocalValue(draft.nextUpdateAt)}
                  />
                </label>
                <label>
                  Customer note
                  <textarea
                    onChange={(event) => updateDraft(request.id, { customerNote: event.target.value })}
                    placeholder="Visible on customer report"
                    value={draft.customerNote}
                  />
                </label>
                <label>
                  Admin note
                  <textarea
                    onChange={(event) => updateDraft(request.id, { adminNote: event.target.value })}
                    placeholder="Internal"
                    value={draft.adminNote}
                  />
                </label>
                <label>
                  Status reason
                  <input
                    onChange={(event) => updateDraft(request.id, { statusReason: event.target.value })}
                    placeholder="Why this moved"
                    value={draft.statusReason}
                  />
                </label>
              </div>
              <div className="queue-footer">
                <div>
                  {request.paidAt && <span>Paid {formatDate(request.paidAt)}</span>}
                  {request.dueAt && <span> · Due {formatDate(request.dueAt)}</span>}
                  {request.beforeAfterSummary && <span> · {beforeAfterText(request.beforeAfterSummary)}</span>}
                  {request.lastNotificationAt && <span> · Notified {formatDate(request.lastNotificationAt)}</span>}
                  {request.notificationError && <span> · {request.notificationError}</span>}
                </div>
                <button
                  className="action-link paid-action"
                  disabled={savingId === request.id}
                  onClick={() => save(request)}
                  type="button"
                >
                  {savingId === request.id ? "Saving" : "Save"}
                </button>
              </div>
            </article>
          );
        })}
        {!requests.length && <p className="quiet-note">No Fix Pack requests yet.</p>}
      </div>
    </section>
  );
}
