import { WorkflowEntrypoint } from "cloudflare:workers";

export class D1BackupWorkflow extends WorkflowEntrypoint {
  async run(_event, step) {
    const { ACCOUNT_ID, DATABASE_ID, D1_REST_API_TOKEN, BACKUP_BUCKET } = this.env;

    if (!ACCOUNT_ID || !DATABASE_ID || !D1_REST_API_TOKEN) {
      throw new Error("D1 backup needs ACCOUNT_ID, DATABASE_ID and D1_REST_API_TOKEN");
    }

    const headers = new Headers();
    headers.append("Content-Type", "application/json");
    headers.append("Authorization", `Bearer ${D1_REST_API_TOKEN}`);
    const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/export`;

    const bookmark = await step.do("Start D1 export", async () => {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ output_format: "polling" })
      });
      const { result } = await response.json();
      if (!result?.at_bookmark) {
        throw new Error("Missing at_bookmark");
      }
      return result.at_bookmark;
    });

    await step.do("Store D1 export in R2", async () => {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ current_bookmark: bookmark })
      });
      const { result } = await response.json();
      if (!result?.signed_url || !result?.filename) {
        throw new Error("Missing signed_url or filename");
      }
      const dump = await fetch(result.signed_url);
      if (!dump.ok) {
        throw new Error("Failed to fetch dump file");
      }
      await BACKUP_BUCKET.put(`d1/${result.filename}`, dump.body);
    });
  }
}
