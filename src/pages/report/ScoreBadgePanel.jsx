import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CodeBlock } from "../../components/CodeBlock.jsx";
import { CopyButton } from "../../components/CopyButton.jsx";
import { queryKeys } from "../../lib/queries.js";
import { createScoreBadge, loadScoreBadge, revokeScoreBadge } from "../../lib/requests.js";

function shareText(score, scoreDelta) {
  return scoreDelta > 0
    ? `My site's SEO score went up ${scoreDelta} points to ${score}/100. Checked by SEO Fix Kit:`
    : `My site's SEO score is ${score}/100. Checked by SEO Fix Kit:`;
}

export function ScoreBadgePanel({ report }) {
  const queryClient = useQueryClient();
  const key = queryKeys.scoreBadge(report.id);
  const badgeQuery = useQuery({ queryKey: key, queryFn: () => loadScoreBadge(report.id), enabled: Boolean(report.id) });
  const turnOn = useMutation({
    mutationFn: () => createScoreBadge(report.id),
    onSuccess: (payload) => queryClient.setQueryData(key, payload)
  });
  const turnOff = useMutation({
    mutationFn: (id) => revokeScoreBadge(id),
    onSuccess: () => queryClient.setQueryData(key, (current) => ({ ...current, badge: null }))
  });
  const badge = badgeQuery.data?.badge || null;
  const scoreDelta = Number(report.reportDelta?.summary?.scoreDelta || 0);
  const text = shareText(report.score, scoreDelta);
  const error = badgeQuery.error || turnOn.error || turnOff.error;

  return (
    <section className="app-card score-badge-panel" aria-labelledby="score-badge-title">
      <div className="app-card-head">
        <h2 id="score-badge-title">Show off your score</h2>
      </div>
      <p className="app-card-text">
        Put a live score badge on your site and share a public score page. Both update after every check, and only show
        the score and its trend, never the problems.
      </p>
      {badge ? (
        <>
          <a className="score-badge-preview" href={badge.pageUrl} target="_blank" rel="noreferrer">
            <img alt="Your SEO Fix Kit score badge" height="24" src={badge.imageUrl} width="150" />
          </a>
          <div className="score-badge-actions">
            <CopyButton className="app-button" label="Copy badge HTML" value={badge.html} />
            <CopyButton className="app-button-secondary" label="Copy Markdown" value={badge.markdown} />
            <CopyButton className="app-button-secondary" label="Copy score page link" value={badge.pageUrl} />
          </div>
          <CodeBlock code={badge.html} />
          <div className="score-badge-actions">
            <a
              className="app-button-secondary"
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(badge.pageUrl)}`}
              rel="noreferrer"
              target="_blank"
            >
              Share on X
            </a>
            <a
              className="app-button-secondary"
              href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(badge.pageUrl)}`}
              rel="noreferrer"
              target="_blank"
            >
              Share on LinkedIn
            </a>
            <button
              className="text-button"
              disabled={turnOff.isPending}
              onClick={() => turnOff.mutate(badge.id)}
              type="button"
            >
              Turn off badge
            </button>
          </div>
        </>
      ) : (
        <div className="score-badge-actions">
          <button
            className="app-button"
            disabled={badgeQuery.isLoading || turnOn.isPending}
            onClick={() => turnOn.mutate()}
            type="button"
          >
            {turnOn.isPending ? "Turning on…" : "Get my score badge"}
          </button>
        </div>
      )}
      {error && (
        <p className="app-card-text" role="alert">
          {error.message}
        </p>
      )}
    </section>
  );
}
