const NOT_EXECUTED = /D1 DB is overloaded|Requests queued for too long/i;
const CONNECTION_LOST = /Network connection lost/i;
const READ_ONLY = /^\s*SELECT\b/i;

function isReplayable(error, readOnly) {
  const message = String(error?.message || error || "");
  return NOT_EXECUTED.test(message) || (readOnly && CONNECTION_LOST.test(message));
}

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

function wrapStatement(inner, sql, options) {
  const readOnly = READ_ONLY.test(sql);
  return {
    inner,
    readOnly,
    bind: (...values) => wrapStatement(inner.bind(...values), sql, options),
    first: (...args) => retrying(() => inner.first(...args), readOnly, options),
    all: (...args) => retrying(() => inner.all(...args), readOnly, options),
    run: (...args) => retrying(() => inner.run(...args), readOnly, options),
    raw: (...args) => retrying(() => inner.raw(...args), readOnly, options)
  };
}

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
