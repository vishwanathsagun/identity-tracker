// src/notify.js — local notifications: pure planner + native scheduler.
//
// planNotifications() is PURE (habits + settings + completions -> the exact
// notifications to schedule), so every rule is browser-testable without
// Android: frequency/scheduling, quiet hours, already-done/skip, tone copy,
// daily summary. syncNotifications() reconciles the native scheduler from the
// plan (cancel-all then schedule), which is the spec's "reconcile on open".

import { Capacitor } from "@capacitor/core";
import * as stats from "./stats.js";
import * as repo from "./repo.js";
import { addDays, todayKey, timeToMinutes } from "./date.js";
import { emit } from "./state.js";

const HORIZON_DAYS = 14; // schedule this many days ahead; reconcile on open
const MAX_PER_HABIT_PER_DAY = 3;

// deterministic id space so cancel/schedule never collides across reconciles
function notifId(habitId, dayOffset, slot) {
  return 100000 + habitId * 1000 + dayOffset * 10 + slot;
}
// summaries live above the reminder id space so the "ours" cancel filter
// (id >= 100000) always catches them; snoozed one-offs use 1000..9999 below.
const SUMMARY_ID = 900000;

/**
 * Pure planner.
 * @param {Array} habits        active habits (repo rows)
 * @param {object} settings     repo settings map
 * @param {Array} completions   completions in [today, today+HORIZON_DAYS]
 * @param {string} todayK       local day key for "today"
 * @param {number|null} nowMinutes  minutes since midnight; when given, slots
 *                  already past today are dropped (a reconcile must never
 *                  re-fire an expired reminder immediately)
 * @returns {{ notifications: Array, permissionNeeded: boolean }}
 */
export function planNotifications(habits, settings, completions, todayK, nowMinutes = null) {
  const notifications = [];
  const quietOn = settings.quiet_hours_enabled === "true";
  const quietStart = timeToMinutes(settings.quiet_hours_start ?? "22:00");
  const quietEnd = timeToMinutes(settings.quiet_hours_end ?? "07:00");
  const tone = settings.notification_tone || "neutral";
  const doneSet = new Set(completions.filter((c) => c.status === "done").map((c) => `${c.habitId}:${c.date}`));
  const skippedSet = new Set(completions.filter((c) => c.status === "skipped").map((c) => `${c.habitId}:${c.date}`));

  const inQuiet = (minutes) => {
    if (!quietOn || quietStart == null || quietEnd == null) return false;
    if (quietStart === quietEnd) return false; // degenerate window = disabled
    // window may wrap midnight (e.g. 22:00 -> 07:00)
    return quietStart < quietEnd
      ? minutes >= quietStart && minutes < quietEnd
      : minutes >= quietStart || minutes < quietEnd;
  };

  for (const habit of habits) {
    const times = habit.reminderTimes.slice(0, MAX_PER_HABIT_PER_DAY);
    if (!times.length) continue;
    for (let off = 0; off < HORIZON_DAYS; off++) {
      const dayKey = addDays(todayK, off);
      if (!stats.isScheduled(habit, dayKey)) continue;
      const key = `${habit.id}:${dayKey}`;
      if (doneSet.has(key) || skippedSet.has(key)) continue;
      const slotCopy = ["your small vote", "a vote for who you're becoming", "one small step"];
      times.forEach((t, slot) => {
        const minutes = timeToMinutes(t);
        if (minutes == null) return;
        if (off === 0 && nowMinutes != null && minutes <= nowMinutes) return; // already past today
        if (inQuiet(minutes)) return; // quiet hours: notification is dropped
        notifications.push({
          id: notifId(habit.id, off, slot),
          habitId: habit.id,
          dayKey,
          time: t,
          title: copyFor(tone, "title", habit.name),
          body: copyFor(tone, "body", habit.name, slotCopy[slot] || slotCopy[0]),
          extra: { habitId: habit.id, dayKey, kind: "reminder" },
        });
      });
    }
  }

  // Daily summary (opt-in): TODAY ONLY. The body reports progress "so far",
  // which cannot be precomputed for future days; reconcile-on-change keeps
  // today's copy fresh. Suppressed when everything is done (no nagging), in
  // quiet hours, or when its time already passed.
  if (settings.daily_summary_enabled === "true") {
    const summaryMin = timeToMinutes(settings.daily_summary_time ?? "20:00");
    const pastNow = nowMinutes != null && summaryMin <= nowMinutes;
    if (summaryMin != null && !inQuiet(summaryMin) && !pastNow) {
      const scheduled = stats.scheduledHabits(habits, todayK);
      const done = scheduled.filter((h) => doneSet.has(`${h.id}:${todayK}`)).length;
      if (scheduled.length && done !== scheduled.length) {
        notifications.push({
          id: SUMMARY_ID,
          habitId: null,
          dayKey: todayK,
          time: settings.daily_summary_time,
          title: "Today's votes",
          body: `${done} of ${scheduled.length} small votes cast so far.`,
          extra: { kind: "summary", dayKey: todayK },
        });
      }
    }
  }

  return { notifications, permissionNeeded: notifications.length > 0 };
}

function copyFor(tone, slot, name, phrase = "") {
  if (slot === "title") {
    if (tone === "gentle") return `${name} — whenever you're ready`;
    if (tone === "push") return `${name} is waiting`;
    return name;
  }
  if (tone === "gentle") return `A gentle nudge: ${phrase}.`;
  if (tone === "push") return `Cast ${phrase} now — don't break the chain.`;
  return `Your ${phrase} for ${name}.`;
}

// ---------------------------------------------------------------------------
// native scheduling (Android); web/dev: planner is testable, scheduler no-ops
// ---------------------------------------------------------------------------
let reconciling = false;

export async function syncNotifications() {
  if (!Capacitor.isNativePlatform()) return { scheduled: 0, platform: "web" };
  if (reconciling) return { scheduled: 0, skipped: "in-flight" };
  reconciling = true;
  try {
    // Time-boxed: on some devices a notification bridge call never settles;
    // an unbounded hang would wedge every future reconcile ("in-flight").
    return await timeBox(syncNotificationsNative(), 20000, "notification sync");
  } finally {
    reconciling = false;
  }
}

function timeBox(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timed out: ${label} (${ms}ms)`)), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

async function syncNotificationsNative() {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== "granted") return { scheduled: 0, permission: perm.display };

    const habits = await repo.getHabits();
    const settings = await repo.getSettings();
    const today = todayKey();
    const completions = await repo.getCompletions({ start: today, end: addDays(today, HORIZON_DAYS) });
    const now = new Date();
    const { notifications } = planNotifications(habits, settings, completions, today, now.getHours() * 60 + now.getMinutes());

    // reconcile: cancel everything we own, then schedule the fresh plan
    const existing = await LocalNotifications.getScheduled();
    const ours = existing.notifications.filter((n) => n.id >= 100000);
    if (ours.length) await LocalNotifications.cancel({ notifications: ours });

    if (!notifications.length) return { scheduled: 0 };

    // action buttons on the shade; only reminders (not summaries) get them
    const actions = [
      { id: "mark_done", title: "Done ✓" },
      { id: "later_today", title: "Later" },
    ];
    await LocalNotifications.schedule({
      notifications: notifications.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        schedule: { at: atDate(n.dayKey, n.time), allowWhileIdle: true },
        extra: n.extra,
        actions: n.extra.kind === "reminder" ? actions : undefined,
        smallIcon: "ic_stat_name",
        channelId: "habit-reminders",
      })),
    });
    return { scheduled: notifications.length };
}

function atDate(dayKey, hhmm) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

/** notification tap/action handling + reconcile triggers */
export async function initNotifications() {
  if (!Capacitor.isNativePlatform()) {
    // still expose the planner for browser tests / console checks
    window.__planNotifications = async () => {
      const habits = await repo.getHabits();
      const settings = await repo.getSettings();
      const today = todayKey();
      const completions = await repo.getCompletions({ start: today, end: addDays(today, HORIZON_DAYS) });
      const now = new Date();
      return planNotifications(habits, settings, completions, today, now.getHours() * 60 + now.getMinutes()).notifications;
    };
    return;
  }

  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const { App } = await import("@capacitor/app");

    // channel with sound/vibration (Android 8+)
    try {
      await LocalNotifications.createChannel?.({
        id: "habit-reminders",
        name: "Habit reminders",
        importance: 4,
        vibration: true,
        sound: "default",
      });
    } catch {
      /* plugin build without channel support */
    }

    // tap -> open Today; action -> quick-complete from the shade
    await LocalNotifications.addListener("performAction", async (raw) => {
      const action = normalizeAction(raw);
      try {
        if (action.extra?.kind === "summary" || action.actionId === "tap") {
          // body tap (any kind) -> land on Today
          emit("navigate", { screen: "today" });
          return;
        }
        if (action.extra?.habitId == null) return;
        const dayKey = action.extra.dayKey || todayKey();
        if (action.actionId === "mark_done") {
          await repo.setCompletion(Number(action.extra.habitId), dayKey, "done");
          emit("toast", "Vote cast ✓");
          await syncNotifications(); // done habit's future nudges drop off
        } else if (action.actionId === "later_today") {
          // re-schedule a one-off nudge an hour from now
          const habit = await repo.getHabit(Number(action.extra.habitId));
          if (!habit) return;
          const at = new Date(Date.now() + 60 * 60 * 1000);
          await LocalNotifications.schedule({
            notifications: [
              {
                id: Math.floor(Math.random() * 9000) + 1000, // below owned range
                title: habit.name,
                body: "Still a small vote waiting.",
                schedule: { at, allowWhileIdle: true },
                extra: { habitId: habit.id, dayKey, kind: "reminder" },
                smallIcon: "ic_stat_name",
                channelId: "habit-reminders",
              },
            ],
          });
        }
      } catch (e) {
        console.warn("[notify] action failed", e);
      }
    });

    // reconcile on every resume (spec: notifications reconcile on open)
    await App.addListener("resume", () => {
      syncNotifications().catch((e) => console.warn("[notify] resume reconcile failed", e));
    });
  } catch (e) {
    console.warn("[notify] init failed", e);
  }
}

// Capacitor versions differ in event payload shape; normalize once.
function normalizeAction(raw) {
  if (!raw) return {};
  if (raw.notification) {
    return {
      actionId: raw.actionId ?? raw.action?.id ?? "tap",
      extra: raw.notification.extra || {},
    };
  }
  return { actionId: raw.actionId ?? "tap", extra: raw.extra || {} };
}

// re-export for settings screens (Step 7) and tests
export { HORIZON_DAYS };
