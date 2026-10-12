// In-memory Cloudflare D1 for tests.
//
// Runs every SQL file in migrations/ against a real SQLite database
// (node:sqlite), then exposes the subset of the D1 binding API the Worker
// uses: prepare().bind().first/all/run/raw, batch, and exec. Tests that use
// it exercise the real schema and the real SQL, so they fail when a query is
// wrong rather than when its wording changes.
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const MIGRATIONS_DIR = new URL("../../migrations/", import.meta.url);
const MIGRATIONS = readdirSync(MIGRATIONS_DIR)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => readFileSync(new URL(file, MIGRATIONS_DIR), "utf8"));

function toSqliteValue(value) {
  // D1 rejects undefined bindings; surface the same bug here.
  if (value === undefined) throw new TypeError("D1_TYPE_ERROR: Type 'undefined' not supported for value 'undefined'");
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

class TestD1Statement {
  constructor(db, sql, values = []) {
    this.db = db;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    return new TestD1Statement(this.db, this.sql, values.map(toSqliteValue));
  }

  execute() {
    const statement = this.db.sqlite.prepare(this.sql);
    if (statement.columns().length) {
      const results = statement.all(...this.values).map((row) => ({ ...row }));
      return { results, meta: { changes: 0, last_row_id: 0, rows_read: results.length, rows_written: 0 } };
    }
    const { changes, lastInsertRowid } = statement.run(...this.values);
    return {
      results: [],
      meta: {
        changes: Number(changes),
        last_row_id: Number(lastInsertRowid),
        rows_read: 0,
        rows_written: Number(changes)
      }
    };
  }

  async first(column) {
    const row = this.execute().results[0] ?? null;
    if (column === undefined || row === null) return row;
    return row[column] ?? null;
  }

  async all() {
    const { results, meta } = this.execute();
    return { success: true, results, meta };
  }

  async run() {
    const { results, meta } = this.execute();
    return { success: true, results, meta };
  }

  async raw({ columnNames = false } = {}) {
    const { results } = this.execute();
    const rows = results.map((row) => Object.values(row));
    if (!columnNames) return rows;
    return [
      this.db.sqlite
        .prepare(this.sql)
        .columns()
        .map((column) => column.name),
      ...rows
    ];
  }
}

export class TestD1 {
  constructor() {
    this.sqlite = new DatabaseSync(":memory:");
    // D1 always enforces foreign keys.
    this.sqlite.exec("PRAGMA foreign_keys = ON");
    for (const migration of MIGRATIONS) this.sqlite.exec(migration);
  }

  prepare(sql) {
    return new TestD1Statement(this, sql);
  }

  async batch(statements) {
    this.sqlite.exec("BEGIN");
    try {
      const results = statements.map((statement) => {
        const { results: rows, meta } = statement.execute();
        return { success: true, results: rows, meta };
      });
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  async exec(sql) {
    this.sqlite.exec(sql);
    return { count: 1, duration: 0 };
  }

  // Test-only helpers for arranging and inspecting state.
  rows(sql, ...values) {
    return this.sqlite
      .prepare(sql)
      .all(...values.map(toSqliteValue))
      .map((row) => ({ ...row }));
  }

  insert(table, row) {
    const columns = Object.keys(row);
    this.sqlite
      .prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`)
      .run(...columns.map((column) => toSqliteValue(row[column] ?? null)));
  }
}

export function createTestD1() {
  return new TestD1();
}
