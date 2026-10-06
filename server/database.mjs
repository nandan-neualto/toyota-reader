import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export async function openDatabase({ databaseUrl, sqlitePath = '.library-data/library.sqlite' } = {}) {
  let query, transaction, close;
  if (databaseUrl) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 8 });
    query = async (sql, values = []) => (await pool.query(sql, values)).rows;
    transaction = async fn => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(async (sql, values = []) => (await client.query(sql, values)).rows);
        await client.query('COMMIT'); return result;
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    };
    close = () => pool.end();
  } else {
    const { DatabaseSync } = await import('node:sqlite');
    if (sqlitePath !== ':memory:') mkdirSync(dirname(sqlitePath), { recursive: true });
    const db = new DatabaseSync(sqlitePath);
    db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    const directQuery = async (sql, values = []) => {
      const bound = [];
      const statement = db.prepare(sql.replace(/\$(\d+)/g, (_, index) => { bound.push(values[Number(index) - 1]); return '?'; }));
      return /^(SELECT|WITH)|RETURNING\s/i.test(sql.trim()) || /\bRETURNING\b/i.test(sql)
        ? statement.all(...bound) : (statement.run(...bound), []);
    };
    let tail = Promise.resolve();
    const enqueue = fn => {
      const next = tail.then(fn);
      tail = next.catch(() => {}); return next;
    };
    // A single SQLite connection must not run another request inside an open transaction.
    query = (sql, values = []) => enqueue(() => directQuery(sql, values));
    transaction = fn => enqueue(async () => {
        db.exec('BEGIN IMMEDIATE');
        try { const result = await fn(directQuery); db.exec('COMMIT'); return result; }
        catch (error) { db.exec('ROLLBACK'); throw error; }
    });
    close = async () => { await tail; db.close(); };
  }
  const binary = databaseUrl ? 'BYTEA' : 'BLOB';
  for (const sql of [
    `CREATE TABLE IF NOT EXISTS library_users (id TEXT PRIMARY KEY, employee_id TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL, pin_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS library_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES library_users(id), expires_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS library_books (id TEXT PRIMARY KEY, title TEXT NOT NULL, author TEXT NOT NULL, category TEXT NOT NULL, description TEXT NOT NULL, language TEXT NOT NULL, format TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, digest TEXT UNIQUE NOT NULL, byte_size INTEGER NOT NULL, data ${binary}, source_url TEXT, cover TEXT, pages INTEGER, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS library_reading (user_id TEXT NOT NULL REFERENCES library_users(id), book_id TEXT NOT NULL REFERENCES library_books(id), record TEXT NOT NULL, version INTEGER NOT NULL, mutation_id TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(user_id, book_id))`,
    `CREATE INDEX IF NOT EXISTS library_sessions_expiry ON library_sessions(expires_at)`,
  ]) await query(sql);
  return { query, transaction, close, kind: databaseUrl ? 'postgres' : 'sqlite' };
}
