// Global bindings for the seo-fix-kit Worker, per the Cloudflare Pages and
// Workers TypeScript guide: https://developers.cloudflare.com/pages/functions/typescript/
// Keep in sync with cloudflare.config.ts (bindings) and the deployed secrets.
interface EnvVars {
  DODO_SEOFIXKIT_BRAND_ID: string;
  DODO_SEOFIXKIT_PRODUCT_FIX_PACK_ID: string;
  DODO_SEOFIXKIT_PRODUCT_MONITORING_ID: string;
  DODO_SEOFIXKIT_PRODUCT_REPAIR_SPRINT_ID: string;
  DODO_SEOFIXKIT_ENVIRONMENT: string;
  DODO_SEOFIXKIT_ADAPTIVE_CURRENCY_FEES_INCLUSIVE: string;
  INTERNAL_EMAIL_DOMAINS: string;
  ACCOUNT_ID: string;
  DATABASE_ID: string;
}

interface EnvSecrets {
  DODO_SEOFIXKIT_API_KEY?: string;
  DODO_SEOFIXKIT_WEBHOOK_SECRET?: string;
  DODO_SEOFIXKIT_WEBHOOK_KEY?: string;
}

interface Env extends EnvVars, EnvSecrets {
  WAITLIST_DB: D1Database;
  REPORTS: R2Bucket;
  BACKUP_BUCKET: R2Bucket;
  BACKUP_WORKFLOW: Workflow;
  AUDIT_QUEUE: Queue;
  TINY_STUDIO_QUEUE: Queue;
  EMAIL: SendEmail;
  BROWSER: Fetcher;
  ASSETS: Fetcher;
}
