// src/repo.js — repository layer: the ONLY place the UI talks to for data.
// All writes are wrapped in transactions and emit a 'change' event afterwards.

import * as db from "./db.js";
import { emit } from "./state.js";
import { localTimestamp, todayKey } from "./date.js";

// ---------------------------------------------------------------------------
// row mapping
// ---------------------------------------------------------------------------
function rowToHabit(r) {
  return {
    id: r.id,
    name: r.name,
    icon: r.icon,
    colorKey: r.color_key,
    identityId: r.identity_id ?? null,
    twoMinVersion: r.two_min_version ?? null,
    cueTime: r.cue_time ?? null,
    cuePlace: r.cue_place ?? null,
    cueIcon: r.cue_icon ?? null,
    stackAnchor: r.stack_anchor ?? null,
    frequencyType: r.frequency_type,
    frequencyDays: JSON.parse(r.frequency_days || "[]"),
    timesPerWeek: r.times_per_week ?? null,
    reminderTimes: JSON.parse(r.reminder_times || "[]"),
    reminderMessage: r.reminder_message ?? null,
    createdAt: r.created_at,
    archivedAt: r.archived_at ?? null,
    sortOrder: r.sort_order,
  };
}

function rowToCompletion(r) {
  return {
    id: r.id,
    habitId: r.habit_id,
    date: r.date,
    status: r.status,
    skipReason: r.skip_reason ?? null,
    completedAt: r.completed_at ?? null,
  };
}

function changed(entity) {
  if (entity === "all") {
    // fan out per-entity so every filtered listener (today, calendar, insights,
    // identity, settings, notify reconcile, settings cache) refreshes after
    // delete-all / import — no listener subscribes to "all" itself.
    for (const e of ["habits", "completions", "identities", "notes", "settings"]) {
      emit("change", { entity: e, at: Date.now() });
    }
    return;
  }
  emit("change", { entity, at: Date.now() });
}

// ---------------------------------------------------------------------------
// settings
// ---------------------------------------------------------------------------
export const DEFAULT_SETTINGS = {
  notification_tone: "neutral", // gentle | neutral | push
  quiet_hours_enabled: "false",
  quiet_hours_start: "22:00",
  quiet_hours_end: "07:00",
  daily_summary_enabled: "false",
  daily_summary_time: "20:00",
  reduce_transparency: "false", // frame-probe may flip to "auto"
  reduce_transparency_mode: "off", // off | auto | on
  reduce_motion: "false",
  haptics: "true",
  first_day_of_week: "mon", // mon | sun
  theme: "dark",
  onboarding_done: "false",
  display_name: "Alex",
};

let settingsCache = null;

export async function initRepo() {
  await db.initDb();
  settingsCache = null;
  await getSettings();
}

export async function getSettings() {
  if (settingsCache) return settingsCache;
  const rows = await db.query("SELECT key, value FROM settings");
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  settingsCache = { ...DEFAULT_SETTINGS, ...stored };
  return settingsCache;
}

export async function getSetting(key) {
  const s = await getSettings();
  return s[key] ?? DEFAULT_SETTINGS[key] ?? null;
}

export async function setSettings(patch) {
  return db.transaction(async () => {
    for (const [key, value] of Object.entries(patch)) {
      await db.execute("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [
        key,
        String(value),
      ]);
    }
    settingsCache = null;
  }).then(() => {
    changed("settings");
    return getSettings();
  });
}

// ---------------------------------------------------------------------------
// habits
// ---------------------------------------------------------------------------
export async function getHabits({ includeArchived = false } = {}) {
  const sql = includeArchived
    ? "SELECT * FROM habits ORDER BY sort_order, id"
    : "SELECT * FROM habits WHERE archived_at IS NULL ORDER BY sort_order, id";
  const rows = await db.query(sql);
  return rows.map(rowToHabit);
}

export async function getHabit(id) {
  const rows = await db.query("SELECT * FROM habits WHERE id = ?", [id]);
  return rows.length ? rowToHabit(rows[0]) : null;
}

export async function createHabit(data) {
  const createdAt = data.createdAt || localTimestamp();
  return db
    .transaction(async () => {
      const maxRow = await db.query("SELECT COALESCE(MAX(sort_order), 0) AS m FROM habits");
      const sortOrder = data.sortOrder ?? (maxRow[0].m || 0) + 1;
      const res = await db.execute(
        `INSERT INTO habits (name, icon, color_key, identity_id, two_min_version, cue_time, cue_place, cue_icon,
          stack_anchor, frequency_type, frequency_days, times_per_week, reminder_times, reminder_message,
          created_at, archived_at, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
        [
          data.name,
          data.icon || "check_circle",
          data.colorKey || "mauve",
          data.identityId ?? null,
          data.twoMinVersion ?? null,
          data.cueTime ?? null,
          data.cuePlace ?? null,
          data.cueIcon ?? null,
          data.stackAnchor ?? null,
          data.frequencyType || "daily",
          JSON.stringify(data.frequencyDays ?? [0, 1, 2, 3, 4, 5, 6]),
          data.timesPerWeek ?? null,
          JSON.stringify(data.reminderTimes ?? []),
          data.reminderMessage ?? null,
          createdAt,
          sortOrder,
        ]
      );
      return res.lastId;
    })
    .then((id) => {
      changed("habits");
      return id;
    });
}

export async function updateHabit(id, patch) {
  const current = await getHabit(id);
  if (!current) throw new Error(`habit ${id} not found`);
  const merged = { ...current, ...patch };
  return db
    .transaction(async () => {
      await db.execute(
        `UPDATE habits SET name = ?, icon = ?, color_key = ?, identity_id = ?, two_min_version = ?,
           cue_time = ?, cue_place = ?, cue_icon = ?, stack_anchor = ?, frequency_type = ?,
           frequency_days = ?, times_per_week = ?, reminder_times = ?, reminder_message = ?, sort_order = ?
         WHERE id = ?`,
        [
          merged.name,
          merged.icon,
          merged.colorKey,
          merged.identityId ?? null,
          merged.twoMinVersion ?? null,
          merged.cueTime ?? null,
          merged.cuePlace ?? null,
          merged.cueIcon ?? null,
          merged.stackAnchor ?? null,
          merged.frequencyType,
          JSON.stringify(merged.frequencyDays ?? []),
          merged.timesPerWeek ?? null,
          JSON.stringify(merged.reminderTimes ?? []),
          merged.reminderMessage ?? null,
          merged.sortOrder,
          id,
        ]
      );
    })
    .then(() => {
      changed("habits");
      return merged;
    });
}

export async function archiveHabit(id, archived = true) {
  return db
    .transaction(async () => {
      await db.execute("UPDATE habits SET archived_at = ? WHERE id = ?", [archived ? localTimestamp() : null, id]);
    })
    .then(() => {
      changed("habits");
    });
}

export const unarchiveHabit = (id) => archiveHabit(id, false);

/** cascades completions + notes (also enforced by FK ON DELETE CASCADE) */
export async function deleteHabit(id) {
  return db
    .transaction(async () => {
      await db.execute("DELETE FROM completions WHERE habit_id = ?", [id]);
      await db.execute("DELETE FROM notes WHERE habit_id = ?", [id]);
      await db.execute("DELETE FROM habits WHERE id = ?", [id]);
    })
    .then(() => {
      changed("habits");
    });
}

// ---------------------------------------------------------------------------
// completions
// ---------------------------------------------------------------------------
/**
 * status: 'done' | 'skipped' | null (null clears the record entirely)
 */
export async function setCompletion(habitId, date, status, skipReason = null) {
  return db
    .transaction(async () => {
      if (status == null) {
        await db.execute("DELETE FROM completions WHERE habit_id = ? AND date = ?", [habitId, date]);
        return;
      }
      await db.execute(
        `INSERT INTO completions (habit_id, date, status, skip_reason, completed_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(habit_id, date) DO UPDATE SET
           status = excluded.status,
           skip_reason = excluded.skip_reason,
           completed_at = excluded.completed_at`,
        [habitId, date, status, skipReason, localTimestamp()]
      );
    })
    .then(() => {
      changed("completions");
    });
}

/** range: { start, end } day keys inclusive; optional habitId */
export async function getCompletions(range = null, habitId = null) {
  const clauses = [];
  const params = [];
  if (range) {
    clauses.push("date BETWEEN ? AND ?");
    params.push(range.start, range.end);
  }
  if (habitId != null) {
    clauses.push("habit_id = ?");
    params.push(habitId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = await db.query(`SELECT * FROM completions ${where} ORDER BY date`, params);
  return rows.map(rowToCompletion);
}

// ---------------------------------------------------------------------------
// identities
// ---------------------------------------------------------------------------
function rowToIdentity(r) {
  return { id: r.id, name: r.name, why: r.why ?? null, createdAt: r.created_at };
}

export async function getIdentities() {
  const rows = await db.query("SELECT * FROM identities ORDER BY created_at, id");
  return rows.map(rowToIdentity);
}

export async function createIdentity({ name, why = null }) {
  return db
    .transaction(async () => {
      const res = await db.execute("INSERT INTO identities (name, why, created_at) VALUES (?, ?, ?)", [name, why, localTimestamp()]);
      return res.lastId;
    })
    .then((id) => {
      changed("identities");
      return id;
    });
}

export async function updateIdentity(id, patch) {
  return db
    .transaction(async () => {
      if (patch.name !== undefined) await db.execute("UPDATE identities SET name = ? WHERE id = ?", [patch.name, id]);
      if (patch.why !== undefined) await db.execute("UPDATE identities SET why = ? WHERE id = ?", [patch.why, id]);
    })
    .then(() => changed("identities"));
}

/** reassignTo: identity id to move habits to, or null to unlink */
export async function deleteIdentity(id, reassignTo = null) {
  return db
    .transaction(async () => {
      await db.execute("UPDATE habits SET identity_id = ? WHERE identity_id = ?", [reassignTo, id]);
      await db.execute("DELETE FROM identities WHERE id = ?", [id]);
    })
    .then(() => changed("identities"));
}

// ---------------------------------------------------------------------------
// notes
// ---------------------------------------------------------------------------
function rowToNote(r) {
  return { id: r.id, habitId: r.habit_id, date: r.date, text: r.text, createdAt: r.created_at };
}

export async function getNotes(habitId) {
  const rows = await db.query("SELECT * FROM notes WHERE habit_id = ? ORDER BY date DESC, id DESC", [habitId]);
  return rows.map(rowToNote);
}

export async function saveNote({ habitId, date = null, text }) {
  if (!text || !text.trim()) return null;
  return db
    .transaction(async () => {
      const res = await db.execute("INSERT INTO notes (habit_id, date, text, created_at) VALUES (?, ?, ?, ?)", [
        habitId,
        date,
        text.trim(),
        localTimestamp(),
      ]);
      return res.lastId;
    })
    .then((id) => {
      changed("notes");
      return id;
    });
}

export async function deleteNote(id) {
  return db.transaction(async () => db.execute("DELETE FROM notes WHERE id = ?", [id])).then(() => changed("notes"));
}

// ---------------------------------------------------------------------------
// data maintenance
// ---------------------------------------------------------------------------
export async function deleteAllData() {
  await db.clearAll();
  settingsCache = null;
  changed("all");
}

// ---------------------------------------------------------------------------
// backup (export / import)
// ---------------------------------------------------------------------------
export const BACKUP_APP = "violet-dusk-habits";
const BACKUP_TABLES = ["habits", "completions", "identities", "notes", "settings"];

/** Full-fidelity JSON backup: raw rows from every table, ids preserved. */
export async function exportBackup() {
  const backup = { app: BACKUP_APP, schemaVersion: db.SCHEMA_VERSION, exportedAt: localTimestamp() };
  for (const t of BACKUP_TABLES) backup[t] = await db.query(`SELECT * FROM ${t}`);
  return backup;
}

/** Shape check only — the app marker must match when present. */
export function isValidBackup(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  if (data.app !== undefined && data.app !== BACKUP_APP) return false;
  return BACKUP_TABLES.every((t) => Array.isArray(data[t]) && data[t].every((r) => r && typeof r === "object" && !Array.isArray(r)));
}

/**
 * Replace ALL local data with a backup. Single transaction: if any row fails
 * the original data is rolled back intact (web BEGIN/ROLLBACK, native
 * beginTransaction/rollback). Explicit ids keep cross-table links.
 */
export async function importBackup(data) {
  if (!isValidBackup(data)) throw new Error("Not a valid Violet Dusk backup file");
  const counts = Object.fromEntries(BACKUP_TABLES.map((t) => [t, data[t].length]));
  await db.transaction(async () => {
    // delete in FK-safe order (mirrors clearAll)
    for (const t of ["completions", "notes", "habits", "identities", "settings"]) {
      await db.execute(`DELETE FROM ${t}`);
    }
    for (const t of BACKUP_TABLES) {
      const rows = data[t];
      if (!rows.length) continue;
      const cols = Object.keys(rows[0]);
      const sql = `INSERT INTO ${t} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`;
      for (const row of rows) await db.execute(sql, cols.map((c) => row[c] ?? null));
    }
  });
  settingsCache = null;
  changed("all");
  return counts;
}

export { todayKey };
