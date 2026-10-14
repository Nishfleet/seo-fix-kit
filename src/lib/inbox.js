const INBOXES = [
  { domains: ["gmail.com", "googlemail.com"], label: "Open Gmail", href: "https://mail.google.com/mail/u/0/#inbox" },
  {
    domains: ["outlook.com", "hotmail.com", "live.com", "msn.com"],
    label: "Open Outlook",
    href: "https://outlook.live.com/mail/0/"
  },
  { domains: ["yahoo.com", "ymail.com"], label: "Open Yahoo Mail", href: "https://mail.yahoo.com/" },
  { domains: ["icloud.com", "me.com", "mac.com"], label: "Open iCloud Mail", href: "https://www.icloud.com/mail" },
  { domains: ["proton.me", "protonmail.com", "pm.me"], label: "Open Proton Mail", href: "https://mail.proton.me/" }
];

export function inboxFor(email = "") {
  const domain = String(email).split("@")[1]?.trim().toLowerCase() || "";
  return INBOXES.find((inbox) => inbox.domains.includes(domain)) || null;
}
