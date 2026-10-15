// src/date.js — LOCAL date helpers.
// ABSOLUTE RULE from spec: day keys are LOCAL 'YYYY-MM-DD' strings.
// Never use toISOString() (it shifts to UTC and corrupts "today" near midnight).

/** @returns {string} 'YYYY-MM-DD' for the given Date (default: now) in local time */
export function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Local timestamp WITHOUT timezone suffix ('YYYY-MM-DDTHH:MM:SS').
 *  Safe to slice(0,10) for a local day key — unlike toISOString(). */
export function localTimestamp(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function todayKey() {
  return dateKey(new Date());
}

/** 'YYYY-MM-DD' -> local Date at midnight */
export function parseKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** shift a day key by n days (also accepts Date) */
export function addDays(keyOrDate, n) {
  const d = typeof keyOrDate === "string" ? parseKey(keyOrDate) : new Date(keyOrDate);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

export function addMonths(key, n) {
  const d = parseKey(key);
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  return dateKey(d);
}

/** 0 = Sunday .. 6 = Saturday (JS getDay convention) */
export function weekdayIndex(keyOrDate) {
  const d = typeof keyOrDate === "string" ? parseKey(keyOrDate) : keyOrDate;
  return d.getDay();
}

/** firstDay: 0 (Sun) .. 6 (Sat). Returns key of that week's first day. */
export function startOfWeek(key, firstDay = 1) {
  const d = parseKey(key);
  const diff = (d.getDay() - firstDay + 7) % 7;
  d.setDate(d.getDate() - diff);
  return dateKey(d);
}

export function startOfMonth(key) {
  const d = parseKey(key);
  d.setDate(1);
  return dateKey(d);
}

/** whole days from a to b (b - a) */
export function daysBetween(a, b) {
  return Math.round((parseKey(b) - parseKey(a)) / 86400000);
}

export function isSameKey(a, b) {
  return a === b;
}

export function isFuture(key) {
  return daysBetween(todayKey(), key) > 0;
}

export const DAY_LETTERS_SUN = ["S", "M", "T", "W", "T", "F", "S"];

/** 'HH:MM' (24h) -> minutes since midnight; null if invalid */
export function timeToMinutes(hhmm) {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/** 'HH:MM' -> 'h:mm AM/PM' for the "At 3:30 PM" cue label */
export function formatTime12(hhmm) {
  const mins = timeToMinutes(hhmm);
  if (mins == null) return "";
  const h24 = Math.floor(mins / 60);
  const m = String(mins % 60).padStart(2, "0");
  const ampm = h24 >= 12 ? "PM" : "AM";
  let h = h24 % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** 'Wednesday, Oct 24' — matches the prototype's date line */
export function formatFriendly(key) {
  const d = parseKey(key);
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function formatMonthYear(key) {
  const d = parseKey(key);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function monthShort(key) {
  return MONTHS[parseKey(key).getMonth()];
}

export function dayOfMonth(key) {
  return parseKey(key).getDate();
}

/** Good morning / afternoon / evening by local hour */
export function greetingForHour(hour = new Date().getHours()) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** ms until next local midnight (+ small buffer) */
export function msUntilNextDay(from = new Date()) {
  const next = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1, 0, 0, 1, 0);
  return next - from;
}
