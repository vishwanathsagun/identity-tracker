// src/stats.js — pure functions. No I/O, no DOM.
// Consistency score uses EXACTLY the spec'd algorithm:
//   For each scheduled day in order:
//     score = score + 0.1 * (done ? 100 - score : 0 - score)
//   Skipped days and unscheduled days are ignored (neither help nor hurt).
//
// Interpretation note: "today" is only counted once its outcome is known
// (completed/skipped). A still-pending today is neither a hit nor a miss yet,
// so it is skipped — this keeps the score stable during the day and makes the
// "never-miss-twice" nudge (missed yesterday + pending today) coherent.

import { addDays, daysBetween, parseKey, startOfWeek, weekdayIndex } from "./date.js";

// ---------------------------------------------------------------------------
// scheduling
// ---------------------------------------------------------------------------
/** Is this habit scheduled on the given local day key? */
export function isScheduled(habit, key) {
  if (habit.archivedAt) return false;
  const createdKey = habit.createdAt ? habit.createdAt.slice(0, 10) : null;
  if (createdKey && daysBetween(createdKey, key) < 0) return false;
  switch (habit.frequencyType) {
    case "daily":
      return true;
    case "days_of_week":
    case "times_per_week":
      // frequency_days IS the concrete weekly schedule; times_per_week is the
      // target count metadata validated at edit time.
      return habit.frequencyDays.includes(weekdayIndex(key));
    default:
      return true;
  }
}

export function scheduledHabits(habits, key) {
  return habits.filter((h) => isScheduled(h, key)).sort((a, b) => a.sortOrder - b.sortOrder);
}

// ---------------------------------------------------------------------------
// day grouping (reproduces the prototype exactly)
//   Morning  < 12:00 · Afternoon 12:00–17:59 · Evening >= 18:00
// ---------------------------------------------------------------------------
export function groupForHabit(habit) {
  if (!habit.cueTime) return "evening"; // anchor-only habits default to evening list
  const [h] = habit.cueTime.split(":").map(Number);
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

export const GROUPS = [
  { key: "morning", headingId: "morning-heading", countId: "morning-count", listId: "morning-list", tail: "aligned" },
  { key: "afternoon", headingId: "afternoon-heading", countId: "afternoon-count", listId: "afternoon-list", tail: "aligned" },
  { key: "evening", headingId: "evening-heading", countId: "evening-count", listId: "evening-list", tail: "ready" },
];

// ---------------------------------------------------------------------------
// consistency score
// ---------------------------------------------------------------------------
/**
 * @param {Array} completionList  completions for this habit (any range), as {date, status}
 * @param {object} habit
 * @param {string} todayK         local day key for "today"
 * @returns {number} 0..100
 */
export function consistencyScore(habit, completionList, todayK) {
  const byDate = new Map(completionList.map((c) => [c.date, c.status]));
  const createdKey = habit.createdAt ? habit.createdAt.slice(0, 10) : todayK;
  let score = 0;
  // iterate scheduled days from created through today
  for (let key = createdKey; daysBetween(key, todayK) >= 0; key = addDays(key, 1)) {
    if (!isScheduled(habit, key)) continue;
    const status = byDate.get(key);
    if (status === "skipped") continue; // ignored
    if (status === "done") {
      score = score + 0.1 * (100 - score);
      continue;
    }
    if (key === todayK) continue; // today still pending: outcome unknown
    score = score + 0.1 * (0 - score); // missed scheduled day
  }
  return score;
}

/** Chip copy: '94% steady'; icon is trending_up when > 85 else sync (demo parity) */
export function consistencyChip(habit, completionList, todayK) {
  const score = consistencyScore(habit, completionList, todayK);
  return {
    score,
    percent: Math.round(score),
    icon: score > 85 ? "trending_up" : "sync",
  };
}

/** minimum endowed arc so a fresh habit never renders a zero-size ring */
export function endowedArcPercent(score) {
  return Math.max(Math.round(score), 8);
}

// ---------------------------------------------------------------------------
// runs / totals
// ---------------------------------------------------------------------------
/** consecutive scheduled days done, ending today (or yesterday if today pending/skipped) */
export function currentRun(habit, completionList, todayK) {
  const byDate = new Map(completionList.map((c) => [c.date, c.status]));
  let key = byDate.get(todayK) === "done" ? todayK : addDays(todayK, -1);
  let run = 0;
  const createdKey = habit.createdAt ? habit.createdAt.slice(0, 10) : key;
  while (daysBetween(createdKey, key) >= 0) {
    if (!isScheduled(habit, key)) {
      key = addDays(key, -1);
      continue;
    }
    if (byDate.get(key) === "done") {
      run += 1;
      key = addDays(key, -1);
    } else {
      break;
    }
  }
  return run;
}

export function bestRun(habit, completionList, todayK) {
  const byDate = new Map(completionList.map((c) => [c.date, c.status]));
  const createdKey = habit.createdAt ? habit.createdAt.slice(0, 10) : todayK;
  let best = 0;
  let run = 0;
  for (let key = createdKey; daysBetween(key, todayK) >= 0; key = addDays(key, 1)) {
    if (!isScheduled(habit, key)) continue;
    const status = byDate.get(key);
    if (status === "done") {
      run += 1;
      best = Math.max(best, run);
    } else if (status !== "skipped") {
      run = 0;
    }
  }
  return best;
}

export function totalVotes(completionList) {
  return completionList.filter((c) => c.status === "done").length;
}

/**
 * Per-day state for ONE habit on a given day key — drives the detail calendar:
 *   'done' | 'skipped' | 'missed' (scheduled + known + not done) |
 *   'pending' (scheduled, today, outcome unknown) | 'unscheduled'
 */
export function habitDayState(habit, completionList, key, todayK) {
  const byDate = new Map(completionList.map((c) => [c.date, c.status]));
  if (!isScheduled(habit, key)) return "unscheduled";
  const status = byDate.get(key);
  if (status === "done") return "done";
  if (status === "skipped") return "skipped";
  if (key === todayK) return "pending";
  return "missed";
}

/**
 * Last N weeks (most recent first) of { start, end, scheduled, done, skipped }
 * for one habit — the detail screen's weekly rollup.
 */
export function weeklyRollup(habit, completionList, todayK, weeks = 4) {
  const byDate = new Map(completionList.map((c) => [c.date, c.status]));
  const out = [];
  const firstDay = 1; // Monday — matches the app's default first_day_of_week
  for (let w = 0; w < weeks; w++) {
    const end = addDays(startOfWeek(todayK, firstDay), -7 * w + 6);
    const start = addDays(end, -6);
    let scheduled = 0;
    let done = 0;
    let skipped = 0;
    for (let key = start; daysBetween(key, end) >= 0; key = addDays(key, 1)) {
      if (!isScheduled(habit, key)) continue;
      const status = byDate.get(key);
      if (status === "skipped") {
        skipped += 1;
        continue;
      }
      if (key === todayK && status == null) continue; // pending this week
      scheduled += 1;
      if (status === "done") done += 1;
    }
    out.push({ start, end, scheduled, done, skipped });
  }
  return out;
}

/** completion rate over scheduled days that have a known outcome */
export function completionRate(habit, completionList, todayK) {
  const byDate = new Map(completionList.map((c) => [c.date, c.status]));
  const createdKey = habit.createdAt ? habit.createdAt.slice(0, 10) : todayK;
  let scheduled = 0;
  let done = 0;
  for (let key = createdKey; daysBetween(key, todayK) >= 0; key = addDays(key, 1)) {
    if (!isScheduled(habit, key)) continue;
    const status = byDate.get(key);
    if (status === "skipped") continue;
    if (key === todayK && status == null) continue;
    scheduled += 1;
    if (status === "done") done += 1;
  }
  return scheduled === 0 ? 0 : (done / scheduled) * 100;
}

// ---------------------------------------------------------------------------
// never-miss-twice nudge
// ---------------------------------------------------------------------------
export function needsNudge(habit, completionList, todayK) {
  const byDate = new Map(completionList.map((c) => [c.date, c.status]));
  const yesterday = addDays(todayK, -1);
  return (
    isScheduled(habit, todayK) &&
    byDate.get(todayK) !== "done" &&
    byDate.get(todayK) !== "skipped" &&
    isScheduled(habit, yesterday) &&
    byDate.get(yesterday) !== "done" &&
    byDate.get(yesterday) !== "skipped"
  );
}

// ---------------------------------------------------------------------------
// level (Seed -> Spark -> Flame -> Star -> Nova) — thresholds in ONE place
// ---------------------------------------------------------------------------
export const LEVELS = [
  { name: "Seed", min: 0 },
  { name: "Spark", min: 25 },
  { name: "Flame", min: 100 },
  { name: "Star", min: 300 },
  { name: "Nova", min: 750 },
];

export function levelForVotes(total) {
  let current = LEVELS[0];
  let next = LEVELS[1] ?? null;
  for (let i = 0; i < LEVELS.length; i++) {
    if (total >= LEVELS[i].min) {
      current = LEVELS[i];
      next = LEVELS[i + 1] ?? null;
    }
  }
  return { current, next };
}

// ---------------------------------------------------------------------------
// week strip / calendar helpers
// ---------------------------------------------------------------------------
/**
 * Dot state for a day: 'perfect' (all scheduled done), 'partial', 'none'
 */
export function dayCompletionState(habits, completionsByKey, key) {
  const scheduled = scheduledHabits(habits, key);
  if (scheduled.length === 0) return "none";
  let done = 0;
  for (const h of scheduled) {
    const c = completionsByKey.get(`${h.id}:${key}`);
    if (c && c.status === "done") done += 1;
  }
  if (done === scheduled.length) return "perfect";
  if (done > 0) return "partial";
  return "none";
}

export function parseKeyLocal(key) {
  return parseKey(key);
}
