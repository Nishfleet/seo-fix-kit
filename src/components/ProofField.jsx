import { useEffect, useRef } from "react";

const CELL = 16;
const TILE = 11;
const SWEEP_SECONDS = 9;
const STOPS = [
  [15, 122, 86],
  [16, 181, 160],
  [127, 227, 187],
  [199, 232, 107],
  [242, 184, 75],
  [244, 122, 85]
];
const ISSUE = [240, 92, 64];
const FIXED = [15, 122, 86];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function palette(p) {
  const x = Math.min(0.999, Math.max(0, p)) * (STOPS.length - 1);
  const i = Math.floor(x);
  return mix(STOPS[i], STOPS[i + 1], x - i);
}

function hash(col, row, seed) {
  const n = Math.sin(col * 127.1 + row * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function draw(ctx, width, height, seconds) {
  ctx.clearRect(0, 0, width, height);
  const cols = Math.ceil(width / CELL);
  const rows = Math.ceil(height / CELL);
  const t = seconds;
  const sweep = Math.floor(t / SWEEP_SECONDS);
  const progress = (t % SWEEP_SECONDS) / SWEEP_SECONDS;
  const beam = (progress * 1.3 - 0.15) * width;
  const amp = height * 0.09;

  for (let col = 0; col < cols; col += 1) {
    const x = col * CELL;
    const u = x / width;
    const centre =
      height * (0.02 + 0.84 * u) + amp * Math.sin(u * 7.5 + t * 0.35) + amp * 0.6 * Math.sin(u * 15 - t * 0.5);
    const half = height * (0.2 + 0.06 * Math.sin(u * 4 + t * 0.25));

    for (let row = 0; row < rows; row += 1) {
      const y = row * CELL;
      const d = Math.abs(y - centre) / half;
      const near = Math.max(0, 1 - Math.abs(x - beam) / 64);
      let colour;
      let alpha;
      let check = false;

      if (d < 1) {
        const strength = Math.pow(1 - d, 0.85);
        const isIssue = hash(col, row, sweep) < 0.05 && strength > 0.25;
        if (isIssue && x > beam) {
          colour = ISSUE;
          alpha = 0.95;
        } else if (isIssue) {
          colour = FIXED;
          alpha = 1;
          check = true;
        } else {
          colour = palette(u * 1.05 - 0.05 + (1 - d) * 0.12 + 0.08 * Math.sin(t * 0.3 + row * 0.08));
          alpha = 0.08 + 0.92 * strength;
        }
      } else {
        colour = [11, 15, 13];
        alpha = 0.028;
      }
      if (d < 1) alpha = Math.min(1, alpha + near * 0.35);

      ctx.fillStyle = `rgba(${colour[0] | 0}, ${colour[1] | 0}, ${colour[2] | 0}, ${alpha})`;
      ctx.beginPath();
      ctx.roundRect(x, y, TILE, TILE, 3);
      ctx.fill();

      if (check) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x + 3, y + 5.8);
        ctx.lineTo(x + 4.9, y + 7.8);
        ctx.lineTo(x + 8.2, y + 3.6);
        ctx.stroke();
      }
    }
  }

  const glow = ctx.createLinearGradient(beam - 48, 0, beam + 48, 0);
  glow.addColorStop(0, "rgba(255, 255, 255, 0)");
  glow.addColorStop(0.5, "rgba(255, 255, 255, 0.55)");
  glow.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(beam - 48, 0, 96, height);
}

export function ProofField() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || typeof ctx.roundRect !== "function") return undefined;

    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0;
    let height = 0;
    let frame = 0;
    let visible = true;
    const start = performance.now() - SWEEP_SECONDS * 0.55 * 1000;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (still.matches) draw(ctx, width, height, SWEEP_SECONDS * 0.55);
    }

    function tick(now) {
      frame = 0;
      if (!visible || document.hidden || still.matches) return;
      draw(ctx, width, height, (now - start) / 1000);
      frame = requestAnimationFrame(tick);
    }

    function play() {
      if (!frame && visible && !document.hidden && !still.matches) frame = requestAnimationFrame(tick);
    }

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      play();
    });
    const sizer = new ResizeObserver(resize);
    const onMotion = () => {
      resize();
      play();
    };

    resize();
    observer.observe(canvas);
    sizer.observe(canvas);
    document.addEventListener("visibilitychange", play);
    still.addEventListener("change", onMotion);
    play();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      sizer.disconnect();
      document.removeEventListener("visibilitychange", play);
      still.removeEventListener("change", onMotion);
    };
  }, []);

  return <canvas aria-hidden="true" className="proof-field" ref={canvasRef} />;
}
