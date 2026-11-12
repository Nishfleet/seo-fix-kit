import { checkHandoffHref } from "../public-check/check-handoff.js";

const INVALID_URL = "Enter a valid public website URL.";
const STEPS = [
  "Waiting for the page to finish loading…",
  "Reading robots.txt for AI crawler rules…",
  "Checking the raw HTML the crawlers receive…"
];

export function chatgptReadUrlError(value) {
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

function block(title) {
  const section = el("section");
  section.appendChild(el("h3", title));
  return section;
}

function botRow(bot) {
  const item = el("li", "", `bot-row ${bot.allowed ? "allowed" : "blocked"}`);
  const name = el("span", bot.agent, "bot-name");
  const state = el("span", bot.allowed ? "Allowed" : "Blocked", `bot-state ${bot.allowed ? "allowed" : "blocked"}`);
  item.append(name, state);
  const rule = bot.rule ? `robots.txt rule: ${bot.rule}` : "No matching robots.txt rule, so the default allow applies.";
  item.appendChild(el("span", rule, "bot-rule"));
  item.setAttribute(
    "aria-label",
    `${bot.product}: ${bot.allowed ? "allowed to read this page" : "blocked by robots.txt"}`
  );
  return item;
}

function measure(label, value) {
  const box = el("div", "", "measure");
  box.appendChild(el("div", label, "label"));
  box.appendChild(el("div", value, "value"));
  return box;
}

export function renderChatgptReadResult(payload) {
  const bots = Array.isArray(payload.bots) ? payload.bots : [];
  const content = payload.content || {};
  const schema = payload.schema || {};
  const card = el("div", "", "result-card");

  const head = el("div", "", "result-head");
  const titleBox = el("div", "", "result-title");
  titleBox.appendChild(el("h2", hostOf(payload.finalUrl || payload.checkedUrl)));
  titleBox.appendChild(el("p", `Checked: ${payload.checkedUrl || payload.finalUrl}`, "result-meta"));
  head.appendChild(titleBox);
  card.appendChild(head);

  const verdictBox = el("div", "", `verdict ${payload.verdict?.status || "unknown"}`);
  verdictBox.appendChild(el("p", payload.verdict?.headline || "We could not read this page.", "verdict-headline"));
  if (payload.verdict?.detail) verdictBox.appendChild(el("p", payload.verdict.detail, "verdict-detail"));
  card.appendChild(verdictBox);

  const body = el("div", "", "result-body");

  const access = block("What robots.txt allows");
  if (!payload.robotsChecked) {
    access.appendChild(
      el("p", "We could not read this site's robots.txt, so crawler access was not checked.", "empty-note")
    );
  } else {
    const list = el("ul", "", "bot-list");
    for (const bot of bots) list.appendChild(botRow(bot));
    access.appendChild(list);
    const blocked = bots.filter((bot) => !bot.allowed);
    access.appendChild(
      el(
        "p",
        blocked.length
          ? `robots.txt blocks ${blocked.map((bot) => bot.agent).join(", ")} on this URL.`
          : "robots.txt allows GPTBot, ClaudeBot and PerplexityBot to fetch this URL.",
        "crawler-note"
      )
    );
  }
  body.appendChild(access);

  const evidence = block("What the raw HTML holds");
  const grid = el("div", "", "measure-grid");
  grid.appendChild(measure("Words in the HTML", String(content.wordCount ?? 0)));
  grid.appendChild(measure("Main heading (H1)", content.h1Count ? content.h1s[0] : "No H1 in the raw HTML"));
  grid.appendChild(measure("Title tag", content.hasTitle ? content.title : "No title in the raw HTML"));
  grid.appendChild(measure("Schema types", schema.typeCount ? schema.types.join(", ") : "No JSON-LD schema found"));
  evidence.appendChild(grid);
  if (content.bodySample) {
    evidence.appendChild(el("p", "Text the crawlers receive:", "snippet-label"));
    evidence.appendChild(el("p", content.bodySample, "snippet"));
  }
  body.appendChild(evidence);

  const handoff = checkHandoffHref(payload.finalUrl || payload.checkedUrl);
  const next = el("div", "", "result-next");
  next.appendChild(el("p", "Next: run the full free page check on this URL."));
  const cta = el("a", "Run the full page check", "cta");
  cta.href = handoff;
  next.appendChild(cta);
  body.appendChild(next);

  card.appendChild(body);
  return card;
}

export async function requestChatgptRead(url, options = {}) {
  const apiPath = options.apiPath || "/api/chatgpt-read-check";
  try {
    const response = await fetch(apiPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      return { error: payload.error || "The check failed. Try another public URL." };
    }
    return { payload };
  } catch {
    return { error: "Could not reach the check service. Check your connection and try again." };
  }
}

export async function runChatgptReadTool(input, options = {}) {
  const url = String(input?.url || "").trim();
  const validationError = chatgptReadUrlError(url);
  if (validationError) return { error: validationError };
  return requestChatgptRead(url, options);
}

function loadingCard(url) {
  const card = el("div", "", "loading-card");
  card.setAttribute("role", "status");
  card.appendChild(el("span", "", "spinner"));
  const text = el("div");
  const step = el("p", `Opening ${url} in a real browser…`, "step");
  text.appendChild(step);
  text.appendChild(el("p", "We read robots.txt and the raw HTML. This can take up to a minute.", "sub"));
  card.appendChild(text);
  let index = 0;
  const timer = setInterval(() => {
    if (!card.isConnected || index >= STEPS.length) return clearInterval(timer);
    step.textContent = STEPS[index++];
  }, 4000);
  return card;
}

function mount() {
  const form = document.getElementById("chatgpt-read-form");
  const urlInput = document.getElementById("chatgpt-read-url");
  const button = document.getElementById("chatgpt-read-button");
  const result = document.getElementById("chatgpt-read-result");
  if (!form || !urlInput || !button || !result) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const url = urlInput.value.trim();
    if (!url) return;
    result.classList.remove("show");
    result.replaceChildren();
    const validationError = chatgptReadUrlError(url);
    if (validationError) {
      result.appendChild(el("div", validationError, "error-box"));
      result.classList.add("show");
      return;
    }
    button.disabled = true;
    button.textContent = "Checking…";
    result.replaceChildren(loadingCard(url));
    result.classList.add("show");
    const { payload, error } = await runChatgptReadTool({ url });
    result.replaceChildren(error ? el("div", error, "error-box") : renderChatgptReadResult(payload));
    button.disabled = false;
    button.textContent = "Check this page";
  });

  const requested = new URLSearchParams(location.search).get("url");
  if (requested) {
    urlInput.value = requested.trim();
    form.requestSubmit();
  }
}

if (typeof document !== "undefined") mount();
