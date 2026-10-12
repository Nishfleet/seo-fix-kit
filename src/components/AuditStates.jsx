export function EmptyAuditState() {
  return (
    <div className="empty-state">
      <p className="beta-eyebrow">First audit</p>
      <h2>Start with one page your customers actually land on.</h2>
      <div className="onboarding-steps">
        <article>
          <strong>1</strong>
          <span>Verify the exact host with a DNS TXT record or HTTPS file.</span>
        </article>
        <article>
          <strong>2</strong>
          <span>Paste your homepage, pricing page, or highest-value product page.</span>
        </article>
        <article>
          <strong>3</strong>
          <span>SEO Fix Kit renders the site and only queues proven repairs.</span>
        </article>
      </div>
    </div>
  );
}

export function LoadingAuditState({ message }) {
  return (
    <div className="loading-state">
      <div className="scan-orbit" aria-hidden="true" />
      <div>
        <p className="beta-eyebrow">Running audit</p>
        <h2>{message || "Rendering and collecting proof."}</h2>
        <p>Most runs take a short moment. JavaScript-heavy sites can take longer.</p>
      </div>
    </div>
  );
}

export function ErrorAuditState({ message }) {
  return (
    <div className="empty-state error-state">
      <p className="beta-eyebrow">Needs another try</p>
      <h2>{message}</h2>
      <p>Check the URL and run again. Some sites block automated browsers.</p>
    </div>
  );
}
