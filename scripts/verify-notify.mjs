// scripts/verify-notify.mjs — exercises the PURE notification planner.
// Loads src/notify.js as ESM source text (it runs in the browser today, but the
// project is CJS under Node), strips its import lines, and evaluates it with
// real date.js helpers + a real stats.isScheduled + stubs for repo/state/capacitor.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

// --- real date helpers (date.js is dependency-free ESM) ---------------------
const dateSrc = read("src/date.js").replace(/^export /gm, "");
// --- real isScheduled/scheduledHabits from stats.js (extract function bodies)
const statsSrc = read("src/stats.js");
const extract = (name) => statsSrc.match(new RegExp(`export function ${name}[\\s\\S]*?\\n}`))[0].replace(/^export /gm, "");
const isScheduledSrc = extract("isScheduled");
const scheduledHabitsSrc = extract("scheduledHabits");

const notifySrc = read("src/notify.js")
  .split("\n").filter((l) => !l.startsWith("import ")).join("\n")
  .replace(/^export /gm, "");

// stage 1: real date helpers + real stats functions, extracted as live bindings
const helpers = new Function(
  `${dateSrc}\n${isScheduledSrc}\n${scheduledHabitsSrc}\nreturn { addDays, timeToMinutes, isScheduled, scheduledHabits };`
)();

// stage 2: notify.js body with its imports injected
const factory = new Function(
  "Capacitor", "stats", "repo", "emit", "addDays", "timeToMinutes",
  `${notifySrc}\nreturn { planNotifications };`
);
const { planNotifications } = factory(
  { isNativePlatform: () => false },
  helpers,                       // stats.isScheduled/scheduledHabits -> real impls
  {},                            // repo (unused by the pure planner)
  () => {},                      // emit
  helpers.addDays,
  helpers.timeToMinutes
);

const TODAY = "2026-10-11"; // a Sunday
const baseSettings = {
  notification_tone: "neutral",
  quiet_hours_enabled: "false",
  quiet_hours_start: "22:00",
  quiet_hours_end: "07:00",
  daily_summary_enabled: "false",
  daily_summary_time: "20:00",
};
const habit = (over = {}) => ({
  id: 1, name: "Deep Work", archivedAt: null, createdAt: "2026-01-01T08:00:00",
  frequencyType: "daily", frequencyDays: [0,1,2,3,4,5,6], reminderTimes: ["09:00"], ...over,
});

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok  ${label}`); }
  else { fail++; console.log(`FAIL  ${label}\n      got ${g}\n      want ${w}`); }
};

// 1. daily habit, one reminder, 14-day horizon -> 14 notifications
{
  const { notifications } = planNotifications([habit()], baseSettings, [], TODAY);
  eq("daily -> one per day over horizon", notifications.length, 14);
  eq("ids deterministic & unique", new Set(notifications.map(n=>n.id)).size, 14);
  eq("first is today @09:00", [notifications[0].dayKey, notifications[0].time], [TODAY, "09:00"]);
  eq("kind is reminder", notifications[0].extra.kind, "reminder");
}

// 2. done today -> today dropped, tomorrow kept
{
  const comps = [{ habitId: 1, date: TODAY, status: "done" }];
  const { notifications } = planNotifications([habit()], baseSettings, comps, TODAY);
  eq("done today -> no reminder today", notifications.some(n=>n.dayKey===TODAY), false);
  eq("done today -> tomorrow still scheduled", notifications.some(n=>n.dayKey==="2026-10-12"), true);
}

// 3. skipped today -> dropped like done
{
  const comps = [{ habitId: 1, date: TODAY, status: "skipped" }];
  const { notifications } = planNotifications([habit()], baseSettings, comps, TODAY);
  eq("skipped today -> no reminder today", notifications.some(n=>n.dayKey===TODAY), false);
}

// 4. archived -> nothing
{
  const { notifications } = planNotifications([habit({ archivedAt: "2026-10-01T00:00:00" })], baseSettings, [], TODAY);
  eq("archived -> none", notifications.length, 0);
}

// 5. days_of_week: only scheduled weekdays
{
  const h = habit({ frequencyType: "days_of_week", frequencyDays: [1,3] });
  const { notifications } = planNotifications([h], baseSettings, [], TODAY);
  const days = [...new Set(notifications.map(n=>n.dayKey))].sort();
  eq("days_of_week -> only Mon+Wed", days, ["2026-10-12","2026-10-14","2026-10-19","2026-10-21"]);
}

// 6. quiet hours (22:00->07:00, wraps midnight): window is [start, end).
//    Note: each habit only considers its first 3 reminder times (cap), so the
//    boundary cases are split across two habits.
{
  const s = { ...baseSettings, quiet_hours_enabled: "true" };
  const a = habit({ reminderTimes: ["23:00", "06:59", "09:00"] });
  const timesA = [...new Set(planNotifications([a], s, [], TODAY).notifications.map(n=>n.time))].sort();
  eq("quiet(wrap): 23:00 & 06:59 dropped, 09:00 kept", timesA, ["09:00"]);
  const b = habit({ id: 2, reminderTimes: ["22:00", "07:00", "21:59"] });
  const timesB = [...new Set(planNotifications([b], s, [], TODAY).notifications.map(n=>n.time))].sort();
  eq("quiet boundaries: 22:00 quiet, 07:00 & 21:59 allowed", timesB, ["07:00", "21:59"]);
}

// 7. quiet hours same-day window (no wrap)
{
  const h = habit({ reminderTimes: ["12:59","13:30","14:00"] });
  const s = { ...baseSettings, quiet_hours_enabled: "true", quiet_hours_start:"13:00", quiet_hours_end:"14:00" };
  const { notifications } = planNotifications([h], s, [], TODAY);
  const times = [...new Set(notifications.map(n=>n.time))].sort();
  eq("quiet(no-wrap) -> 13:30 dropped", times, ["12:59","14:00"].sort());
}

// 8. MAX_PER_HABIT_PER_DAY caps at 3
{
  const h = habit({ reminderTimes: ["08:00","09:00","10:00","11:00","12:00"] });
  const { notifications } = planNotifications([h], baseSettings, [], TODAY);
  eq("cap 3 reminder times/day", notifications.length, 14*3);
}

// 9. no reminder times -> nothing
{
  const { notifications } = planNotifications([habit({ reminderTimes: [] })], baseSettings, [], TODAY);
  eq("no reminder times -> none", notifications.length, 0);
}

// 10. daily summary: perfect day suppressed, imperfect day gets one
{
  const s = { ...baseSettings, daily_summary_enabled: "true", daily_summary_time: "20:00" };
  const h = habit({ reminderTimes: [] });
  const perfect = planNotifications([h], s, [{habitId:1,date:TODAY,status:"done"}], TODAY).notifications;
  eq("summary suppressed on perfect day", perfect.length, 0);
  const imperfect = planNotifications([h], s, [], TODAY).notifications;
  eq("summary emitted on imperfect day", imperfect.length, 1);
  eq("summary kind", imperfect[0].extra.kind, "summary");
  eq("summary habitId null", imperfect[0].habitId, null);
  eq("summary id in owned range", imperfect[0].id >= 100000, true);
}

// 11. summary respects quiet hours + already-past today
{
  const s = { ...baseSettings, daily_summary_enabled:"true", daily_summary_time:"23:00", quiet_hours_enabled:"true" };
  const { notifications } = planNotifications([habit({reminderTimes:[]})], s, [], TODAY);
  eq("summary dropped in quiet hours", notifications.length, 0);
  const s2 = { ...baseSettings, daily_summary_enabled:"true", daily_summary_time:"20:00" };
  const late = planNotifications([habit({reminderTimes:[]})], s2, [], TODAY, 21 * 60).notifications;
  eq("summary dropped once its time has passed", late.length, 0);
}

// 11b. past slots today are dropped (reconcile must not re-fire expired ones);
//      future days are untouched.
{
  const h = habit({ reminderTimes: ["09:00", "13:00", "18:00"] });
  const all = planNotifications([h], baseSettings, [], TODAY, 14 * 60 + 30).notifications;
  eq("past today slots dropped (now 14:30)", all.filter((n) => n.dayKey === TODAY).map((n) => n.time), ["18:00"]);
  eq("tomorrow keeps all 3", all.filter((n) => n.dayKey === "2026-10-12").length, 3);
  const noNow = planNotifications([h], baseSettings, [], TODAY).notifications;
  eq("no nowMinutes -> today fully kept", noNow.filter((n) => n.dayKey === TODAY).length, 3);
}

// 12. tone changes copy
{
  const pick = (tone) => planNotifications([habit()], { ...baseSettings, notification_tone: tone }, [], TODAY).notifications[0];
  const g = pick("gentle"), n = pick("neutral"), p = pick("push");
  eq("tone affects title", new Set([g.title,n.title,p.title]).size > 1, true);
  eq("tone affects body", new Set([g.body,n.body,p.body]).size > 1, true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
