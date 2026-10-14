import { defaultValues, isFieldVisible, toolBySlug } from "./catalog.js";
import { SERP_LIMITS, estimateTextWidth } from "./generators.js";
import { renderOutput } from "./render.js";

const STORAGE_KEY = "seofixkit.checklist.v1";

function canvasMeasure() {
  try {
    const context = document.createElement("canvas").getContext("2d");
    if (!context) return estimateTextWidth;
    return (text, font = SERP_LIMITS.titleFont) => {
      context.font = font;
      return Math.round(context.measureText(String(text)).width);
    };
  } catch {
    return estimateTextWidth;
  }
}

function readValues(form, tool) {
  const values = {};
  for (const field of tool.fields) {
    const control = form.elements.namedItem(field.name);
    if (!control) continue;
    values[field.name] = control.type === "checkbox" ? control.checked : control.value;
  }
  return values;
}

function loadImages(root) {
  for (const holder of root.querySelectorAll(".og-image[data-src]")) {
    const image = new Image();
    image.alt = "";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("load", () => {
      holder.replaceChildren(image);
      holder.classList.add("has-image");
    });
    image.addEventListener("error", () => holder.classList.add("og-image-missing"));
    image.src = holder.dataset.src;
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

function flash(button, label) {
  const original = button.dataset.label || button.textContent;
  button.dataset.label = original;
  button.textContent = label;
  clearTimeout(Number(button.dataset.timer));
  button.dataset.timer = String(setTimeout(() => (button.textContent = original), 1600));
}

function wireTool(root, tool) {
  const form = root.querySelector("[data-tool-form]");
  const output = root.querySelector("[data-tool-output]");
  const live = root.querySelector("[data-tool-live]");
  const measure = canvasMeasure();
  let timer = 0;
  let lastCode = "";
  let lastFilename = "";
  let lastHtml = "";
  let edited = false;

  function update() {
    const values = readValues(form, tool);
    for (const field of tool.fields) {
      const wrapper = form.querySelector(`[data-field="${field.name}"]`);
      if (wrapper) wrapper.hidden = !isFieldVisible(field, values);
    }
    const result = tool.generate(values, measure);
    lastCode = result.code;
    lastFilename = result.filename;
    const html = renderOutput(result, { measure });
    if (html === lastHtml) return;
    lastHtml = html;
    output.innerHTML = html;
    if (edited) loadImages(output);
    const errors = result.notes.filter((note) => note.level === "error").length;
    if (edited) live.textContent = errors ? `Updated. ${errors} thing${errors === 1 ? "" : "s"} to fix.` : "Updated.";
  }

  form.addEventListener("input", () => {
    edited = true;
    clearTimeout(timer);
    timer = setTimeout(update, 90);
  });
  form.addEventListener("change", () => {
    edited = true;
    update();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    update();
  });

  root.querySelector("[data-tool-clear]")?.addEventListener("click", () => {
    for (const field of tool.fields) {
      const control = form.elements.namedItem(field.name);
      if (control && control.tagName !== "SELECT") control.value = "";
    }
    update();
    form.querySelector("input, textarea")?.focus();
  });
  root.querySelector("[data-tool-example]")?.addEventListener("click", () => {
    const values = defaultValues(tool);
    for (const field of tool.fields) {
      const control = form.elements.namedItem(field.name);
      if (control) control.value = values[field.name];
    }
    update();
  });

  output.addEventListener("click", async (event) => {
    const copy = event.target.closest("[data-copy]");
    if (copy) {
      flash(copy, (await copyText(lastCode)) ? "Copied" : "Press Ctrl+C");
      return;
    }
    const download = event.target.closest("[data-download]");
    if (download) {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([lastCode], { type: "text/plain;charset=utf-8" }));
      link.download = lastFilename || download.dataset.download;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      flash(download, "Downloaded");
    }
  });

  update();
}

function readTicks() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function writeTicks(ticks) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ticks]));
  } catch {
    // Private windows can refuse storage; ticks then last for this visit only.
  }
}

function wireChecklist(root) {
  const ticks = readTicks();
  const boxes = [...root.querySelectorAll('input[type="checkbox"]')];
  const done = root.querySelector("[data-done]");
  const bar = root.querySelector("[data-bar]");
  const progress = root.querySelector('[role="progressbar"]');

  function refresh() {
    const checked = boxes.filter((box) => box.checked).length;
    done.textContent = String(checked);
    bar.style.width = `${(checked / boxes.length) * 100}%`;
    progress.setAttribute("aria-valuenow", String(checked));
    for (const group of root.querySelectorAll("[data-group]")) {
      const inGroup = [...group.querySelectorAll('input[type="checkbox"]')];
      group.querySelector("[data-group-count]").textContent =
        `${inGroup.filter((box) => box.checked).length}/${inGroup.length}`;
    }
  }

  for (const box of boxes) {
    box.checked = ticks.has(box.name);
    box.addEventListener("change", () => {
      if (box.checked) ticks.add(box.name);
      else ticks.delete(box.name);
      writeTicks(ticks);
      refresh();
    });
  }
  root.querySelector("[data-reset-checklist]")?.addEventListener("click", () => {
    ticks.clear();
    writeTicks(ticks);
    for (const box of boxes) box.checked = false;
    refresh();
  });
  refresh();
}

const root = document.querySelector("[data-tool]");
const tool = root && toolBySlug(root.dataset.tool);
if (tool?.generate) wireTool(root, tool);
const checklist = document.querySelector("[data-checklist]");
if (checklist) wireChecklist(checklist);
