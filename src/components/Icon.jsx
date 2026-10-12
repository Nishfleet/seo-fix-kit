// A small, consistent line-icon set (24px grid, 1.6 stroke, round caps) so
// every surface draws icons the same way. Add a path here rather than
// pasting one-off SVGs into pages.
const PATHS = {
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  browser:
    "M3.5 6.5A2 2 0 0 1 5.5 4.5h13a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-11ZM3.5 9h17M6.5 6.8h.01M9 6.8h.01",
  shieldCheck: "M12 3.5 5 6.2v5.3c0 4.3 2.9 7.6 7 9 4.1-1.4 7-4.7 7-9V6.2L12 3.5ZM9 12l2.2 2.2L15.5 10",
  code: "m8.5 8-4 4 4 4M15.5 8l4 4-4 4M13.5 5.5l-3 13",
  queue: "M9 6.5h11M9 12h11M9 17.5h11M4 6.5l1 1 2-2M4 12l1 1 2-2M4.5 17.5h1.5",
  pulse: "M3 12h4l2.5-6 5 12 2.5-6h4",
  sparkle:
    "M12 3.5c.6 3.9 2.6 5.9 6.5 6.5-3.9.6-5.9 2.6-6.5 6.5-.6-3.9-2.6-5.9-6.5-6.5 3.9-.6 5.9-2.6 6.5-6.5ZM18.5 15.5c.3 1.5 1 2.2 2.5 2.5-1.5.3-2.2 1-2.5 2.5-.3-1.5-1-2.2-2.5-2.5 1.5-.3 2.2-1 2.5-2.5Z",
  plug: "M9 3.5v4M15 3.5v4M6.5 7.5h11v3a5.5 5.5 0 0 1-11 0v-3ZM12 16v4.5",
  search: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM15.5 15.5 20 20",
  wrench: "M14.7 6.3a4 4 0 0 0-5.4 5.1l-5 5a1.8 1.8 0 0 0 2.5 2.5l5-5a4 4 0 0 0 5.1-5.4l-2.4 2.4-2.2-.6-.6-2.2 3-1.8Z",
  receipt: "M6 3.5h12v17l-2.5-1.5-2 1.5-1.5-1.5-1.5 1.5-2-1.5L6 20.5v-17ZM9 8h6M9 11.5h6M9 15h3.5",
  check: "m5 12.5 4.5 4.5L19 7.5",
  plus: "M12 5v14M5 12h14",
  x: "M6.5 6.5l11 11M17.5 6.5l-11 11",
  lock: "M7 10.5V8a5 5 0 0 1 10 0v2.5M5.5 10.5h13v9.5h-13v-9.5Z",
  home: "M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-6h-6v6H5.5A1.5 1.5 0 0 1 4 19v-8.5Z",
  file: "M13.5 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8.5l-5-5ZM13.5 3.5v5h5M9 13h6M9 16.5h4",
  card: "M3.5 7A1.5 1.5 0 0 1 5 5.5h14A1.5 1.5 0 0 1 20.5 7v10a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 17V7ZM3.5 10h17M7 15h3",
  help: "M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17ZM9.6 9.5a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.6M12 16.8h.01",
  signOut: "M14 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H14M10 12h10M16.5 8.5 20 12l-3.5 3.5"
};

export function Icon({ name, size = 20, className = "" }) {
  return (
    <svg
      aria-hidden="true"
      className={`icon ${className}`.trim()}
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
      viewBox="0 0 24 24"
      width={size}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
