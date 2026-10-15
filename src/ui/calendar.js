// src/ui/calendar.js — the Calendar screen (UI ADDITION — rendered into the
// existing #screen-today region's sibling; the frozen prototype has no calendar
// markup, so this is built from the design's glass tokens).
//
// Three views (segmented control, spec'd order): Month · Week · Year.
//   Month — grid of day cells for one month, each tinted by that day's
//           completion state (perfect / partial / none / future / off).
//   Week  — the 7 days of the week containing the selected day, larger cells
//           with per-day done/scheduled counts.
//   Year  — 12 month blocks; each block's fill = that month's average
//           completion rate, with the month's name + percent.
// Tapping any past/today cell jumps back to Today (spec: calendar is a
// review surface, editing happens on Today).

import * as repo from "../repo.js";
import * as stats from "../stats.js";
import { emit } from "../state.js";
import {
  addDays,
  addMonths,
  formatMonthYear,
  parseKey,
  startOfWeek,
  todayKey,
} from "../date.js";

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

let rootEl = null;
let view = "month"; // 'month' | 'week' | 'year'
let anchorKey = null; // the day the view is centred on
let open = false;

/** Build (once) and mount the screen; hidden until showCalendar(). */
export function initCalendar() {
  rootEl = document.getElementById("screen-calendar");
  if (!rootEl) {
    rootEl = document.createElement("section");
    rootEl.id = "screen-calendar";
    // mirror the Today screen's layout classes so margins/padding match
    const host = document.getElementById("screen-today");
    rootEl.className = `${host.className} hidden`;
    host.parentElement.insertBefore(rootEl, host.nextSibling);
  }
  anchorKey = todayKey();
}

export function isCalendarOpen() {
  return open;
}

export async function showCalendar() {
  if (!rootEl) initCalendar();
  open = true;
  rootEl.classList.remove("hidden");
  document.getElementById("screen-today").classList.add("hidden");
  anchorKey = anchorKey || todayKey();
  await render();
}

export function hideCalendar() {
  open = false;
  if (rootEl) rootEl.classList.add("hidden");
  document.getElementById("screen-today").classList.remove("hidden");
}

/** re-render the visible view after repo data changes (no-op when hidden) */
export async function refreshCalendar() {
  if (!open || !rootEl) return;
  await render();
}

export async function calendarBackToToday() {
  view = "month";
  anchorKey = todayKey();
  hideCalendar();
}

// ---------------------------------------------------------------------------
// render
// ---------------------------------------------------------------------------
async function render() {
  const today = todayKey();
  const firstDay = (await repo.getSetting("first_day_of_week")) === "sun" ? 0 : 1;

  rootEl.textContent = "";

  // --- segmented control --------------------------------------------------
  const seg = document.createElement("div");
  seg.className = "cal-seg seg";
  for (const v of ["month", "week", "year"]) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "seg-btn" + (view === v ? " on" : "");
    b.textContent = v[0].toUpperCase() + v.slice(1);
    b.addEventListener("click", () => {
      view = v;
      render();
    });
    seg.appendChild(b);
  }
  rootEl.appendChild(seg);

  // --- header (month/year label + prev/next) ------------------------------
  const head = document.createElement("div");
  head.className = "cal-head";
  const prev = arrow("chevron_left", () => {
    if (view === "month") anchorKey = addMonths(anchorKey, -1);
    else if (view === "week") anchorKey = addDays(anchorKey, -7);
    else anchorKey = addMonths(anchorKey, -12);
    render();
  });
  const label = document.createElement("p");
  label.className = "font-headline-sm text-headline-sm text-on-surface cal-label";
  label.textContent =
    view === "month"
      ? formatMonthYear(anchorKey)
      : view === "week"
        ? weekLabel(anchorKey, firstDay)
        : String(parseKey(anchorKey).getFullYear());
  const next = arrow("chevron_right", () => {
    if (view === "month") anchorKey = addMonths(anchorKey, 1);
    else if (view === "week") anchorKey = addDays(anchorKey, 7);
    else anchorKey = addMonths(anchorKey, 12);
    render();
  });
  head.appendChild(prev);
  head.appendChild(label);
  head.appendChild(next);
  rootEl.appendChild(head);

  // --- body ---------------------------------------------------------------
  const habits = await repo.getHabits();
  const range = view === "year" ? yearRange(anchorKey) : view === "month" ? monthRange(anchorKey) : weekRange(anchorKey, firstDay);
  const completions = await repo.getCompletions(range);
  const completionsByKey = new Map(completions.map((c) => [`${c.habitId}:${c.date}`, c]));
  const ctx = { today, habits, completions, completionsByKey, firstDay };

  if (view === "month") renderMonth(ctx);
  else if (view === "week") renderWeek(ctx);
  else await renderYear(ctx);
}

function arrow(icon, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "screen-back";
  b.setAttribute("aria-label", icon === "chevron_left" ? "Previous" : "Next");
  b.innerHTML = `<span class="material-symbols-outlined text-[24px]">${icon}</span>`;
  b.addEventListener("click", onClick);
  return b;
}

function weekLabel(key, firstDay) {
  const start = startOfWeek(key, firstDay);
  const end = addDays(start, 6);
  const s = parseKey(start);
  const e = parseKey(end);
  return `${MONTHS_SHORT[s.getMonth()]} ${s.getDate()} – ${MONTHS_SHORT[e.getMonth()]} ${e.getDate()}`;
}

// --- Month -----------------------------------------------------------------
function renderMonth(ctx) {
  const grid = document.createElement("div");
  grid.className = "cal-month";

  // weekday letter row
  for (let i = 0; i < 7; i++) {
    const d = document.createElement("div");
    d.className = "cal-dow font-label-sm text-label-sm text-on-surface-variant";
    d.textContent = DOW_LETTERS[(ctx.firstDay + i) % 7];
    grid.appendChild(d);
  }

  const first = startOfWeek(monthStartKey(anchorKey), ctx.firstDay);
  for (let i = 0; i < 42; i++) {
    grid.appendChild(dayCell(addDays(first, i), ctx, "month"));
  }
  rootEl.appendChild(grid);
  rootEl.appendChild(legend());
}

// --- Week ------------------------------------------------------------------
function renderWeek(ctx) {
  const wrap = document.createElement("div");
  wrap.className = "cal-week";
  const start = startOfWeek(anchorKey, ctx.firstDay);
  for (let i = 0; i < 7; i++) {
    wrap.appendChild(dayCell(addDays(start, i), ctx, "week"));
  }
  rootEl.appendChild(wrap);
  rootEl.appendChild(legend());
}

function dayCell(key, ctx, size) {
  const cell = document.createElement("button");
  cell.type = "button";
  const inMonth = key.slice(0, 7) === anchorKey.slice(0, 7) || size === "week";
  const st = stats.dayCompletionState(ctx.habits, ctx.completionsByKey, key);
  const future = key > ctx.today;
  const isToday = key === ctx.today;

  cell.className = `cal-day cal-day-${size}`;
  if (!inMonth) cell.classList.add("out");
  if (future) cell.classList.add("future");
  if (isToday) cell.classList.add("today");

  const num = document.createElement("span");
  num.className = "cal-num font-body-sm text-body-sm";
  num.textContent = String(parseKey(key).getDate());
  cell.appendChild(num);

  const dot = document.createElement("span");
  dot.className = `cal-dot state-${future ? "future" : st}`;
  if (size === "week") {
    const scheduled = stats.scheduledHabits(ctx.habits, key);
    let done = 0;
    for (const h of scheduled) {
      const c = ctx.completionsByKey.get(`${h.id}:${key}`);
      if (c && c.status === "done") done += 1;
    }
    num.textContent = `${MONTHS_SHORT[parseKey(key).getMonth()]} ${parseKey(key).getDate()}`;
    const counts = document.createElement("span");
    counts.className = "cal-counts font-body-sm text-body-sm text-on-surface-variant";
    counts.textContent = scheduled.length ? `${done} / ${scheduled.length} done` : "nothing scheduled";
    cell.appendChild(counts);
  }
  cell.appendChild(dot);

  if (!future) {
    cell.addEventListener("click", () => {
      // spec: past/today review -> jump to Today screen
      emit("navigate", { screen: "today", focusDate: key });
    });
  } else {
    cell.disabled = true;
  }
  return cell;
}

// --- Year ------------------------------------------------------------------
async function renderYear(ctx) {
  const year = parseKey(anchorKey).getFullYear();
  const wrap = document.createElement("div");
  wrap.className = "cal-year";
  for (let m = 0; m < 12; m++) {
    const monthKey = `${year}-${String(m + 1).padStart(2, "0")}-01`;
    const range = monthRange(monthKey);
    const comps = await repo.getCompletions(range);
    const byKey = new Map(comps.map((c) => [`${c.habitId}:${c.date}`, c]));

    let scheduled = 0;
    let done = 0;
    const daysInMonth = new Date(year, m + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (key > ctx.today) break;
      for (const h of ctx.habits) {
        if (!stats.isScheduled(h, key)) continue;
        const c = byKey.get(`${h.id}:${key}`);
        if (c && c.status === "skipped") continue;
        if (key === ctx.today && !c) continue;
        scheduled += 1;
        if (c && c.status === "done") done += 1;
      }
    }
    const pct = scheduled ? Math.round((done / scheduled) * 100) : 0;
    const block = document.createElement("button");
    block.type = "button";
    block.className = "cal-month-block";
    block.style.setProperty("--fill", `${Math.max(pct, 4)}%`);
    if (!scheduled) block.classList.add("empty");
    block.innerHTML = `<span class="font-label-lg text-label-lg ${pct >= 60 ? "cal-fill-text" : "text-on-surface"}">${MONTHS_SHORT[m]}</span><span class="font-body-sm text-body-sm text-on-surface-variant">${scheduled ? pct + "%" : "—"}</span>`;
    block.addEventListener("click", () => {
      view = "month";
      anchorKey = monthKey;
      render();
    });
    wrap.appendChild(block);
  }
  rootEl.appendChild(wrap);
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function monthStartKey(key) {
  return key.slice(0, 8) + "01";
}

function monthRange(key) {
  const start = monthStartKey(key);
  const y = Number(start.slice(0, 4));
  const m = Number(start.slice(5, 7));
  const daysInMonth = new Date(y, m, 0).getDate();
  return { start, end: `${y}-${String(m).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}` };
}

function weekRange(key, firstDay) {
  const start = startOfWeek(key, firstDay);
  return { start, end: addDays(start, 6) };
}

function yearRange(key) {
  const y = key.slice(0, 4);
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}

function legend() {
  const l = document.createElement("div");
  l.className = "cal-legend font-body-sm text-body-sm text-on-surface-variant";
  l.innerHTML = `<span><i class="cal-dot state-perfect"></i>perfect</span><span><i class="cal-dot state-partial"></i>partial</span><span><i class="cal-dot state-none"></i>none</span><span><i class="cal-dot state-future"></i>upcoming</span>`;
  return l;
}
