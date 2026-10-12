// Sections of the signed-in app. Each maps to a /beta path so every screen
// has its own URL, back-button step, and shareable link.
export const APP_SECTIONS = [
  { key: "overview", icon: "home", label: "Overview", path: "/beta" },
  { key: "reports", icon: "file", label: "Reports", path: "/beta/reports" },
  { key: "sites", icon: "browser", label: "Sites", path: "/beta/sites" },
  { key: "developers", icon: "code", label: "Developers", path: "/beta/developers" },
  { key: "billing", icon: "card", label: "Billing", path: "/beta/billing" }
];

export function sectionFromPath(pathname = "") {
  if (pathname === "/beta/admin") return "admin";
  if (pathname.startsWith("/beta/billing")) return "billing";
  if (pathname.startsWith("/beta/reports/")) return "report";
  if (pathname === "/beta/reports") return "reports";
  if (pathname === "/beta/sites") return "sites";
  if (pathname === "/beta/developers") return "developers";
  return "overview";
}
