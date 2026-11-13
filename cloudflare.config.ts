import { bindings, defineConfig, exports, triggers } from "cf/config";

// Previews reject `triggers` ("Preview uploads from Build Output don't support
// the `triggers` field"), so the cron and queue consumers apply only to the real
// Worker; cf sets isPreview on `cf previews deploy`. Same shape as 0509's config.
export default defineConfig(({ isPreview }) => ({
  worker: {
    name: "seo-fix-kit",
    compatibilityDate: "2026-05-20",
    compatibilityFlags: ["nodejs_compat"],
    entrypoint: "worker/index.js",
    workersDev: false,
    // Version URLs on, so a preview gets a link; workers.dev stays off (drive's shape).
    previewUrls: true,
    observability: {
      enabled: true,
      headSamplingRate: 1
    },
    assets: {
      notFoundHandling: "404-page",
      runWorkerFirst: true
    },
    domains: ["seofixkit.com", "www.seofixkit.com"],
    exports: {
      D1BackupWorkflow: exports.workflow({
        name: "d1-backup-workflow",
        schedules: "0 0 * * *"
      })
    },
    triggers: isPreview
      ? []
      : [
          triggers.scheduled({
            schedule: "*/15 * * * *"
          }),
          triggers.queue({
            deadLetterQueue: "seofixkit-audit-dlq",
            maxBatchSize: 1,
            maxConcurrency: 2,
            maxRetries: 2,
            name: "seofixkit-audit-jobs"
          })
        ],
    env: {
      DODO_SEOFIXKIT_BRAND_ID: bindings.text("brnd_0NfFwMVcHJSgp3RkhFpTi"),
      DODO_SEOFIXKIT_PRODUCT_FIX_PACK_ID: bindings.text("pdt_0NfFwlntrooPljJUYoXK8"),
      DODO_SEOFIXKIT_ENVIRONMENT: bindings.text("live"),
      DODO_SEOFIXKIT_ADAPTIVE_CURRENCY_FEES_INCLUSIVE: bindings.text("true"),
      INTERNAL_EMAIL_DOMAINS: bindings.text(
        "0509.io,0509.in,inish.in,aiconverter.app,siterep.net,tinystudio.io,tinystudio.in,seofixkit.com"
      ),
      WAITLIST_DB: bindings.d1({
        name: "seofixkit_waitlist",
        id: "887316c4-ca9d-4068-a7fa-1f530b479437"
      }),
      REPORTS: bindings.r2({
        name: "seofixkit-reports"
      }),
      EMAIL: bindings.sendEmail({}),
      AUDIT_QUEUE: bindings.queue({
        name: "seofixkit-audit-jobs"
      }),
      // Producer-only binding for "Have it fixed for you" (issue #412): the request
      // lands on the `tinystudio-requests` queue and TinyStudio's consumer takes it
      // from there; this Worker makes no HTTP call to TinyStudio.
      TINY_STUDIO_QUEUE: bindings.queue({
        name: "tinystudio-requests"
      }),
      BROWSER: bindings.browser({}),
      ASSETS: bindings.assets(),
      ACCOUNT_ID: bindings.text("f670a698e17bf160c8e4679823e68916"),
      DATABASE_ID: bindings.text("887316c4-ca9d-4068-a7fa-1f530b479437"),
      BACKUP_BUCKET: bindings.r2({
        name: "seofixkit-backups"
      }),
      BACKUP_WORKFLOW: bindings.workflow({
        name: "d1-backup-workflow",
        worker: "seo-fix-kit",
        exportName: "D1BackupWorkflow"
      })
    }
  }
}));
