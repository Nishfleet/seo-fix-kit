import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import StatusMessage from "../../StatusMessage.jsx";
import { copyText } from "../../lib/browser.js";
import { formatDate, safeHostnameLabel } from "../../lib/format.js";
import { queryKeys } from "../../lib/queries.js";
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

const NO_ITEMS = [];
const DEFAULT_BRANDING = {
  agencyName: "",
  logoUrl: "",
  brandColor: "#163f5f",
  accentColor: "#0f9f6e",
  customDomain: "",
  footerText: ""
};

async function fetchClientTools(reportId) {
  const [brandingPayload, sharesPayload, domainsPayload] = await Promise.all([
    loadReportBranding(),
    loadReportShares(reportId),
    loadReportDomains()
  ]);
  return {
    branding: brandingPayload.branding || {},
    shares: sharesPayload.shares || [],
    domains: domainsPayload.domains || []
  };
}

export function ClientReportPanel({ report }) {
  const queryClient = useQueryClient();
  const toolsKey = queryKeys.clientTools(report.id);
  const tools = useQuery({
    queryKey: toolsKey,
    queryFn: () => fetchClientTools(report.id),
    enabled: Boolean(report.id)
  });
  const [brandingDraft, setBrandingDraft] = useState(null);
  const branding = brandingDraft || { ...DEFAULT_BRANDING, ...(tools.data?.branding || {}) };
  const shares = tools.data?.shares || NO_ITEMS;
  const domains = tools.data?.domains || NO_ITEMS;
  const [domainName, setDomainName] = useState("");
  const [clientName, setClientName] = useState(() => safeHostnameLabel(report.url));
  const [password, setPassword] = useState("");
  const [passwordHint, setPasswordHint] = useState("");
  const [expiresDays, setExpiresDays] = useState("");
  const [actionStatus, setStatus] = useState("idle");
  const [actionMessage, setMessage] = useState("");
  const status =
    actionStatus !== "idle"
      ? actionStatus
      : tools.isLoading
        ? "loading"
        : tools.isError
          ? "error"
          : tools.isSuccess
            ? "success"
            : "idle";
  const message =
    actionMessage ||
    (tools.isLoading
      ? "Loading client links and branding…"
      : tools.isError
        ? tools.error?.message || "Client links and branding didn’t load. Reload the page to try again."
        : "");

  function updateTools(field, update) {
    queryClient.setQueryData(toolsKey, (current = { branding: {}, shares: [], domains: [] }) => ({
      ...current,
      [field]: typeof update === "function" ? update(current[field] || []) : update
    }));
  }
  const setShares = (update) => updateTools("shares", update);
  const setDomains = (update) => updateTools("domains", update);
  function setBranding(update) {
    setBrandingDraft((current) => (typeof update === "function" ? update(current || branding) : update));
  }

  function updateBranding(field, value) {
    setBranding((current) => ({ ...current, [field]: value }));
  }

  async function onBrandingSave(event) {
    event.preventDefault();
    setStatus("loading");
    setMessage("Saving branding…");
    try {
      const payload = await saveReportBranding(branding);
      updateTools("branding", { ...branding, ...(payload.branding || {}) });
      setBrandingDraft(null);
      setStatus("success");
      setMessage("Branding saved.");
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "Branding didn’t save. Try again.");
    }
  }

  async function onShareCreate(event) {
    event.preventDefault();
    setStatus("loading");
    setMessage("Creating client link…");
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
      setMessage(error.message || "The client link wasn’t created. Try again.");
    }
  }

  async function onShareRevoke(id) {
    setStatus("loading");
    setMessage("Revoking client link…");
    try {
      await revokeReportShare(id);
      setShares((current) => current.filter((share) => share.id !== id));
      setStatus("success");
      setMessage("Client link revoked.");
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "The client link wasn’t revoked. Try again.");
    }
  }

  async function onDomainCreate(event) {
    event.preventDefault();
    setStatus("loading");
    setMessage("Adding domain…");
    try {
      const payload = await createReportDomain(domainName);
      setDomains((current) => [payload.domain, ...current.filter((domain) => domain.id !== payload.domain.id)]);
      setDomainName("");
      setStatus("success");
      setMessage("Domain added. Add the DNS records shown, then click Verify.");
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "The domain wasn’t added. Check it and try again.");
    }
  }

  async function onDomainVerify(id) {
    setStatus("loading");
    setMessage("Checking DNS records…");
    try {
      const payload = await verifyReportDomain(id);
      setDomains((current) => [payload.domain, ...current.filter((domain) => domain.id !== payload.domain.id)]);
      setStatus("success");
      setMessage("Domain verified.");
      const sharesPayload = await loadReportShares(report.id);
      setShares(sharesPayload.shares || []);
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "Domain not verified yet. DNS changes can take a few minutes. Try again shortly.");
    }
  }

  async function onDomainRevoke(id) {
    setStatus("loading");
    setMessage("Removing domain…");
    try {
      await revokeReportDomain(id);
      setDomains((current) => current.filter((domain) => domain.id !== id));
      setStatus("success");
      setMessage("Domain removed.");
      const sharesPayload = await loadReportShares(report.id);
      setShares(sharesPayload.shares || []);
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "The domain wasn’t removed. Try again.");
    }
  }

  return (
    <section className="client-report-panel">
      <div className="section-heading">
        <p className="beta-eyebrow">Client reports</p>
        <h2>Share this report with a client</h2>
        <p>Send a link or PDF with your own name, logo and colours. Free during the beta.</p>
        <StatusMessage tone={status}>{message}</StatusMessage>
      </div>
      <div className="client-report-grid">
        <form className="client-report-card" onSubmit={onBrandingSave}>
          <div className="client-report-card-head">
            <strong>Branding</strong>
            <button disabled={status === "loading"} type="submit">
              Save branding
            </button>
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
              Brand color
              <input
                id="brand-color"
                onChange={(event) => updateBranding("brandColor", event.target.value)}
                type="color"
                value={branding.brandColor || "#163f5f"}
              />
            </label>
            <label htmlFor="accent-color">
              Accent color
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
          <label htmlFor="footer-text">Footer text</label>
          <input
            id="footer-text"
            onChange={(event) => updateBranding("footerText", event.target.value)}
            value={branding.footerText || ""}
          />
        </form>

        <form className="client-report-card" onSubmit={onDomainCreate}>
          <div className="client-report-card-head">
            <strong>Custom domain</strong>
            <button disabled={status === "loading"} type="submit">
              Add domain
            </button>
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
                  <span>{domain.status === "verified" ? "Verified" : "Not verified yet"}</span>
                  {domain.cnameTarget && <code>CNAME {domain.cnameTarget}</code>}
                  {domain.dnsName ? (
                    <code>
                      {domain.dnsType || "TXT"} {domain.dnsName}
                      {" -> "}
                      {domain.dnsValue || domain.verificationToken}
                    </code>
                  ) : (
                    <code>
                      {domain.verificationPath}
                      {" -> "}
                      {domain.verificationToken}
                    </code>
                  )}
                  {domain.lastError && <small>{domain.lastError}</small>}
                </div>
                <div className="domain-actions">
                  {domain.status !== "verified" && (
                    <button
                      className="text-button accent-text"
                      disabled={status === "loading"}
                      onClick={() => onDomainVerify(domain.id)}
                      type="button"
                    >
                      Verify
                    </button>
                  )}
                  <button
                    className="text-button"
                    disabled={status === "loading"}
                    onClick={() => onDomainRevoke(domain.id)}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              </article>
            ))}
            {!domains.length && (
              <p className="quiet-note">No custom domain yet. Add a subdomain like reports.example.com.</p>
            )}
          </div>
        </form>

        <form className="client-report-card" onSubmit={onShareCreate}>
          <div className="client-report-card-head">
            <strong>Client link</strong>
            <button disabled={status === "loading"} type="submit">
              Create link
            </button>
          </div>
          <label htmlFor="client-name">Client name</label>
          <input id="client-name" onChange={(event) => setClientName(event.target.value)} required value={clientName} />
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
          <label htmlFor="expires-days">Expires after (days)</label>
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
                {share.passwordProtected ? "Password protected" : "No password"}
                {share.expiresAt ? ` · Expires ${formatDate(share.expiresAt)}` : ""}
                {share.lastViewedAt ? ` · Viewed ${formatDate(share.lastViewedAt)}` : ""}
              </span>
              <code>{share.shareUrl}</code>
            </div>
            <div className="client-share-actions">
              <button className="text-button accent-text" onClick={() => copyText(share.shareUrl)} type="button">
                Copy link
              </button>
              <a className="text-button accent-text" href={share.sharePath} target="_blank" rel="noreferrer">
                Open
              </a>
              <a className="text-button accent-text" href={share.pdfPath || `${share.sharePath}.pdf`}>
                PDF
              </a>
              <button
                className="text-button"
                disabled={status === "loading"}
                onClick={() => onShareRevoke(share.id)}
                type="button"
              >
                Revoke
              </button>
            </div>
          </article>
        ))}
        {!shares.length && <p className="quiet-note">No client links yet. Create one above.</p>}
      </div>
    </section>
  );
}
