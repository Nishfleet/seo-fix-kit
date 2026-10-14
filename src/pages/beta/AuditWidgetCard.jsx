import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import StatusMessage from "../../StatusMessage.jsx";
import { EmptyState, LoadError, SkeletonRows } from "../../components/AppStates.jsx";
import { CodeBlock } from "../../components/CodeBlock.jsx";
import { CopyButton } from "../../components/CopyButton.jsx";
import { formatDate, safeHostnameLabel } from "../../lib/format.js";
import { queryKeys } from "../../lib/queries.js";
import { disableAuditWidget, enableAuditWidget, fetchAuditWidget } from "../../lib/requests.js";

export function AuditWidgetCard() {
  const queryClient = useQueryClient();
  const widgetQuery = useQuery({ queryKey: queryKeys.auditWidget, queryFn: fetchAuditWidget });
  const onSuccess = (data) => queryClient.setQueryData(queryKeys.auditWidget, data);
  const turnOn = useMutation({ mutationFn: enableAuditWidget, onSuccess });
  const turnOff = useMutation({ mutationFn: disableAuditWidget, onSuccess });
  const widget = widgetQuery.data?.widget || null;
  const leads = widgetQuery.data?.leads || [];
  const error = turnOn.error || turnOff.error;

  return (
    <section className="app-card audit-widget-card" aria-labelledby="audit-widget-title">
      <div className="app-card-head">
        <div>
          <h2 id="audit-widget-title">Audit widget</h2>
          <p className="app-card-subtle">
            Put a free SEO check on your own site. Visitors enter their site and email, see their score and top
            problems, and you get the lead by email. It uses your report branding.
          </p>
        </div>
        {widgetQuery.isSuccess && !widget && (
          <div className="app-card-actions">
            <button className="app-button" disabled={turnOn.isPending} onClick={() => turnOn.mutate()} type="button">
              {turnOn.isPending ? "Turning on…" : "Get the widget"}
            </button>
          </div>
        )}
      </div>
      {widgetQuery.isPending && <SkeletonRows rows={1} label="Loading your audit widget" />}
      {widgetQuery.isError && <LoadError message={widgetQuery.error.message} onRetry={() => widgetQuery.refetch()} />}
      {error && <StatusMessage tone="error">{error.message}</StatusMessage>}
      {widget && (
        <>
          <CodeBlock code={widget.embedCode} />
          <div className="audit-widget-actions">
            <CopyButton className="app-button" label="Copy embed code" value={widget.embedCode} />
            <a className="app-button-secondary" href={widget.url} rel="noreferrer" target="_blank">
              Preview
            </a>
            <button className="text-button" disabled={turnOff.isPending} onClick={() => turnOff.mutate()} type="button">
              Turn off widget
            </button>
          </div>
          <h3 className="audit-widget-leads-title">Leads ({leads.length})</h3>
          {leads.length ? (
            <ul className="audit-widget-leads" aria-label="Widget leads">
              {leads.map((lead) => (
                <li key={`${lead.email}-${lead.createdAt}`}>
                  <a href={`mailto:${lead.email}`}>{lead.email}</a>
                  <span>{safeHostnameLabel(lead.url)}</span>
                  <span>{lead.score}/100</span>
                  <span>{formatDate(lead.createdAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="search">No leads yet. Add the embed code to a page on your site.</EmptyState>
          )}
        </>
      )}
    </section>
  );
}
