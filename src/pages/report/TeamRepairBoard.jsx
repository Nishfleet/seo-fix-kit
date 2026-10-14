import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import { queryKeys } from "../../lib/queries.js";
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

const NO_ITEMS = [];

async function fetchRepairBoard(reportId) {
  const [collaborationPayload, queuePayload] = await Promise.all([
    loadReportCollaboration(reportId),
    loadRepairQueue(reportId)
  ]);
  return {
    members: collaborationPayload.members || [],
    issues: mergeRepairQueueWithCollaboration(queuePayload.items || [], collaborationPayload.issues || [])
  };
}

export function TeamRepairBoard({ report }) {
  const queryClient = useQueryClient();
  const boardKey = queryKeys.repairBoard(report.id);
  const board = useQuery({
    queryKey: boardKey,
    queryFn: () => fetchRepairBoard(report.id),
    enabled: Boolean(report.id)
  });
  const members = board.data?.members || NO_ITEMS;
  const issues = board.data?.issues || NO_ITEMS;
  const [draftMember, setDraftMember] = useState({ email: "", name: "", role: "editor" });
  const [statusFilter, setStatusFilter] = useState("active");
  const [savingIssueId, setSavingIssueId] = useState("");
  const [actingIssueId, setActingIssueId] = useState("");
  const [actionStatus, setStatus] = useState("idle");
  const [actionMessage, setMessage] = useState("");
  const status =
    actionStatus !== "idle"
      ? actionStatus
      : board.isLoading
        ? "loading"
        : board.isError
          ? "error"
          : board.isSuccess
            ? "success"
            : "idle";
  const message =
    actionMessage ||
    (board.isLoading
      ? "Loading repair queue…"
      : board.isError
        ? board.error?.message || "The repair queue didn’t load. Reload the page to try again."
        : board.isSuccess
          ? "Repair queue ready."
          : "");

  function setIssues(update) {
    queryClient.setQueryData(boardKey, (current = { members: [], issues: [] }) => ({
      ...current,
      issues: typeof update === "function" ? update(current.issues) : update
    }));
  }

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
    setIssues((current) => current.map((issue) => (issue.issueId === issueId ? { ...issue, ...nextPatch } : issue)));
  }

  async function reloadBoard(nextMessage = "Repair board updated.") {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: boardKey, exact: true }),
      queryClient.invalidateQueries({ queryKey: queryKeys.repairQueue(report.id), exact: true })
    ]);
    setStatus("success");
    setMessage(nextMessage);
  }

  async function onMemberCreate(event) {
    event.preventDefault();
    setStatus("loading");
    setMessage("Adding teammate…");
    try {
      await createTeamMember(draftMember);
      setDraftMember({ email: "", name: "", role: "editor" });
      await reloadBoard("Teammate added.");
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "The teammate wasn’t added. Check the email and try again.");
    }
  }

  async function onMemberRevoke(id) {
    setStatus("loading");
    setMessage("Removing teammate…");
    try {
      await revokeTeamMember(id);
      await reloadBoard("Teammate removed.");
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "The teammate wasn’t removed. Try again.");
    }
  }

  async function onIssueSave(issue) {
    setSavingIssueId(issue.issueId);
    setStatus("loading");
    setMessage("Saving…");
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
        writes.push(
          saveReportCollaboration(report.id, {
            items: [
              {
                issueId: issue.issueId,
                status: collaborationStatusForQueueStatus(issue.status),
                assigneeEmail: issue.assigneeEmail,
                note: issue.note
              }
            ]
          })
        );
      }
      await Promise.all(writes);
      await reloadBoard("Saved.");
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "That fix didn’t save. Try again.");
    } finally {
      setSavingIssueId("");
    }
  }

  async function onActionDraft(issue) {
    setActingIssueId(issue.issueId);
    setStatus("loading");
    setMessage("Drafting a change…");
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
        queryClient.invalidateQueries({ queryKey: queryKeys.repairQueue(report.id), exact: true });
      } else {
        await reloadBoard("Draft saved.");
      }
      setStatus("success");
      setMessage("Draft saved for review.");
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "The draft wasn’t created. Try again.");
    } finally {
      setActingIssueId("");
    }
  }

  async function onActionUpdate(issue, patch, options = {}) {
    if (!issue.latestAction?.id) return;
    setActingIssueId(issue.issueId);
    setStatus("loading");
    setMessage(options.pendingMessage || "Updating draft…");
    try {
      const payload = await updateRepairAction(report.id, issue.latestAction.id, patch);
      if (payload.queue?.items) {
        const collaborationPayload = await loadReportCollaboration(report.id);
        setIssues(mergeRepairQueueWithCollaboration(payload.queue.items, collaborationPayload.issues || []));
        queryClient.invalidateQueries({ queryKey: queryKeys.repairQueue(report.id), exact: true });
      } else {
        await reloadBoard("Draft updated.");
      }
      setStatus("success");
      setMessage(options.successMessage || "Draft updated.");
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "The draft wasn’t updated. Try again.");
    } finally {
      setActingIssueId("");
    }
  }

  async function onActionRerun(issue, rerunState) {
    const rerunReportId = issue.lastRerunReportId || issue.rerunReportId || "";
    if (!rerunReportId) {
      setStatus("error");
      setMessage("Paste the rerun report ID first.");
      return;
    }
    await onActionUpdate(issue, repairActionRerunPatch(rerunState, rerunReportId), {
      pendingMessage: "Saving rerun result…",
      successMessage: rerunState === "fixed" ? "Marked fixed. The rerun confirms it." : "Rerun result saved."
    });
  }

  return (
    <section className="team-repair-panel">
      <div className="section-heading queue-heading">
        <div>
          <p className="beta-eyebrow">Repair queue</p>
          <h2>Assign, draft and track each fix</h2>
          <StatusMessage tone={status}>{message}</StatusMessage>
        </div>
        <label className="repair-filter">
          View
          <select onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
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
        <Metric label="Problems" value={boardCounts.total} />
        <Metric label="Drafted" value={boardCounts.drafted} />
        <Metric label="Approved" value={boardCounts.approved} />
        <Metric label="Fixed" value={boardCounts.fixed} />
      </div>

      <div className="team-collab-grid">
        <form className="team-member-card" onSubmit={onMemberCreate}>
          <div className="client-report-card-head">
            <strong>Teammates</strong>
            <button disabled={status === "loading"} type="submit">
              Add
            </button>
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
                  <span>
                    {member.email} · {teamRoleLabel(member.role)}
                  </span>
                </div>
                <button
                  className="text-button"
                  disabled={status === "loading"}
                  onClick={() => onMemberRevoke(member.id)}
                  type="button"
                >
                  Remove
                </button>
              </div>
            ))}
            {!members.length && <p className="quiet-note">No teammates yet. Add one to assign problems.</p>}
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
                    {issue.latestAction && (
                      <span className="status-pill">{repairApprovalLabel(issue.latestAction.approvalState)}</span>
                    )}
                  </div>
                  <h3>{issue.title}</h3>
                  <p>
                    {issue.pageLabel || safeUrlLabel(issue.pageUrl)}: {issue.fix}
                  </p>
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
                  <span>Evidence</span>
                  <p>{issue.proof || "See this problem in the Problems tab for evidence."}</p>
                </div>
                <div>
                  <span>Done when</span>
                  <p>{issue.acceptance || "A rerun no longer finds this problem."}</p>
                </div>
                {issue.snippet && <CodeBlock code={issue.snippet} />}
              </div>
              <div className="issue-board-controls">
                <label>
                  Status
                  <select
                    onChange={(event) =>
                      updateIssue(issue.issueId, { status: event.target.value || issue.status || "open" })
                    }
                    value={manualRepairQueueStatus(issue.status)}
                  >
                    <option value="">Set by draft</option>
                    <option value="open">Open</option>
                    <option value="in_progress">In progress</option>
                    <option value="ignored">Ignored</option>
                  </select>
                </label>
                <label>
                  Who fixes it
                  <select
                    onChange={(event) => updateIssue(issue.issueId, { actionMode: event.target.value })}
                    value={issue.actionMode || "self_serve"}
                  >
                    <option value="self_serve">Do it yourself</option>
                    <option value="teammate">Teammate</option>
                    <option value="fix_pack">Fix Pack</option>
                    <option value="cms_draft">CMS draft</option>
                    <option value="github_pr">GitHub PR (planned)</option>
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
                      placeholder="Note for your team"
                      value={issue.note || ""}
                    />
                  </label>
                )}
              </div>
              <div className="repair-action-strip">
                <div>
                  <strong>{issue.latestAction ? "Latest draft" : "No draft yet"}</strong>
                  <span>
                    {issue.latestAction
                      ? `${repairActionModeLabel(issue.latestAction.actionMode)} · ${repairApprovalLabel(issue.latestAction.approvalState)} · ${repairExecutionLabel(issue.latestAction.executionState)}`
                      : "Drafts are saved for review. Nothing changes on your site."}
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
                      Implementation steps
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
                    Draft change
                  </button>
                  {issue.latestAction?.approvalState === "drafted" && (
                    <>
                      <button
                        className="action-link paid-action"
                        disabled={actingIssueId === issue.issueId || status === "loading"}
                        onClick={() =>
                          onActionUpdate(issue, repairActionApprovalPatch(), {
                            pendingMessage: "Approving…",
                            successMessage: "Draft approved."
                          })
                        }
                        type="button"
                      >
                        Approve
                      </button>
                      <button
                        className="text-button"
                        disabled={actingIssueId === issue.issueId || status === "loading"}
                        onClick={() =>
                          onActionUpdate(issue, repairActionIgnorePatch(), {
                            pendingMessage: "Ignoring…",
                            successMessage: "Draft ignored."
                          })
                        }
                        type="button"
                      >
                        Ignore
                      </button>
                    </>
                  )}
                  {issue.latestAction?.approvalState === "approved" &&
                    issue.latestAction?.executionState !== "applied" && (
                      <button
                        className="action-link paid-action"
                        disabled={actingIssueId === issue.issueId || status === "loading"}
                        onClick={() =>
                          onActionUpdate(issue, repairActionApplyPatch(), {
                            pendingMessage: "Marking as applied…",
                            successMessage: "Marked as applied."
                          })
                        }
                        type="button"
                      >
                        Mark applied
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
                        Mark fixed
                      </button>
                      <button
                        className="text-button"
                        disabled={actingIssueId === issue.issueId || status === "loading"}
                        onClick={() => onActionRerun(issue, "still_open")}
                        type="button"
                      >
                        Mark still open
                      </button>
                      <button
                        className="text-button"
                        disabled={actingIssueId === issue.issueId || status === "loading"}
                        onClick={() => onActionRerun(issue, "regressed")}
                        type="button"
                      >
                        Mark regressed
                      </button>
                    </>
                  )}
                </div>
              </div>
              {issue.updatedAt && (
                <p className="quiet-note">
                  Updated {formatDate(issue.updatedAt)}
                  {issue.updatedByEmail ? ` by ${issue.updatedByEmail}` : ""}
                </p>
              )}
            </article>
          ))}
          {!visibleIssues.length && <p className="quiet-note">No fixes with this status.</p>}
        </div>
      </div>
    </section>
  );
}
