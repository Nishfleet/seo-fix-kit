import { useEffect, useMemo, useState } from "react";
import StatusMessage from "../../StatusMessage.jsx";
import {
  repairActionApplyPatch,
  repairActionApprovalPatch,
  repairActionIgnorePatch,
  repairActionImplementationPackAvailable,
  repairActionImplementationPackUrl,
  repairActionProofReceiptAvailable,
  repairActionProofReceiptUrl,
  repairActionRerunPatch
} from "../../repair-action-requests.js";
import { CodeBlock } from "../../components/CodeBlock.jsx";
import { Metric } from "../../components/Metric.jsx";
import { formatDate, safeUrlLabel } from "../../lib/format.js";
import {
  repairStatusLabel,
  repairApprovalLabel,
  repairExecutionLabel,
  repairActionModeLabel,
  teamRoleLabel
} from "../../lib/labels.js";
import {
  mergeRepairQueueWithCollaboration,
  repairBoardCounts,
  collaborationStatusForQueueStatus,
  manualRepairQueueStatus,
  actionTypeForMode
} from "../../lib/repair-board.js";
import {
  loadReportCollaboration,
  saveReportCollaboration,
  loadRepairQueue,
  saveRepairQueue,
  createRepairAction,
  updateRepairAction,
  createTeamMember,
  revokeTeamMember
} from "../../lib/requests.js";

export function TeamRepairBoard({ report }) {
  const [members, setMembers] = useState([]);
  const [issues, setIssues] = useState([]);
  const [draftMember, setDraftMember] = useState({ email: "", name: "", role: "editor" });
  const [statusFilter, setStatusFilter] = useState("active");
  const [savingIssueId, setSavingIssueId] = useState("");
  const [actingIssueId, setActingIssueId] = useState("");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!report.id) return;
    let cancelled = false;
    setStatus("loading");
    setMessage("Loading repair board.");
    Promise.all([
      loadReportCollaboration(report.id),
      loadRepairQueue(report.id)
    ])
      .then(([collaborationPayload, queuePayload]) => {
        if (cancelled) return;
        setMembers(collaborationPayload.members || []);
        setIssues(mergeRepairQueueWithCollaboration(queuePayload.items || [], collaborationPayload.issues || []));
        setStatus("success");
        setMessage("Repair queue ready.");
      })
      .catch((error) => {
        if (cancelled) return;
        setStatus("error");
        setMessage(error.message || "Could not load repair queue.");
      });
    return () => {
      cancelled = true;
    };
  }, [report.id]);

  const boardCounts = useMemo(() => repairBoardCounts(issues), [issues]);
  const visibleIssues = useMemo(() => {
    if (statusFilter === "all") return issues;
    if (statusFilter === "active") {
      return issues.filter((issue) => !["fixed", "ignored"].includes(issue.status));
    }
    return issues.filter((issue) => issue.status === statusFilter);
  }, [issues, statusFilter]);

  function updateIssue(issueId, patch) {
    const nextPatch = { ...patch };
    if (patch.status && !["fixed", "regressed"].includes(patch.status)) {
      nextPatch.rerunStatus = "not_run";
    }
    setIssues((current) =>
      current.map((issue) => (issue.issueId === issueId ? { ...issue, ...nextPatch } : issue))
    );
  }

  async function reloadBoard(nextMessage = "Repair board updated.") {
    const [collaborationPayload, queuePayload] = await Promise.all([
      loadReportCollaboration(report.id),
      loadRepairQueue(report.id)
    ]);
    setMembers(collaborationPayload.members || []);
    setIssues(mergeRepairQueueWithCollaboration(queuePayload.items || [], collaborationPayload.issues || []));
    setStatus("success");
    setMessage(nextMessage);
  }

  async function onMemberCreate(event) {
    event.preventDefault();
    setStatus("loading");
    setMessage("Adding teammate.");
    try {
      await createTeamMember(draftMember);
      setDraftMember({ email: "", name: "", role: "editor" });
      await reloadBoard("Teammate added.");
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "Could not add teammate.");
    }
  }

  async function onMemberRevoke(id) {
    setStatus("loading");
    setMessage("Removing teammate.");
    try {
      await revokeTeamMember(id);
      await reloadBoard("Teammate removed.");
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "Could not remove teammate.");
    }
  }

  async function onIssueSave(issue) {
    setSavingIssueId(issue.issueId);
    setStatus("loading");
    setMessage("Saving repair item.");
    try {
      const queueItem = {
        issueId: issue.issueId,
        actionMode: issue.actionMode
      };
      if (manualRepairQueueStatus(issue.status)) {
        queueItem.status = issue.status;
        queueItem.rerunStatus = "not_run";
        queueItem.lastRerunReportId = "";
      }
      const writes = [
        saveRepairQueue(report.id, {
          items: [queueItem]
        })
      ];
      if (issue.sourceKind !== "repair_plan") {
        writes.push(saveReportCollaboration(report.id, {
          items: [{
            issueId: issue.issueId,
            status: collaborationStatusForQueueStatus(issue.status),
            assigneeEmail: issue.assigneeEmail,
            note: issue.note
          }]
        }));
      }
      await Promise.all(writes);
      await reloadBoard("Repair item saved.");
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "Could not save repair item.");
    } finally {
      setSavingIssueId("");
    }
  }

  async function onActionDraft(issue) {
    setActingIssueId(issue.issueId);
    setStatus("loading");
    setMessage("Drafting agent action.");
    try {
      const payload = await createRepairAction(report.id, {
        issueId: issue.issueId,
        actionMode: issue.actionMode || "self_serve",
        actionType: actionTypeForMode(issue.actionMode),
        proposedChange: issue.proposedChange || ""
      });
      if (payload.queue?.items) {
        const collaborationPayload = await loadReportCollaboration(report.id);
        setIssues(mergeRepairQueueWithCollaboration(payload.queue.items, collaborationPayload.issues || []));
      } else {
        await reloadBoard("Agent action drafted.");
      }
      setStatus("success");
      setMessage("Agent action drafted for review.");
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "Could not draft agent action.");
    } finally {
      setActingIssueId("");
    }
  }

  async function onActionUpdate(issue, patch, options = {}) {
    if (!issue.latestAction?.id) return;
    setActingIssueId(issue.issueId);
    setStatus("loading");
    setMessage(options.pendingMessage || "Updating agent action.");
    try {
      const payload = await updateRepairAction(report.id, issue.latestAction.id, patch);
      if (payload.queue?.items) {
        const collaborationPayload = await loadReportCollaboration(report.id);
        setIssues(mergeRepairQueueWithCollaboration(payload.queue.items, collaborationPayload.issues || []));
      } else {
        await reloadBoard("Agent action updated.");
      }
      setStatus("success");
      setMessage(options.successMessage || "Agent action updated.");
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "Could not update agent action.");
    } finally {
      setActingIssueId("");
    }
  }

  async function onActionRerun(issue, rerunState) {
    const rerunReportId = issue.lastRerunReportId || issue.rerunReportId || "";
    if (!rerunReportId) {
      setStatus("error");
      setMessage("Enter the rerun report ID before closing proof.");
      return;
    }
    await onActionUpdate(issue, repairActionRerunPatch(rerunState, rerunReportId), {
      pendingMessage: "Attaching rerun proof.",
      successMessage: rerunState === "fixed" ? "Repair marked fixed from rerun proof." : "Rerun proof recorded."
    });
  }

  return (
    <section className="team-repair-panel">
      <div className="section-heading queue-heading">
        <div>
          <p className="beta-eyebrow">Repair agent</p>
          <h2>Proof-backed queue and safe action drafts</h2>
          <StatusMessage tone={status}>{message}</StatusMessage>
        </div>
        <label className="repair-filter">
          View
          <select
            onChange={(event) => setStatusFilter(event.target.value)}
            value={statusFilter}
          >
            <option value="active">Active</option>
            <option value="all">All</option>
            <option value="drafted">Drafted</option>
            <option value="approved">Approved</option>
            <option value="applied">Applied</option>
            <option value="fixed">Fixed</option>
            <option value="ignored">Ignored</option>
            <option value="regressed">Regressed</option>
          </select>
        </label>
      </div>

      <div className="team-board-summary">
        <Metric label="Issues" value={boardCounts.total} />
        <Metric label="Drafted" value={boardCounts.drafted} />
        <Metric label="Approved" value={boardCounts.approved} />
        <Metric label="Fixed" value={boardCounts.fixed} />
      </div>

      <div className="team-collab-grid">
        <form className="team-member-card" onSubmit={onMemberCreate}>
          <div className="client-report-card-head">
            <strong>Teammates</strong>
            <button disabled={status === "loading"} type="submit">Add</button>
          </div>
          <label htmlFor="team-email">Email</label>
          <input
            id="team-email"
            inputMode="email"
            onChange={(event) => setDraftMember((current) => ({ ...current, email: event.target.value }))}
            placeholder="teammate@example.com"
            required
            type="email"
            value={draftMember.email}
          />
          <label htmlFor="team-name">Name</label>
          <input
            id="team-name"
            onChange={(event) => setDraftMember((current) => ({ ...current, name: event.target.value }))}
            placeholder="Optional"
            value={draftMember.name}
          />
          <label htmlFor="team-role">Role</label>
          <select
            id="team-role"
            onChange={(event) => setDraftMember((current) => ({ ...current, role: event.target.value }))}
            value={draftMember.role}
          >
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
            <option value="admin">Admin</option>
          </select>

          <div className="team-member-list">
            {members.map((member) => (
              <div className="team-member-row" key={member.id}>
                <div>
                  <strong>{member.name || member.email}</strong>
                  <span>{member.email} · {teamRoleLabel(member.role)}</span>
                </div>
                <button className="text-button" disabled={status === "loading"} onClick={() => onMemberRevoke(member.id)} type="button">
                  Remove
                </button>
              </div>
            ))}
            {!members.length && <p className="quiet-note">Add teammates to assign proven issues.</p>}
          </div>
        </form>

        <div className="issue-board-list">
          {visibleIssues.slice(0, 12).map((issue) => (
            <article className={`issue-board-card ${issue.status}`} key={issue.issueId}>
              <div className="issue-board-head">
                <div>
                  <div className="repair-pill-row">
                    <span className={`status-pill ${issue.severity}`}>{issue.severity}</span>
                    <span className={`status-pill ${issue.status}`}>{repairStatusLabel(issue.status)}</span>
                    {issue.latestAction && <span className="status-pill">{repairApprovalLabel(issue.latestAction.approvalState)}</span>}
                  </div>
                  <h3>{issue.title}</h3>
                  <p>{issue.pageLabel || safeUrlLabel(issue.pageUrl)} - {issue.fix}</p>
                </div>
                <button
                  className="action-link"
                  disabled={savingIssueId === issue.issueId || status === "loading"}
                  onClick={() => onIssueSave(issue)}
                  type="button"
                >
                  Save
                </button>
              </div>
              <div className="repair-proof-block">
                <div>
                  <span>Proof</span>
                  <p>{issue.proof || "Proof was stored with the report finding."}</p>
                </div>
                <div>
                  <span>Acceptance</span>
                  <p>{issue.acceptance || "Rerun the audit and confirm the finding no longer appears."}</p>
                </div>
                {issue.snippet && <CodeBlock code={issue.snippet} />}
              </div>
              <div className="issue-board-controls">
                <label>
                  Status
                  <select
                    onChange={(event) => updateIssue(issue.issueId, { status: event.target.value || issue.status || "open" })}
                    value={manualRepairQueueStatus(issue.status)}
                  >
                    <option value="">Managed by action</option>
                    <option value="open">Open</option>
                    <option value="in_progress">In progress</option>
                    <option value="ignored">Ignored</option>
                  </select>
                </label>
                <label>
                  Action mode
                  <select
                    onChange={(event) => updateIssue(issue.issueId, { actionMode: event.target.value })}
                    value={issue.actionMode || "self_serve"}
                  >
                    <option value="self_serve">Self serve</option>
                    <option value="teammate">Teammate</option>
                    <option value="fix_pack">Fix Pack</option>
                    <option value="cms_draft">CMS draft</option>
                    <option value="github_pr">Future PR</option>
                  </select>
                </label>
                {issue.sourceKind !== "repair_plan" && (
                  <label>
                    Assignee
                    <select
                      onChange={(event) => updateIssue(issue.issueId, { assigneeEmail: event.target.value })}
                      value={issue.assigneeEmail || ""}
                    >
                      <option value="">Unassigned</option>
                      {members.map((member) => (
                        <option key={member.id} value={member.email}>
                          {member.name || member.email}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {issue.latestAction?.executionState === "applied" && (
                  <label>
                    Rerun report ID
                    <input
                      onChange={(event) => updateIssue(issue.issueId, { lastRerunReportId: event.target.value })}
                      placeholder="Paste rerun report ID"
                      value={issue.lastRerunReportId || ""}
                    />
                  </label>
                )}
                {issue.sourceKind !== "repair_plan" && (
                  <label>
                    Note
                    <textarea
                      onChange={(event) => updateIssue(issue.issueId, { note: event.target.value })}
                      placeholder="Internal note or next repair step"
                      value={issue.note || ""}
                    />
                  </label>
                )}
              </div>
              <div className="repair-action-strip">
                <div>
                  <strong>{issue.latestAction ? "Latest agent action" : "No agent action drafted"}</strong>
                  <span>
                    {issue.latestAction
                      ? `${repairActionModeLabel(issue.latestAction.actionMode)} - ${repairApprovalLabel(issue.latestAction.approvalState)} - ${repairExecutionLabel(issue.latestAction.executionState)}`
                      : "Drafts are saved for review and do not publish anything."}
                  </span>
                  {issue.latestAction?.proposedChange && <p>{issue.latestAction.proposedChange}</p>}
                </div>
                <div className="repair-action-buttons">
                  {repairActionImplementationPackAvailable(issue.latestAction) && (
                    <a
                      className="action-link"
                      href={repairActionImplementationPackUrl(report.id, issue.latestAction.id)}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Implementation pack
                    </a>
                  )}
                  {issue.rerunStatus === "fixed" && repairActionProofReceiptAvailable(issue.latestAction) && (
                    <a
                      className="action-link"
                      href={repairActionProofReceiptUrl(report.id, issue.latestAction.id)}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Proof receipt
                    </a>
                  )}
                  <button
                    className="action-link"
                    disabled={actingIssueId === issue.issueId || status === "loading"}
                    onClick={() => onActionDraft(issue)}
                    type="button"
                  >
                    Draft action
                  </button>
                  {issue.latestAction?.approvalState === "drafted" && (
                    <>
                      <button
                        className="action-link paid-action"
                        disabled={actingIssueId === issue.issueId || status === "loading"}
                        onClick={() => onActionUpdate(issue, repairActionApprovalPatch(), {
                          pendingMessage: "Approving agent action.",
                          successMessage: "Agent action approved."
                        })}
                        type="button"
                      >
                        Approve
                      </button>
                      <button
                        className="text-button"
                        disabled={actingIssueId === issue.issueId || status === "loading"}
                        onClick={() => onActionUpdate(issue, repairActionIgnorePatch(), {
                          pendingMessage: "Ignoring agent action.",
                          successMessage: "Agent action ignored."
                        })}
                        type="button"
                      >
                        Ignore
                      </button>
	                    </>
	                  )}
                  {issue.latestAction?.approvalState === "approved" && issue.latestAction?.executionState !== "applied" && (
                    <button
                      className="action-link paid-action"
                      disabled={actingIssueId === issue.issueId || status === "loading"}
                      onClick={() => onActionUpdate(issue, repairActionApplyPatch(), {
                        pendingMessage: "Marking approved action applied.",
                        successMessage: "Agent action marked applied."
                      })}
                      type="button"
                    >
                      Apply
                    </button>
                  )}
                  {issue.latestAction?.executionState === "applied" && (
                    <>
                      <button
                        className="action-link paid-action"
                        disabled={actingIssueId === issue.issueId || status === "loading"}
                        onClick={() => onActionRerun(issue, "fixed")}
                        type="button"
                      >
                        Fixed
                      </button>
                      <button
                        className="text-button"
                        disabled={actingIssueId === issue.issueId || status === "loading"}
                        onClick={() => onActionRerun(issue, "still_open")}
                        type="button"
                      >
                        Still open
                      </button>
                      <button
                        className="text-button"
                        disabled={actingIssueId === issue.issueId || status === "loading"}
                        onClick={() => onActionRerun(issue, "regressed")}
                        type="button"
                      >
                        Regressed
                      </button>
                    </>
                  )}
                </div>
              </div>
              {issue.updatedAt && (
                <p className="quiet-note">Updated {formatDate(issue.updatedAt)}{issue.updatedByEmail ? ` by ${issue.updatedByEmail}` : ""}</p>
              )}
            </article>
          ))}
          {!visibleIssues.length && <p className="quiet-note">No repair items match this filter.</p>}
        </div>
      </div>
    </section>
  );
}
