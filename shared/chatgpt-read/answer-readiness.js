export const RAW_THIN_WORDS = 50;
export const RENDERED_MIN_WORDS = 250;

export function answerReadiness({ staticWordCount, renderedWordCount } = {}) {
  const raw = Number(staticWordCount);
  const rendered = Number(renderedWordCount);
  if (!Number.isFinite(raw) || !Number.isFinite(rendered)) {
    return { status: "unknown", readable: null };
  }
  if (raw < RAW_THIN_WORDS && rendered >= RENDERED_MIN_WORDS) {
    return {
      status: "javascript-only",
      readable: false,
      verdict: "Google can read this page, AI answer tools cannot.",
      rawWordCount: raw,
      renderedWordCount: rendered
    };
  }
  return {
    status: "readable",
    readable: true,
    rawWordCount: raw,
    renderedWordCount: rendered
  };
}
