const stubUrl = new URL(import.meta.url);

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") {
    return { url: stubUrl.href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export class WorkflowEntrypoint {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }
}
