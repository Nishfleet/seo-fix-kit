// The same problem on several pages ("Missing H1 on home", "Missing H1 on /about") is one fix.
export function issuePatternKey(title) {
  return String(title || "Unknown issue")
    .replace(/\son\s(home|\/[^\s]+)/i, "")
    .replace(/\sneeds cleanup.*/i, " needs cleanup")
    .trim();
}

export function distinctFixes(plan = [], limit = 3) {
  const seen = new Set();
  const picked = [];
  for (const item of plan) {
    const key = issuePatternKey(item?.title);
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(item);
    if (picked.length === limit) break;
  }
  return picked;
}
