import { SERP_LIMITS, estimateTextWidth, truncateToWidth } from "./generators.js";
import { isFieldVisible } from "./catalog.js";

export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fieldControl(field, value, id) {
  const common = `id="${id}" name="${esc(field.name)}"${field.placeholder ? ` placeholder="${esc(field.placeholder)}"` : ""}${field.help ? ` aria-describedby="${id}-help"` : ""}`;
  if (field.type === "textarea") {
    return `<textarea class="field tool-textarea" ${common} rows="${field.rows ?? 5}" spellcheck="false">${esc(value)}</textarea>`;
  }
  if (field.type === "select") {
    const options = field.options
      .map(
        (option) =>
          `<option value="${esc(option.value)}"${option.value === value ? " selected" : ""}>${esc(option.label)}</option>`
      )
      .join("");
    return `<select class="field" ${common}>${options}</select>`;
  }
  const type =
    field.type === "url" ? "url" : field.type === "date" || field.type === "datetime-local" ? field.type : "text";
  const extra = field.type === "url" ? ' inputmode="url" autocomplete="off" spellcheck="false"' : ' autocomplete="off"';
  return `<input class="field" type="${type}" ${common} value="${esc(value)}"${extra} />`;
}

export function renderFields(tool, values) {
  return tool.fields
    .map((field) => {
      const id = `tool-${field.name}`;
      const hidden = isFieldVisible(field, values) ? "" : " hidden";
      const wide = field.wide || field.type === "textarea" ? " tool-field-wide" : "";
      const help = field.help ? `<span class="tool-help" id="${id}-help">${esc(field.help)}</span>` : "";
      return `<div class="tool-field${wide}" data-field="${esc(field.name)}"${hidden}>
          <label for="${id}">${esc(field.label)}</label>
          ${fieldControl(field, values[field.name] ?? "", id)}
          ${help}
        </div>`;
    })
    .join("\n        ");
}

function hostAndPath(url) {
  try {
    const parsed = new URL(url);
    const crumbs = parsed.pathname.split("/").filter(Boolean);
    return { host: parsed.hostname.replace(/^www\./, ""), crumbs };
  } catch {
    return { host: "example.com", crumbs: [] };
  }
}

function serpCard(preview, { measure, descriptionPx, variant }) {
  const title = truncateToWidth(preview.title || "Untitled page", SERP_LIMITS.titlePx, SERP_LIMITS.titleFont, measure);
  const description = truncateToWidth(preview.description || "", descriptionPx, SERP_LIMITS.descriptionFont, measure);
  const { host, crumbs } = hostAndPath(preview.url);
  const trail = [host, ...crumbs].map(esc).join(" › ");
  return `<figure class="serp serp-${variant}">
            <figcaption>${variant === "mobile" ? "Mobile" : "Desktop"}</figcaption>
            <div class="serp-site"><span class="serp-favicon" aria-hidden="true">${esc(host.charAt(0).toUpperCase())}</span><span><strong>${esc(host)}</strong><small>${trail}</small></span></div>
            <p class="serp-title">${esc(title.text)}</p>
            <p class="serp-description">${esc(description.text)}</p>
          </figure>`;
}

function socialCard(preview) {
  const { host } = hostAndPath(preview.url);
  const image = preview.image
    ? `<div class="og-image" data-src="${esc(preview.image)}"><span>${esc(preview.large ? "1200 × 630 image" : "Square image")}</span></div>`
    : `<div class="og-image og-image-missing"><span>No image set</span></div>`;
  return `<figure class="og-card${preview.large ? "" : " og-card-small"}">
            ${image}
            <figcaption>
              <small>${esc(host.toUpperCase())}</small>
              <strong>${esc(preview.title || "Untitled page")}</strong>
              <span>${esc(preview.description || "")}</span>
            </figcaption>
          </figure>`;
}

function rowsTable(rows, columns) {
  if (!rows.length) return `<p class="tool-empty">Nothing repeats yet.</p>`;
  return `<table class="tool-table">
            <thead><tr>${columns.map((c) => `<th scope="col">${esc(c.label)}</th>`).join("")}</tr></thead>
            <tbody>${rows.map((row) => `<tr>${columns.map((c, i) => (i === 0 ? `<th scope="row">${esc(row[c.key])}</th>` : `<td>${esc(row[c.key])}</td>`)).join("")}</tr>`).join("")}</tbody>
          </table>`;
}

function renderPreview(preview, measure) {
  if (!preview) return "";
  switch (preview.kind) {
    case "serp": {
      const measurements = preview.measurements
        ? `<dl class="tool-measure">${preview.measurements.map((m) => `<div><dt>${esc(m.label)}</dt><dd>${esc(m.value)}</dd></div>`).join("")}</dl>`
        : "";
      return `<div class="tool-preview serp-pair">
          ${serpCard(preview, { measure, descriptionPx: SERP_LIMITS.descriptionPxDesktop, variant: "desktop" })}
          ${serpCard(preview, { measure, descriptionPx: SERP_LIMITS.descriptionPxMobile, variant: "mobile" })}
        </div>${measurements}`;
    }
    case "social":
      return `<div class="tool-preview">${socialCard(preview)}</div>`;
    case "verdict":
      return `<div class="tool-preview verdict ${preview.ok ? "verdict-ok" : "verdict-blocked"}" role="status">
          <p class="verdict-headline"><span aria-hidden="true">${preview.ok ? "✓" : "✕"}</span> ${esc(preview.headline)}</p>
          <dl class="tool-measure">${preview.details.map((d) => `<div><dt>${esc(d.label)}</dt><dd><code>${esc(d.value)}</code></dd></div>`).join("")}</dl>
        </div>`;
    case "stats":
      return `<dl class="tool-stats">${preview.rows.map((row) => `<div><dt>${esc(row.label)}</dt><dd>${esc(row.value)}</dd></div>`).join("")}</dl>`;
    case "tables":
      return `${preview.summary ? `<p class="tool-summary">${esc(preview.summary)}</p>` : ""}
        <div class="tool-tables">${preview.tables
          .map(
            (table) =>
              `<section><h3>${esc(table.title)}</h3>${rowsTable(table.rows, [
                { key: "phrase", label: "Phrase" },
                { key: "count", label: "Times" },
                { key: "density", label: "Share" }
              ])}</section>`
          )
          .join("")}</div>`;
    default:
      return "";
  }
}

const NOTE_LABELS = { error: "Fix", warn: "Check", info: "Tip" };

function renderNotes(notes) {
  if (!notes.length) return `<p class="tool-ok"><span aria-hidden="true">✓</span> No problems found.</p>`;
  const order = { error: 0, warn: 1, info: 2 };
  return `<ul class="tool-notes">${[...notes]
    .sort((a, b) => order[a.level] - order[b.level])
    .map(
      (note) =>
        `<li class="note-${note.level}"><span class="note-tag">${NOTE_LABELS[note.level]}</span>${esc(note.text)}</li>`
    )
    .join("")}</ul>`;
}

export function renderOutput(result, { measure = estimateTextWidth } = {}) {
  const errors = result.notes.filter((note) => note.level === "error").length;
  const code = result.code
    ? `<div class="tool-code">
          <div class="tool-code-bar">
            <span>${esc(result.filename || "Result")}</span>
            <span class="tool-code-actions">
              <button class="btn btn-secondary btn-sm" type="button" data-copy>Copy</button>
              ${result.filename ? `<button class="btn btn-ghost btn-sm" type="button" data-download="${esc(result.filename)}">Download</button>` : ""}
            </span>
          </div>
          <pre class="code-block" data-code data-language="${esc(result.language)}">${esc(result.code)}</pre>
        </div>`
    : "";
  const status = errors ? `${errors} thing${errors === 1 ? "" : "s"} to fix` : "Ready to use";
  return `<p class="tool-status${errors ? " has-errors" : ""}">${esc(status)}</p>
        ${renderPreview(result.preview, measure)}
        ${code}
        ${renderNotes(result.notes)}`;
}

export function renderChecklist(checklist) {
  const total = checklist.reduce((sum, group) => sum + group.items.length, 0);
  const groups = checklist
    .map(
      (group) => `<fieldset class="checklist-group" data-group="${esc(group.id)}">
          <legend>${esc(group.title)} <span data-group-count>0/${group.items.length}</span></legend>
          ${group.items
            .map(
              (item) => `<label class="checklist-item">
              <input type="checkbox" name="${esc(group.id)}.${esc(item.id)}" />
              <span>${esc(item.text)}${item.auto ? ' <em class="auto-tag">Checked for you</em>' : ""}${
                item.tool ? ` <a href="/tools/${esc(item.tool)}">Open tool</a>` : ""
              }</span>
            </label>`
            )
            .join("")}
        </fieldset>`
    )
    .join("");
  return `<div class="checklist" data-checklist>
        <div class="checklist-progress">
          <p><strong data-done>0</strong> of ${total} done</p>
          <div class="checklist-bar" role="progressbar" aria-label="Checklist progress" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="0"><span data-bar></span></div>
          <button class="btn btn-ghost btn-sm" type="button" data-reset-checklist>Clear ticks</button>
        </div>
        ${groups}
      </div>`;
}
