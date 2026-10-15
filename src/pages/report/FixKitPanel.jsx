import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/queries.js";
import { fixKitDownloadUrl, loadFixKit } from "../../lib/requests.js";

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

function fixKitItems(manifest = {}) {
  const files = manifest.files || [];
  const items = [
    `Every fix in one checklist: ${plural(manifest.problems || 0, "problem", "problems")}, most important first`
  ];
  if (manifest.codeFiles) items.push(`Ready-to-paste code for ${plural(manifest.codeFiles, "page", "pages")}`);
  const rootFiles = ["robots.txt", "robots-additions.txt", "sitemap.xml", "llms.txt"].filter((file) =>
    files.includes(file)
  );
  if (rootFiles.length) items.push(`Site files made for you: ${rootFiles.join(", ")}`);
  if (manifest.brokenLinks)
    items.push(`${plural(manifest.brokenLinks, "broken link", "broken links")} listed with the page each one is on`);
  if (files.includes("AI-PROMPT.md"))
    items.push("An AI prompt that works through every fix in ChatGPT, Claude or Cursor");
  items.push("A spreadsheet of the fixes for Jira, Trello, Asana or Linear");
  return items;
}

function useFixKit(reportId) {
  return useQuery({
    queryKey: queryKeys.fixKit(reportId),
    queryFn: () => loadFixKit(reportId),
    enabled: Boolean(reportId)
  });
}

export function FixKitIncludes({ reportId }) {
  const { data } = useFixKit(reportId);
  if (!data?.manifest || data.unlocked) return null;
  return (
    <div className="fix-kit-includes">
      <p className="fix-kit-label">Download with the Fix Pack</p>
      <ul>
        {fixKitItems(data.manifest).map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function FixKitDownload({ reportId }) {
  const { data } = useFixKit(reportId);
  if (!data?.unlocked || !data.manifest) return null;
  return (
    <section className="fix-kit-download" aria-label="Fix files">
      <div>
        <p className="beta-eyebrow">Your fix files</p>
        <h2>Everything you need to ship the fixes</h2>
        <ul>
          {fixKitItems(data.manifest).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      <a className="app-button" download href={fixKitDownloadUrl(reportId)}>
        Download fix files (.zip)
      </a>
    </section>
  );
}
