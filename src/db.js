// src/db.js — SQLite init, versioned migrations, and low-level queries.
// Native (Android): @capacitor-community/sqlite -> real native DB directory.
// Web (dev/preview only): sql.js WASM + localStorage persistence, so the app is
// fully testable in a browser. Same SQL and migrations on both paths.

import { Capacitor } from "@capacitor/core";

const DB_NAME = "habits.db";
const WEB_KEY = "violet-dusk.db.v1"; // localStorage slot for the web driver

export const isNative = Capacitor.isNativePlatform();

let dbReady = null;
let conn = null; // native SQLiteDBConnection
let web = null; // { db } sql.js handle
let useNative = false; // true only after the native driver actually opened —
                       // query routing follows this, NOT isNative, so a failed
                       // native open can transparently fall back to web storage.
let webOpened = false; // web driver booted (sql.js + localStorage)
let webMigrated = false; // migrations have been applied to the web driver
let inMigrate = false; // demotion during migrate must not recurse into migrate

// ---------------------------------------------------------------------------
// Migrations (versioned, non-destructive). Index = target PRAGMA user_version.
// ---------------------------------------------------------------------------
const MIGRATIONS = [
  // v1 — initial schema (spec)
  `
  CREATE TABLE IF NOT EXISTS identities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    why TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS habits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'check_circle',
    color_key TEXT NOT NULL DEFAULT 'mauve',
    identity_id INTEGER REFERENCES identities(id) ON DELETE SET NULL,
    two_min_version TEXT,
    cue_time TEXT,
    cue_place TEXT,
    cue_icon TEXT,
    stack_anchor TEXT,
    frequency_type TEXT NOT NULL DEFAULT 'daily',
    frequency_days TEXT NOT NULL DEFAULT '[0,1,2,3,4,5,6]',
    times_per_week INTEGER,
    reminder_times TEXT NOT NULL DEFAULT '[]',
    reminder_message TEXT,
    created_at TEXT NOT NULL,
    archived_at TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS completions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    status TEXT NOT NULL,
    skip_reason TEXT,
    completed_at TEXT,
    UNIQUE(habit_id, date)
  );
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
    date TEXT,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_completions_date ON completions(date);
  CREATE INDEX IF NOT EXISTS idx_completions_habit_date ON completions(habit_id, date);
  `,
];
export const SCHEMA_VERSION = MIGRATIONS.length;

// ---------------------------------------------------------------------------
// Open + migrate
// ---------------------------------------------------------------------------
function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function openNative() {
  const { SQLiteConnection } = await import("@capacitor-community/sqlite");
  const { CapacitorSQLite } = await import("@capacitor-community/sqlite");
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  conn = await sqlite.createConnection(DB_NAME, false, "no-encryption", 1, false);
  await conn.open();
  await conn.execute("PRAGMA foreign_keys = ON");
}

async function openWeb() {
  // Use the package entry so bundlers select sql.js's browser build. The deep
  // Node entry imports node:fs and node:crypto, which are unavailable in WebViews.
  const { default: initSqlJs } = await import("sql.js");
  const SQL = await initSqlJs({ locateFile: () => "/assets/sql-wasm.wasm" });
  let bytes = null;
  try {
    const b64 = localStorage.getItem(WEB_KEY);
    if (b64) bytes = base64ToBytes(b64);
  } catch {
    /* private mode etc. — start empty */
  }
  web = { db: bytes ? new SQL.Database(bytes) : new SQL.Database() };
  web.db.run("PRAGMA foreign_keys = ON");
}

async function ensureWeb() {
  if (!webOpened) {
    await openWeb();
    webOpened = true;
  }
}

/**
 * Emergency demotion: the native driver failed mid-flight (some devices' WebView
 * bridge rejects plugin calls). Switch PERMANENTLY to the in-app driver, make
 * sure its schema exists, and let the caller retry the failed op there. A
 * driver-level problem must never brick the app.
 */
async function demoteNative(reason) {
  if (!useNative) return;
  useNative = false;
  console.error("[db] native driver failed — switching to in-app storage", reason);
  try { if (conn) await conn.close(); } catch { /* best-effort */ }
  conn = null;
  await ensureWeb();
  if (!webMigrated && !inMigrate) await migrate();
}

let persistTimer = null;
function persistWebSoon() {
  if (!web) return;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      localStorage.setItem(WEB_KEY, bytesToBase64(web.db.export()));
    } catch (e) {
      console.error("[db] web persist failed", e);
    }
  }, 150);
}

async function migrate() {
  inMigrate = true;
  try {
    const rows = await rawQuery("PRAGMA user_version");
    let version = Number(rows[0]?.user_version ?? 0);
    while (version < MIGRATIONS.length) {
      const next = version + 1;
      // raw ops here (not the public ones) — the public ones await initDb(),
      // which is the very promise we're resolving inside (circular await).
      await rawExecute("BEGIN");
      try {
        await rawExecuteScript(MIGRATIONS[version]);
        await rawExecute(`PRAGMA user_version = ${next}`);
        await rawExecute("COMMIT");
      } catch (e) {
        try { await rawExecute("ROLLBACK"); } catch { /* ignore */ }
        throw e;
      }
      version = next;
    }
    if (!useNative) webMigrated = true; // finished against the web driver
  } finally {
    inMigrate = false;
  }
}

/** Initialize the database (idempotent). Must be awaited before repo use. */
function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timed out waiting for ${label} (${ms}ms)`)), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

export function initDb() {
  if (!dbReady) {
    dbReady = (async () => {
      if (isNative) {
        // Native SQLite first. If the plugin rejects OR never settles, fall
        // back to the in-app sql.js driver (works inside the Capacitor
        // WebView) so a driver problem can never brick the whole app.
        try {
          await withTimeout(openNative(), 6000, "native sqlite");
          useNative = true;
        } catch (e) {
          console.error("[db] native sqlite unavailable — falling back to in-app storage", e);
          await ensureWeb();
        }
      } else {
        await ensureWeb();
      }
      await migrate();
    })().catch((e) => {
      console.error("[db] init failed", e);
      dbReady = null;
      throw e;
    });
  }
  return dbReady;
}

// ---------------------------------------------------------------------------
// Low-level queries (uniform across drivers)
// Driver-level impls; no initDb() guard (unsafe before/during init).
// ---------------------------------------------------------------------------
async function rawQuery(sql, params = []) {
  if (useNative) {
    try {
      const res = await conn.query(sql, params);
      return res.values ?? [];
    } catch (e) {
      await demoteNative(e); // retry below on the in-app driver
    }
  }
  const stmt = web.db.prepare(sql);
  try {
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows;
  } finally {
    stmt.free();
  }
}

async function rawExecuteScript(sql) {
  if (useNative) {
    try {
      await conn.execute(sql);
      return;
    } catch (e) {
      await demoteNative(e); // retry below on the in-app driver
    }
  }
  web.db.exec(sql);
}

async function rawExecute(sql, params = []) {
  if (useNative) {
    try {
      const res = await conn.run(sql, params);
      const c = res.changes ?? {};
      return { changes: c.changes ?? 0, lastId: c.lastId ?? 0 };
    } catch (e) {
      await demoteNative(e); // retry below on the in-app driver
    }
  }
  web.db.run(sql, params);
  const changes = web.db.getRowsModified();
  let lastId = 0;
  if (/^\s*insert/i.test(sql)) {
    const stmt = web.db.prepare("SELECT last_insert_rowid() AS id");
    stmt.step();
    lastId = stmt.getAsObject().id;
    stmt.free();
  }
  return { changes, lastId };
}

// Public wrappers: ensure the driver is ready, then delegate.
/** SELECT -> array of row objects */
export async function query(sql, params = []) {
  await initDb();
  return rawQuery(sql, params);
}

/** multi-statement script (no params) — for migrations */
export async function executeScript(sql) {
  await initDb();
  await rawExecuteScript(sql);
  persistWebSoon();
}

/** INSERT/UPDATE/PRAGMA etc. -> { changes, lastId } */
export async function execute(sql, params = []) {
  await initDb();
  const r = await rawExecute(sql, params);
  persistWebSoon();
  return r;
}

/** Atomic transaction; fn receives the db module for chained queries */
export async function transaction(fn) {
  await initDb();
  if (useNative) {
    await conn.beginTransaction();
    try {
      const r = await fn();
      if (useNative) {
        await conn.commit();
        return r;
      }
      // fn demoted the driver mid-transaction; its writes already landed on
      // the in-app driver — just drop the abandoned native transaction.
      try { if (conn) await conn.rollback(); } catch { /* demoted away */ }
      return r;
    } catch (e) {
      try {
        if (useNative) await conn.rollback();
      } catch {
        /* already rolled back */
      }
      throw e;
    }
  }
  web.db.run("BEGIN");
  try {
    const r = await fn();
    web.db.run("COMMIT");
    persistWebSoon();
    return r;
  } catch (e) {
    try {
      web.db.run("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw e;
  }
}

/** Wipe every table (used by "Delete all data" and dev tools) */
export async function clearAll() {
  return transaction(async () => {
    await execute("DELETE FROM completions");
    await execute("DELETE FROM notes");
    await execute("DELETE FROM habits");
    await execute("DELETE FROM identities");
    await execute("DELETE FROM settings");
  });
}
