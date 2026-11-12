const TITLE_MAX = 60;
const DESCRIPTION_MAX = 155;
const HEADING_MAX = 70;

export function visibleText(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function withinLimit(value, max) {
  const text = visibleText(value);
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  const fitted = space > max * 0.5 ? cut.slice(0, space) : cut;
  return `${fitted.replace(/[,;:\s]+$/, "")}…`;
}

function firstSentence(value, max) {
  const sentence = (visibleText(value).match(/^[^.!?]+[.!?]/) || [visibleText(value)])[0];
  return withinLimit(sentence, max);
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function suggestedTextFor(finding, page = {}) {
  const facts = page.rendered || page.static || {};
  const url = page.finalUrl || page.url || "";
  const title = String(finding?.title || "");

  if (/^Long title/.test(title)) {
    return suggested("Suggested title", withinLimit(facts.title, TITLE_MAX));
  }
  if (/^Missing or weak title/.test(title)) {
    return suggested("Suggested title", titleFromContent(url, facts));
  }
  if (/^Missing meta description|^Meta description needs tightening/.test(title)) {
    return suggested("Suggested meta description", descriptionFromContent(facts, url));
  }
  if (/^Missing H1/.test(title)) {
    return suggested("Suggested main heading", headingFromContent(url, facts));
  }
  if (/^Thin rendered content/.test(title)) {
    return {
      label: "Needs your judgment",
      owner: true,
      text: "Only you know whether this page is short on purpose. If it should convince a buyer, add what you offer, who it is for, and what to do next. If the page says everything it needs to at this length, keep it as it is."
    };
  }
  return null;
}

function titleFromContent(url, facts) {
  const host = hostOf(url);
  const topic = firstSentence(facts.h1s?.[0] || facts.leadText || "", TITLE_MAX - (host ? host.length + 3 : 0));
  const parts = [topic, host].filter(Boolean);
  const text = withinLimit(parts.join(" | "), TITLE_MAX);
  return text || host || "This page's title";
}

function headingFromContent(url, facts) {
  const text = firstSentence(facts.title || facts.leadText || "", HEADING_MAX);
  return text || hostOf(url) || "This page's main heading";
}

function descriptionFromContent(facts, url) {
  const text = firstSentence(facts.leadText || facts.bodySample || facts.title || "", DESCRIPTION_MAX);
  return (
    text || `Explain in one sentence what ${hostOf(url) || "this page"} offers, who it is for, and what to do next.`
  );
}

function suggested(label, text) {
  const value = String(text || "").trim();
  return value ? { label, text: value } : null;
}
