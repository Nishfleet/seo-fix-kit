const INVALID_URL = "Enter a valid public website URL.";
const STEPS = [
  "Waiting for the page to finish loading…",
  "Comparing the rendered page with the raw HTML…",
  "Checking each problem against the real page…"
];

export function publicUrlError(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return INVALID_URL;
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed;
  try {
    parsed = new URL(withProtocol);
  } catch {
    return INVALID_URL;
  }
  if (!["http:", "https:"].includes(parsed.protocol)) return INVALID_URL;
  const host = parsed.hostname.toLowerCase();
  if (!host.includes(".") && !host.includes(":")) return INVALID_URL;
  return "";
}

export function scoreTone(score) {
  if (score >= 90) return "good";
  if (score >= 50) return "ok";
  return "bad";
}

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null && text !== "") node.textContent = String(text);
  if (className) node.className = className;
  return node;
}

function hostOf(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function count(value) {
  return typeof value === "number" ? value.toLocaleString("en-US") : value;
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function copyButton(text, { label = "Copy", ariaLabel = "Copy markup", className = "copy" } = {}) {
  const button = el("button", label, className);
  button.type = "button";
  button.setAttribute("aria-label", ariaLabel);
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "Copied";
    } catch {
      button.textContent = "Select and copy";
    }
    setTimeout(() => (button.textContent = label), 1600);
  });
  return button;
}

function measure(label, value, big) {
  const box = el("div", "", "measure");
  box.appendChild(el("div", label, "label"));
  const shown = value === null || value === undefined || value === "" ? "Not found" : value;
  box.appendChild(el("div", shown, `value${big ? " big" : ""}`));
  return box;
}

function findingNode(finding) {
  const box = el("article", "", `finding ${finding.severity}`);
  const top = el("div", "", "finding-top");
  top.appendChild(el("span", finding.severity === "guard" ? "Ruled out" : finding.severity, `sev ${finding.severity}`));
  top.appendChild(el("h4", finding.title));
  if (finding.scoreGain > 0) top.appendChild(el("span", `+${finding.scoreGain} pts`, "gain"));
  box.appendChild(top);
  if (finding.evidence) box.appendChild(el("p", `Evidence: ${finding.evidence}`));
  if (finding.why) box.appendChild(el("p", finding.why));
  if (finding.fix) box.appendChild(el("p", `Fix: ${finding.fix}`, "fix"));
  if (finding.proposedMarkup) {
    box.appendChild(el("p", "Suggested markup. Generated for this page, not copied from it", "snippet-label"));
    const wrap = el("div", "", "snippet-wrap");
    wrap.appendChild(el("code", finding.proposedMarkup, "snippet box-min"));
    wrap.appendChild(copyButton(finding.proposedMarkup));
    box.appendChild(wrap);
  }
  return box;
}

function block(title) {
  const section = el("section");
  section.appendChild(el("h3", title));
  return section;
}

function scoreNode(score) {
  const box = el("div", "", `score ${scoreTone(score)}`);
  box.setAttribute("aria-label", `Score ${score} out of 100`);
  const value = el("strong", score);
  value.setAttribute("aria-hidden", "true");
  box.appendChild(value);
  const out = el("span", "/100");
  out.setAttribute("aria-hidden", "true");
  box.appendChild(out);
  return box;
}

export function renderResult(payload) {
  const measured = payload.measured || {};
  const findings = payload.findings || [];
  const guards = payload.guards || [];
  const card = el("div", "", "result-card");

  const head = el("div", "", "result-head");
  if (typeof payload.score === "number") head.appendChild(scoreNode(payload.score));
  const titleBox = el("div", "", "box-min result-title");
  titleBox.appendChild(el("h2", hostOf(payload.finalUrl || payload.checkedUrl)));
  const rendered =
    payload.finalUrl && payload.finalUrl !== payload.checkedUrl ? ` (rendered at ${payload.finalUrl})` : "";
  titleBox.appendChild(el("p", `Checked: ${payload.checkedUrl}${rendered}`, "result-meta"));
  head.appendChild(titleBox);
  const tally = el("div", "", "result-tally");
  tally.appendChild(
    el(
      "span",
      findings.length ? `${plural(findings.length, "problem")} to fix` : "No problems found",
      `tally ${findings.length ? "bad" : "good"}`
    )
  );
  tally.appendChild(el("span", `${plural(guards.length, "false alarm")} ruled out`, "tally good"));
  head.appendChild(tally);
  card.appendChild(head);

  const body = el("div", "", "result-body");

  const problems = block("Problems to fix");
  if (findings.length === 0)
    problems.appendChild(el("p", "No problems found on this page in this check.", "empty-note"));
  for (const finding of findings) problems.appendChild(findingNode(finding));
  if (payload.projectedScore?.to > payload.score || payload.fixPrompt) {
    const next = el("div", "", "fix-next");
    if (payload.projectedScore?.to > payload.score) {
      const line = el("p", "", "projected");
      line.append(`Fix the top ${plural(payload.projectedScore.fixes, "problem")} and this page could score about `);
      line.appendChild(el("strong", payload.projectedScore.to));
      line.append(".");
      next.appendChild(line);
    }
    if (payload.fixPrompt) {
      const row = el("div", "", "prompt-row");
      row.appendChild(
        copyButton(payload.fixPrompt, {
          label: "Copy AI fix prompt",
          ariaLabel: "Copy AI fix prompt",
          className: "btn btn-secondary btn-sm prompt-copy"
        })
      );
      row.appendChild(el("span", "Paste into ChatGPT, Claude, Cursor or Lovable.", "prompt-note"));
      next.appendChild(row);
    }
    problems.appendChild(next);
  }
  body.appendChild(problems);

  const proof = block("Rendered proof");
  const grid = el("div", "", "measure-grid");
  const words = el("div", "", "measure");
  words.appendChild(el("div", "Words (raw HTML → browser)", "label"));
  const wordValue = el("div", "", "value big");
  if (typeof measured.staticWordCount === "number") {
    wordValue.appendChild(el("span", `${count(measured.staticWordCount)} → `, "from"));
  }
  wordValue.appendChild(
    document.createTextNode(
      typeof measured.renderedWordCount === "number" ? count(measured.renderedWordCount) : "Not found"
    )
  );
  words.appendChild(wordValue);
  grid.appendChild(words);
  grid.appendChild(measure("Internal links", count(measured.renderedInternalLinkCount), true));
  grid.appendChild(measure("Main heading (H1)", measured.renderedH1));
  grid.appendChild(measure("Title", measured.renderedTitle));
  proof.appendChild(grid);
  body.appendChild(proof);

  const ruledOut = block("False alarms ruled out");
  if (guards.length === 0) ruledOut.appendChild(el("p", "No false alarms to rule out on this page."));
  for (const guard of guards) ruledOut.appendChild(findingNode({ ...guard, severity: "guard" }));
  body.appendChild(ruledOut);
  card.appendChild(body);

  const foot = el("div", "", "result-foot");
  const text = el("p");
  text.appendChild(el("strong", payload.nextStep || "Create a free account to audit the whole site."));
  if (payload.boundary) text.appendChild(el("span", payload.boundary));
  foot.appendChild(text);
  const cta = el("a", "Create a free account", "cta");
  cta.href = "/beta";
  foot.appendChild(cta);
  card.appendChild(foot);
  return card;
}

function loadingCard(url) {
  const card = el("div", "", "loading-card");
  card.setAttribute("role", "status");
  card.appendChild(el("span", "", "spinner"));
  const text = el("div");
  const step = el("p", `Opening ${url} in a real browser…`, "step");
  text.appendChild(step);
  text.appendChild(el("p", "We compare it with the raw HTML. This can take up to a minute.", "sub"));
  card.appendChild(text);
  let index = 0;
  const timer = setInterval(() => {
    if (!card.isConnected || index >= STEPS.length) return clearInterval(timer);
    step.textContent = STEPS[index++];
  }, 4000);
  return card;
}

function mount() {
  const form = document.getElementById("check-form");
  const urlInput = document.getElementById("url-input");
  const button = document.getElementById("check-button");
  const result = document.getElementById("result");
  if (!form || !urlInput || !button || !result) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const url = urlInput.value.trim();
    if (!url) return;
    result.classList.remove("show");
    result.replaceChildren();
    const validationError = publicUrlError(url);
    if (validationError) {
      result.appendChild(el("div", validationError, "error-box"));
      result.classList.add("show");
      return;
    }
    button.disabled = true;
    button.textContent = "Checking…";
    result.replaceChildren(loadingCard(url));
    result.classList.add("show");
    try {
      const response = await fetch("/api/public-check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        result.replaceChildren(el("div", payload.error || "The check failed. Try another public URL.", "error-box"));
        return;
      }
      result.replaceChildren(renderResult(payload));
    } catch {
      result.replaceChildren(
        el("div", "Could not reach the check service. Check your connection and try again.", "error-box")
      );
    } finally {
      button.disabled = false;
      button.textContent = "Check this page";
    }
  });

  const requested = new URLSearchParams(location.search).get("url");
  if (requested) {
    urlInput.value = requested.trim();
    form.requestSubmit();
  }
}

if (typeof document !== "undefined") mount();
