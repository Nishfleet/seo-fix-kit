import { useState } from "react";
import { Link } from "react-router";
import StatusMessage from "../../StatusMessage.jsx";
import { Metric } from "../../components/Metric.jsx";
import { copyText } from "../../lib/browser.js";
import { postAdminInvite } from "../../lib/requests.js";
import { FixPackQueue } from "./FixPackQueue.jsx";

export function AdminDashboard({
  adminData,
  adminMessage,
  adminStatus,
  adminToken,
  onInviteCreated,
  onLoad,
  onTokenChange
}) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLabel, setInviteLabel] = useState("");
  const [inviteResult, setInviteResult] = useState(null);
  const metrics = adminData?.metrics || {};

  async function createInvite(event) {
    event.preventDefault();
    setInviteResult(null);
    const result = await postAdminInvite(adminToken, {
      email: inviteEmail,
      label: inviteLabel || "Private beta invite"
    });
    setInviteResult(result);
    if (result?.ok) {
      setInviteEmail("");
      setInviteLabel("");
      onInviteCreated();
    }
  }

  return (
    <section className="admin-shell">
      <div className="section-heading admin-heading">
        <div>
          <p className="beta-eyebrow">Admin</p>
          <h1>Beta ops</h1>
        </div>
        <form className="admin-token-form" onSubmit={(event) => { event.preventDefault(); onLoad(); }}>
          <label htmlFor="admin-token">Admin token</label>
          <input
            id="admin-token"
            onChange={(event) => onTokenChange(event.target.value)}
            placeholder="Bearer token"
            type="password"
            value={adminToken}
          />
          <button className="action-link" type="submit">
            {adminStatus === "loading" ? "Loading" : "Load ops"}
          </button>
        </form>
      </div>

      <StatusMessage tone={adminStatus}>{adminMessage}</StatusMessage>

      <section className="metric-strip admin-metrics" aria-label="Beta ops summary">
        <Metric label="Waitlist" value={metrics.waitlist || 0} />
        <Metric label="Invites" value={metrics.invites || 0} />
        <Metric label="Audits today" value={metrics.auditsToday || 0} />
        <Metric label="Expiring" value={metrics.reportsExpiringSoon || 0} />
        <Metric label="Fix requests" value={metrics.fixRequests || 0} />
      </section>

      <FixPackQueue
        adminToken={adminToken}
        emailConfigured={Boolean(metrics.emailNotificationsConfigured)}
        requests={adminData?.fixQueue || []}
        opsHealth={adminData?.opsHealth || {}}
        statusCounts={metrics.fixRequestStatuses || {}}
        onUpdated={onLoad}
      />

      <section className="admin-grid">
        <div className="admin-panel">
          <div className="section-heading">
            <p className="beta-eyebrow">Recent audits</p>
            <h2>What people are running</h2>
          </div>
          <div className="ops-table">
            {(adminData?.recentAudits || []).map((audit) => (
              <Link className="ops-row" to={audit.reportPath} key={audit.id}>
                <span>{audit.targetHost || new URL(audit.url).hostname}</span>
                <span>{audit.ownerEmail || "unknown"}</span>
                <strong>{audit.score}</strong>
                <span>{audit.totalFindings} findings</span>
              </Link>
            ))}
            {!adminData?.recentAudits?.length && <p className="quiet-note">Load ops to see recent audits.</p>}
          </div>
        </div>

        <div className="admin-panel">
          <div className="section-heading">
            <p className="beta-eyebrow">Invite codes</p>
            <h2>Create a beta invite</h2>
          </div>
          <form className="invite-form" onSubmit={createInvite}>
            <input
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder="founder@example.com"
              required
              type="email"
              value={inviteEmail}
            />
            <input
              onChange={(event) => setInviteLabel(event.target.value)}
              placeholder="Label"
              value={inviteLabel}
            />
            <button className="action-link paid-action" type="submit">
              Create invite
            </button>
          </form>
          {inviteResult?.invite?.url && (
            <div className="invite-result">
              <strong>Invite ready</strong>
              <button type="button" onClick={() => copyText(inviteResult.invite.url)}>
                Copy invite link
              </button>
              <code>{inviteResult.invite.url}</code>
            </div>
          )}
          <StatusMessage tone="error">{inviteResult?.error}</StatusMessage>
          <div className="invite-list">
            {(adminData?.invites || []).slice(0, 6).map((invite) => (
              <div key={invite.id}>
                <strong>{invite.ownerEmail}</strong>
                <span>{invite.status} · {invite.usedCount}/{invite.maxUses}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="admin-grid">
        <div className="admin-panel">
          <div className="section-heading">
            <p className="beta-eyebrow">Repeated issue patterns</p>
            <h2>What the product keeps finding</h2>
          </div>
          <div className="pattern-list">
            {(adminData?.issuePatterns || []).map((pattern) => (
              <div key={pattern.title}>
                <strong>{pattern.title}</strong>
                <span>{pattern.count} reports</span>
              </div>
            ))}
            {!adminData?.issuePatterns?.length && <p className="quiet-note">No issue pattern data yet.</p>}
          </div>
        </div>
        <div className="admin-panel paid-ops-panel">
          <p className="beta-eyebrow">First paid offer</p>
          <h2>{adminData?.offer?.name || "SEO Fix Pack"}</h2>
          <strong>
            {adminData?.paymentHealth?.dodo?.checkoutReady ? "Dodo checkout ready" : "Dodo checkout paused"}
          </strong>
          <p>{adminData?.offer?.description || "One proof-backed repair pass plus one rerun after fixes."}</p>
          {adminData?.paymentHealth?.dodo?.missing?.length > 0 && (
            <p className="quiet-note">Missing: {adminData.paymentHealth.dodo.missing.join(", ")}</p>
          )}
        </div>
      </section>
    </section>
  );
}
