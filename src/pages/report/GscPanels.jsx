import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import StatusMessage from "../../StatusMessage.jsx";
import { Metric } from "../../components/Metric.jsx";
import { fetchGscConnection, postGscConnect, postGscDisconnect, postGscSync } from "../../lib/requests.js";

export function GscConnectionPanel() {
  const queryClient = useQueryClient();
  const connection = useQuery({ queryKey: ["gsc-connection"], queryFn: fetchGscConnection });
  const [asyncState, setAsyncState] = useState("idle");
  const [message, setMessage] = useState("");
  const data = connection.data || null;

  if (connection.isError) {
    return (
      <section className="app-card gsc-panel" aria-labelledby="gsc-title">
        <div className="app-card-head">
          <h2 id="gsc-title">Google Search Console</h2>
        </div>
        <StatusMessage tone="error">{connection.error?.message || "Google Search Console didn’t load."}</StatusMessage>
      </section>
    );
  }
  if (!data || data.configured === false) return null;

  async function run(action, successMessage) {
    setAsyncState("loading");
    setMessage("");
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ["gsc-connection"] });
      setAsyncState("success");
      setMessage(successMessage);
    } catch (error) {
      setAsyncState("error");
      setMessage(error.message || "Something didn’t work. Try again.");
    }
  }

  async function onConnect() {
    setAsyncState("loading");
    setMessage("Opening Google…");
    try {
      const payload = await postGscConnect();
      window.location.href = payload.authorizeUrl;
    } catch (error) {
      setAsyncState("error");
      setMessage(error.message || "Google sign-in didn’t start. Try again.");
    }
  }

  const summary = data.summary || null;
  return (
    <section className="app-card gsc-panel" aria-labelledby="gsc-title">
      <div className="app-card-head">
        <div>
          <p className="beta-eyebrow">Google Search Console</p>
          <h2 id="gsc-title">{data.connected ? "Connected · read-only" : "Connect Google Search Console"}</h2>
        </div>
      </div>
      <StatusMessage tone={asyncState}>{message}</StatusMessage>
      {data.connected ? (
        <>
          <p className="app-card-text">
            {summary
              ? `Read-only, last 90 days: ${summary.clicks} clicks and ${summary.impressions} impressions across ${summary.pages} pages. The repair queue now puts the faults on pages that already get Google traffic first.`
              : "Connected read-only. Run a sync to pull the last 90 days of clicks and impressions, and the repair queue will rank faults by the Google traffic they put at risk."}
          </p>
          {summary && (
            <div className="app-stats gsc-stats" aria-label="Search Console summary">
              <Metric label="Clicks (90 days)" value={summary.clicks} />
              <Metric label="Impressions" value={summary.impressions} />
              <Metric label="Pages with data" value={summary.pages} />
            </div>
          )}
          {(summary?.topFive || []).length > 0 && (
            <ol className="gsc-top-five">
              {summary.topFive.map((entry) => (
                <li key={`${entry.priority}-${entry.title}`}>
                  <strong>{entry.title}</strong>
                  <span>
                    {entry.trafficClicks} clicks · {entry.reasonText}
                  </span>
                </li>
              ))}
            </ol>
          )}
          <div className="verdict-actions">
            <button
              className="app-button-secondary"
              disabled={asyncState === "loading"}
              onClick={() => run(postGscSync, "Search Console data updated.")}
              type="button"
            >
              {asyncState === "loading" ? "Working…" : "Sync Search Console data"}
            </button>
            <button
              className="app-button-secondary"
              disabled={asyncState === "loading"}
              onClick={() => run(postGscDisconnect, "Disconnected. The stored token is deleted.")}
              type="button"
            >
              Disconnect
            </button>
          </div>
          <p className="app-footnote">
            Read-only access: SEO Fix Kit can see your Search Console performance data and can never change anything in
            Google. Disconnecting deletes the stored token. Your uploaded keyword files stay as a fallback.
          </p>
        </>
      ) : (
        <>
          <p className="app-card-text">
            Connect Search Console in one click and the report puts first the faults on pages that already get Google
            traffic. Read-only access: SEO Fix Kit can see your performance data and can never change anything in
            Google.
          </p>
          <div className="verdict-actions">
            <button className="app-button" disabled={asyncState === "loading"} onClick={onConnect} type="button">
              {asyncState === "loading" ? "Opening Google…" : "Connect Google Search Console"}
            </button>
          </div>
          <p className="app-footnote">Your uploaded keyword files still work as a fallback — nothing is removed.</p>
        </>
      )}
    </section>
  );
}
