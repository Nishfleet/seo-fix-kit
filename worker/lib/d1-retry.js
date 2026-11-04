const NOT_EXECUTED = /D1 DB is overloaded|Requests queued for too long/i;
const CONNECTION_LOST = /Network connection lost/i;
const READ_ONLY = /^\s*SELECT\b/i;

/** @param {unknown} error
 * @param {boolean} readOnly
 * @returns {boolean}
 */
function isReplayable(error, readOnly) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return NOT_EXECUTED.test(message) || (readOnly && CONNECTION_LOST.test(message));
}

/** @template T
 * @param {() => T | Promise<T>} run
 * @param {boolean} readOnly
 * @param {{ attempts: number, delayMs: number }} options
 * @returns {Promise<T>}
 */
async function retrying(run, readOnly, { attempts, delayMs }) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= attempts || !isReplayable(error, readOnly)) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs * 2 ** (attempt - 1) * (0.5 + Math.random())));
    }
  }
}

/** @typedef {Object} D1RetryStatement
 * @property {D1PreparedStatement} inner
 * @property {boolean} readOnly
 * @property {(...values: unknown[]) => D1RetryStatement} bind
 * @property {() => Promise<Record<string, unknown> | null>} first
 * @property {() => Promise<D1Result<Record<string, unknown>>>} all
 * @property {() => Promise<D1Result<unknown>>} run
 * @property {() => Promise<unknown[]>} raw
 */

/** @param {D1PreparedStatement} inner
 * @param {string} sql
 * @param {{ attempts: number, delayMs: number }} options
 * @returns {D1RetryStatement}
 */
function wrapStatement(inner, sql, options) {
  const readOnly = READ_ONLY.test(sql);
  return {
    inner,
    readOnly,
    bind: (...values) => wrapStatement(inner.bind(...values), sql, options),
    first: () => retrying(() => inner.first(), readOnly, options),
    all: () => retrying(() => inner.all(), readOnly, options),
    run: () => retrying(() => inner.run(), readOnly, options),
    raw: () => retrying(() => inner.raw(), readOnly, options)
  };
}

/** @param {D1Database} db
 * @param {{ attempts?: number, delayMs?: number }} [options]
 * @returns {{ prepare: (sql: string) => D1RetryStatement, batch: (statements: D1RetryStatement[]) => Promise<D1Result<unknown>[]> }}
 */
function withD1Retry(db, { attempts = 3, delayMs = 250 } = {}) {
  const options = { attempts, delayMs };
  return {
    prepare: (sql) => wrapStatement(db.prepare(sql), sql, options),
    batch: (statements) =>
      retrying(
        () => db.batch(statements.map((statement) => statement.inner || statement)),
        statements.every((statement) => statement.readOnly === true),
        options
      )
  };
}

export { withD1Retry };
