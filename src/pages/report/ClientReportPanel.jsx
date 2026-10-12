import { useEffect, useState } from "react";
import StatusMessage from "../../StatusMessage.jsx";
import { copyText } from "../../lib/browser.js";
import { formatDate, safeHostnameLabel } from "../../lib/format.js";
import {
  loadReportBranding,
  saveReportBranding,
  loadReportDomains,
  createReportDomain,
  verifyReportDomain,
  revokeReportDomain,
  loadReportShares,
  createReportShare,
  revokeReportShare
} from "../../lib/requests.js";

export function ClientReportPanel({ report }) {
  const agencyWorkspace = report.agencyWorkspace || {};
  const [branding, setBranding] = useState({
    agencyName: "",
    logoUrl: "",
    brandColor: "#163f5f",
    accentColor: "#0f9f6e",
    customDomain: "",
    footerText: ""
  });
  const [shares, setShares] = useState([]);
  const [domains, setDomains] = useState([]);
  const [domainName, setDomainName] = useState("");
  const [clientName, setClientName] = useState(() => safeHostnameLabel(report.url));
  const [password, setPassword] = useState("");
  const [passwordHint, setPasswordHint] = useState("");
  const [expiresDays, setExpiresDays] = useState("");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!report.id) return;
    let cancelled = false;
    setStatus("loading");
    setMessage("Loading client report tools.");
    Promise.all([loadReportBranding(), loadReportShares(report.id), loadReportDomains()])
      .then(([brandingPayload, sharesPayload, domainsPayload]) => {
        if (cancelled) return;
        setBranding((current) => ({ ...current, ...(brandingPayload.branding || {}) }));
        setShares(sharesPayload.shares || []);
        setDomains(domainsPayload.domains || []);
        setClientName((current) => current || safeHostnameLabel(report.url));
        setStatus("success");
        setMessage("Client reports ready.");
      })
      .catch((error) => {
        if (cancelled) return;
        setStatus("error");
        setMessage(error.message || "Could not load client report tools.");
      });
    return () => {
      cancelled = true;
    };
  }, [report.id, report.url]);

  function updateBranding(field, value) {
    setBranding((current) => ({ ...current, [field]: value }));
  }

  async function onBrandingSave(event) {
    event.preventDefault();
    setStatus("loading");
    setMessage("Saving branding.");
    try {
      const payload = await saveReportBranding(branding);
      setBranding((current) => ({ ...current, ...(payload.branding || {}) }));
      setStatus("success");
      setMessage("Branding saved.");
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "Could not save branding.");
    }
  }

  async function onShareCreate(event) {
    event.preventDefault();
    setStatus("loading");
    setMessage("Creating client link.");
    try {
      const payload = await createReportShare(report.id, {
        clientName,
        password,
        passwordHint,
        expiresDays: expiresDays ? Number(expiresDays) : 0
      });
      setShares((current) => [payload.share, ...current.filter((share) => share.id !== payload.share.id)]);
      setPassword("");
      setStatus("success");
      setMessage("Client link created.");
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "Could not create client link.");
    }
  }

  async function onShareRevoke(id) {
    setStatus("loading");
    setMessage("Revoking client link.");
    try {
      await revokeReportShare(id);
      setShares((current) => current.filter((share) => share.id !== id));
      setStatus("success");
      setMessage("Client link revoked.");
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "Could not revoke client link.");
    }
  }

  async function onDomainCreate(event) {
    event.preventDefault();
    setStatus("loading");
    setMessage("Creating report domain proof.");
    try {
      const payload = await createReportDomain(domainName);
      setDomains((current) => [payload.domain, ...current.filter((domain) => domain.id !== payload.domain.id)]);
      setDomainName("");
      setStatus("success");
      setMessage("Report domain proof is ready.");
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "Could not create report domain.");
    }
  }

  async function onDomainVerify(id) {
    setStatus("loading");
    setMessage("Checking report domain proof.");
    try {
      const payload = await verifyReportDomain(id);
      setDomains((current) => [payload.domain, ...current.filter((domain) => domain.id !== payload.domain.id)]);
      setStatus("success");
      setMessage("Report domain verified.");
      const sharesPayload = await loadReportShares(report.id);
      setShares(sharesPayload.shares || []);
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "Could not verify report domain.");
    }
  }

  async function onDomainRevoke(id) {
    setStatus("loading");
    setMessage("Removing report domain.");
    try {
      await revokeReportDomain(id);
      setDomains((current) => current.filter((domain) => domain.id !== id));
      setStatus("success");
      setMessage("Report domain removed.");
      const sharesPayload = await loadReportShares(report.id);
      setShares(sharesPayload.shares || []);
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "Could not remove report domain.");
    }
  }

  return (
    <section className="client-report-panel">
      <div className="section-heading">
        <p className="beta-eyebrow">Client reports</p>
        <h2>White-label report links</h2>
        <StatusMessage tone={status}>{message}</StatusMessage>
      </div>
      <div className={`agency-workspace-strip ${agencyWorkspace.status || "beta_allowance"}`}>
        <div>
          <span className="status-pill">Agency Workspace</span>
          <strong>{agencyWorkspace.status === "active" ? "Entitlement active" : "Beta allowance"}</strong>
        </div>
        <p>
          {agencyWorkspace.message ||
            "White-label proof, client links, report domains, and team assignment are beta-gated until Agency Workspace checkout is live."}
        </p>
        {agencyWorkspace.limits && (
          <div className="agency-limit-list">
            <span>{agencyWorkspace.limits.clientLinksPerReport || 10} links/report</span>
            <span>{agencyWorkspace.limits.teamSeats || 10} seats</span>
            <span>{agencyWorkspace.limits.reportDomains || 1} domain</span>
          </div>
        )}
      </div>

      <div className="client-report-grid">
        <form className="client-report-card" onSubmit={onBrandingSave}>
          <div className="client-report-card-head">
            <strong>Branding</strong>
            <button disabled={status === "loading"} type="submit">Save</button>
          </div>
          <label htmlFor="agency-name">Agency name</label>
          <input
            id="agency-name"
            onChange={(event) => updateBranding("agencyName", event.target.value)}
            required
            value={branding.agencyName || ""}
          />
          <label htmlFor="logo-url">Logo URL</label>
          <input
            id="logo-url"
            inputMode="url"
            onChange={(event) => updateBranding("logoUrl", event.target.value)}
            placeholder="https://example.com/logo.png"
            type="url"
            value={branding.logoUrl || ""}
          />
          <div className="color-row">
            <label htmlFor="brand-color">
              Brand
              <input
                id="brand-color"
                onChange={(event) => updateBranding("brandColor", event.target.value)}
                type="color"
                value={branding.brandColor || "#163f5f"}
              />
            </label>
            <label htmlFor="accent-color">
              Accent
              <input
                id="accent-color"
                onChange={(event) => updateBranding("accentColor", event.target.value)}
                type="color"
                value={branding.accentColor || "#0f9f6e"}
              />
            </label>
          </div>
          <label htmlFor="custom-domain">Display domain</label>
          <input
            id="custom-domain"
            onChange={(event) => updateBranding("customDomain", event.target.value)}
            placeholder="reports.example.com"
            value={branding.customDomain || ""}
          />
          <label htmlFor="footer-text">Footer</label>
          <input
            id="footer-text"
            onChange={(event) => updateBranding("footerText", event.target.value)}
            value={branding.footerText || ""}
          />
        </form>

        <form className="client-report-card" onSubmit={onDomainCreate}>
          <div className="client-report-card-head">
            <strong>Custom domain</strong>
            <button disabled={status === "loading"} type="submit">Add</button>
          </div>
          <label htmlFor="report-domain">Report subdomain</label>
          <input
            id="report-domain"
            onChange={(event) => setDomainName(event.target.value)}
            placeholder="reports.example.com"
            required
            value={domainName}
          />
          <div className="domain-list">
            {domains.map((domain) => (
              <article className={`domain-row ${domain.status}`} key={domain.id}>
                <div>
                  <strong>{domain.domain}</strong>
                  <span>{domain.status === "verified" ? "Verified" : "Pending verification"}</span>
                  {domain.cnameTarget && <code>CNAME {domain.cnameTarget}</code>}
                  {domain.dnsName ? (
                    <code>{domain.dnsType || "TXT"} {domain.dnsName}{" -> "}{domain.dnsValue || domain.verificationToken}</code>
                  ) : (
                    <code>{domain.verificationPath}{" -> "}{domain.verificationToken}</code>
                  )}
                  {domain.lastError && <small>{domain.lastError}</small>}
                </div>
                <div className="domain-actions">
                  {domain.status !== "verified" && (
                    <button className="text-button accent-text" disabled={status === "loading"} onClick={() => onDomainVerify(domain.id)} type="button">
                      Verify
                    </button>
                  )}
                  <button className="text-button" disabled={status === "loading"} onClick={() => onDomainRevoke(domain.id)} type="button">
                    Remove
                  </button>
                </div>
              </article>
            ))}
            {!domains.length && <p className="quiet-note">No report domain connected yet.</p>}
          </div>
        </form>

        <form className="client-report-card" onSubmit={onShareCreate}>
          <div className="client-report-card-head">
            <strong>Create link</strong>
            <button disabled={status === "loading"} type="submit">Create</button>
          </div>
          <label htmlFor="client-name">Client name</label>
          <input
            id="client-name"
            onChange={(event) => setClientName(event.target.value)}
            required
            value={clientName}
          />
          <label htmlFor="client-password">Password</label>
          <input
            id="client-password"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Optional"
            type="password"
            value={password}
          />
          <label htmlFor="client-password-hint">Password hint</label>
          <input
            id="client-password-hint"
            onChange={(event) => setPasswordHint(event.target.value)}
            placeholder="Optional"
            value={passwordHint}
          />
          <label htmlFor="expires-days">Expires after days</label>
          <input
            id="expires-days"
            inputMode="numeric"
            min="1"
            max="180"
            onChange={(event) => setExpiresDays(event.target.value)}
            placeholder="Never"
            type="number"
            value={expiresDays}
          />
        </form>
      </div>

      <div className="client-share-list">
        {shares.map((share) => (
          <article className="client-share-row" key={share.id}>
            <div>
              <strong>{share.clientName || safeHostnameLabel(report.url)}</strong>
              <span>
                {share.passwordProtected ? "Password protected" : "Open link"}
                {share.expiresAt ? ` · Expires ${formatDate(share.expiresAt)}` : ""}
                {share.lastViewedAt ? ` · Viewed ${formatDate(share.lastViewedAt)}` : ""}
              </span>
              <code>{share.shareUrl}</code>
            </div>
            <div className="client-share-actions">
              <button className="text-button accent-text" onClick={() => copyText(share.shareUrl)} type="button">
                Copy
              </button>
              <a className="text-button accent-text" href={share.sharePath} target="_blank" rel="noreferrer">
                Open
              </a>
              <a className="text-button accent-text" href={share.pdfPath || `${share.sharePath}.pdf`}>
                PDF
              </a>
              <button className="text-button" disabled={status === "loading"} onClick={() => onShareRevoke(share.id)} type="button">
                Revoke
              </button>
            </div>
          </article>
        ))}
        {!shares.length && <p className="quiet-note">No active client links for this report.</p>}
      </div>
    </section>
  );
}
