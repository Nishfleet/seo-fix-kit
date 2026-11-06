// Ambient Node typings for the server-side CLI scripts (server/*.mjs|.js).
// These run under plain Node, never inside the Worker, and tsconfig keeps the
// global "node" types out of the Worker program, so the few names they use are
// declared here instead of adding `@types/node` globally.
interface ImportMeta {
  readonly url: string;
}

declare var process: {
  argv: string[];
  exitCode?: number;
};
