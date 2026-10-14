export function ScoreGain({ fix }) {
  const pages = fix.sameIssueCount > 1 ? ` on all ${fix.sameIssueCount} pages` : "";
  return (
    <small className="score-gain" title={`About +${fix.scoreGain} points once fixed${pages}`}>
      +{fix.scoreGain} pts{pages ? ` · ${fix.sameIssueCount} pages` : ""}
    </small>
  );
}
