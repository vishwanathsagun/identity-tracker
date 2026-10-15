// src/ui/today.js — the Today screen, fully data-driven.
// Renders (from repo): date line, greeting, week strip, hero vote ring,
// Morning/Afternoon/Evening sections with cloned prototype cards, counts,
// perfect-day celebration, never-miss-twice nudge, and the
// toggle / swipe / long-press interactions.

import * as repo from "../repo.js";
import { on, emit } from "../state.js";
import {
  addDays,
  dateKey,
  formatFriendly,
  greetingForHour,
  parseKey,
  startOfWeek,
  todayKey,
  weekdayIndex,
} from "../date.js";
import * as stats from "../stats.js";
import { attachNudge, captureTemplates, createStardust, accentGlow, renderCard, springOrb, applyCompletedVisuals } from "./habit-card.js";
import { showSheet, sheetItem, sheetPrimaryButton, sheetGhostButton, closeTopSheet, anySheetOpen } from "./sheets.js";
import { hapticCheck, hapticTab, hapticUncheck, hapticPerfectDay } from "../haptics.js";

const CIRCUMFERENCE = 251.2;
const SKIP_REASONS = ["Busy day", "Not feeling it", "Traveling", "Sick", "Rest day"];

let lastDayKey = "";
let lastHabitsSignature = "";
let skipNextFullRender = false;
let celebratedForDay = "";

// ---------------------------------------------------------------------------
// boot / render
// ---------------------------------------------------------------------------
export async function renderToday(force = false) {
  const today = todayKey();
  const [habits, settings] = await Promise.all([repo.getHabits(), repo.getSettings()]);

  // capture templates from the ORIGINAL demo cards exactly once
  if (!document.getElementById("today-date").dataset.bound) {
    captureTemplates();
    document.getElementById("today-date").dataset.bound = "1";
  }

  const completions = await repo.getCompletions({ start: earliestCreatedKey(habits), end: today });
  const completionsByKey = new Map(completions.map((c) => [`${c.habitId}:${c.date}`, c]));
  const byHabit = new Map(habits.map((h) => [h.id, []]));
  for (const c of completions) byHabit.get(c.habitId)?.push(c);

  const ctx = { today, habits, settings, completions, completionsByKey, byHabit };
  const signature = habitSignature(habits, completionsByKey, today);
  const dayChanged = today !== lastDayKey;
  if (!force && !dayChanged && signature === lastHabitsSignature) return ctx;

  renderHeader(ctx);
  renderWeekStrip(ctx);
  renderHero(ctx);
  renderSections(ctx);

  lastDayKey = today;
  lastHabitsSignature = signature;
  return ctx;
}

function earliestCreatedKey(habits) {
  let min = todayKey();
  for (const h of habits) {
    const k = h.createdAt ? h.createdAt.slice(0, 10) : todayKey();
    if (k < min) min = k;
  }
  return min;
}

function habitSignature(habits, completionsByKey, today) {
  return habits.map((h) => `${h.id}:${h.archivedAt ? "a" : "v"}`).join(",") + "|" + habitStateSignature(completionsByKey, today);
}

function habitStateSignature(completionsByKey, today) {
  const parts = [];
  for (let back = 14; back >= 0; back--) {
    const key = addDays(today, -back);
    for (const [k, c] of completionsByKey) {
      if (k.endsWith(":" + key)) parts.push(`${k}=${c.status}`);
    }
  }
  return parts.sort().join(",");
}

// ---------------------------------------------------------------------------
// header (date + greeting)
// ---------------------------------------------------------------------------
function renderHeader(ctx) {
  document.getElementById("today-date").textContent = formatFriendly(ctx.today);
  const name = ctx.settings.display_name || "";
  document.getElementById("greeting").textContent = `${greetingForHour()}${name ? ", " + name : ""}`;
}

// ---------------------------------------------------------------------------
// week strip (cloned from the prototype's cells)
// ---------------------------------------------------------------------------
function renderWeekStrip(ctx) {
  const strip = document.getElementById("week-strip");
  const firstDay = ctx.settings.first_day_of_week === "sun" ? 0 : 1;
  const weekStart = startOfWeek(ctx.today, firstDay);

  // template cells captured from the demo strip (design-frozen clones)
  if (!strip.dataset.templates) {
    const cells = [...strip.children];
    strip.dataset.templates = "1";
    strip._tpl = {
      perfect: cells[0], // M 22 — peach dot
      partial: cells[1], // T 23 — mauve dot
      today: cells[2], // active pill
      future: cells[3], // opacity-60 gray dot
    };
    // a past day with nothing done: gray dot without the "future" dimming
    const noneCell = cells[3].cloneNode(true);
    noneCell.classList.remove("opacity-60");
    strip._tpl.none = noneCell;
  }
  const letters = ["S", "M", "T", "W", "T", "F", "S"];

  strip.textContent = "";
  for (let i = 0; i < 7; i++) {
    const key = addDays(weekStart, i);
    const dow = weekdayIndex(key);
    let cell;
    if (key === ctx.today) {
      cell = strip._tpl.today.cloneNode(true);
    } else if (key > ctx.today) {
      cell = strip._tpl.future.cloneNode(true);
    } else {
      const state = stats.dayCompletionState(ctx.habits, ctx.completionsByKey, key);
      cell = (state === "perfect" ? strip._tpl.perfect : state === "partial" ? strip._tpl.partial : strip._tpl.none).cloneNode(true);
    }
    const spans = cell.querySelectorAll("span");
    spans[0].textContent = letters[dow];
    spans[1].textContent = String(parseKey(key).getDate());
    strip.appendChild(cell);
  }
}

// ---------------------------------------------------------------------------
// hero ring
// ---------------------------------------------------------------------------
function scheduledToday(ctx) {
  return stats.scheduledHabits(ctx.habits, ctx.today);
}

function isDone(ctx, habitId, key = ctx.today) {
  const c = ctx.completionsByKey.get(`${habitId}:${key}`);
  return c && c.status === "done";
}

function renderHero(ctx) {
  const scheduled = scheduledToday(ctx);
  const done = scheduled.filter((h) => isDone(ctx, h.id)).length;
  const total = scheduled.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  document.getElementById("votes-tally").textContent = String(done);
  document.getElementById("votes-total").textContent = ` / ${total}`;
  document.getElementById("votes-msg").textContent = `${done} small vote${done === 1 ? "" : "s"}`;
  document.getElementById("hero-percentage").textContent = `${pct}%`;
  const offset = CIRCUMFERENCE - (CIRCUMFERENCE * pct) / 100;
  document.getElementById("hero-progress-stroke").style.strokeDashoffset = String(offset);
}

// ---------------------------------------------------------------------------
// sections + cards
// ---------------------------------------------------------------------------
function renderSections(ctx) {
  const scheduled = scheduledToday(ctx);
  const emptyState = document.getElementById("empty-state");
  if (!scheduled.length) {
    for (const g of stats.GROUPS) document.getElementById(`section-${g.key}`).style.display = "none";
    if (!emptyState) attachEmptyState();
    document.getElementById("empty-state").style.display = "";
    return;
  }
  if (emptyState) emptyState.style.display = "none";

  const groups = { morning: [], afternoon: [], evening: [] };
  for (const h of scheduled) groups[stats.groupForHabit(h)].push(h);

  for (const g of stats.GROUPS) {
    const section = document.getElementById(`section-${g.key}`);
    const habits = groups[g.key];
    const doneCount = habits.filter((h) => isDone(ctx, h.id)).length;
    section.style.display = "";
    document.getElementById(g.countId).textContent = `${doneCount} of ${habits.length} ${g.tail}`;

    // replace cards; keep the section header row intact
    section.querySelectorAll(".habit-card").forEach((c) => c.remove());
    for (const habit of habits) {
      const completion = ctx.completionsByKey.get(`${habit.id}:${ctx.today}`);
      const chip = stats.consistencyChip(habit, ctx.byHabit.get(habit.id) || [], ctx.today);
      const card = renderCard(habit, {
        completed: completion?.status === "done",
        chip,
        nudge: stats.needsNudge(habit, ctx.byHabit.get(habit.id) || [], ctx.today),
      });
      wireCard(ctx, card, habit);
      if (card.getAttribute("data-nudge") === "true") attachNudge(card);
      section.appendChild(card);
    }
  }
}

/** empty state (UI ADDITION — glass card built from existing tokens) */
function attachEmptyState() {
  const el = document.createElement("div");
  el.id = "empty-state";
  el.className =
    "empty-state flex flex-col items-center text-center gap-space-md p-6 rounded-3xl bg-surface-container-high/50 border border-[#935073]/30 backdrop-blur-2xl shadow-lg";
  el.innerHTML = `
    <div class="w-12 h-12 rounded-2xl bg-[#935073]/20 border border-[#935073]/30 flex items-center justify-center text-[#F6DBC0]">
      <span class="material-symbols-outlined text-[24px]">auto_awesome</span>
    </div>
    <p class="font-headline-sm text-headline-sm text-on-surface">No votes scheduled today</p>
    <p class="font-body-sm text-body-sm text-on-surface-variant">Add a habit with the + button and every vote from here counts for the person you are becoming.</p>`;
  const hero = document.getElementById("hero-card");
  hero.parentElement.insertBefore(el, hero.nextSibling);
}

// ---------------------------------------------------------------------------
// interactions: tap / swipe / long-press
// ---------------------------------------------------------------------------
function wireCard(ctx, card, habit) {
  const btn = card.querySelector(".orb-toggle");
  const id = habit.id;

  const toggle = (evt) => {
    if (evt) evt.stopPropagation();
    springOrb(btn);
    const completed = card.getAttribute("data-completed") === "true";
    const rect = btn.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    if (!completed) {
      createStardust(centerX, centerY, accentGlow(habit.colorKey));
      hapticCheck();
      skipNextFullRender = true;
      repo.setCompletion(id, ctx.today, "done").then(() => {
        applyCompletedVisuals(card, true);
        refreshSummary();
        maybePerfectDay(ctx);
      });
    } else {
      hapticUncheck();
      skipNextFullRender = true;
      repo.setCompletion(id, ctx.today, null).then(() => {
        applyCompletedVisuals(card, false);
        refreshSummary();
      });
    }
  };

  btn.addEventListener("click", toggle);
  attachGestures(card, {
    onTap: () => emit("navigate", { screen: "habit-detail", habitId: id }),
    onSwipeRight: () => {
      if (card.getAttribute("data-completed") === "true") return;
      springOrb(btn);
      const rect = btn.getBoundingClientRect();
      createStardust(rect.left + rect.width / 2, rect.top + rect.height / 2, accentGlow(habit.colorKey));
      hapticCheck();
      skipNextFullRender = true;
      repo.setCompletion(id, ctx.today, "done").then(() => {
        applyCompletedVisuals(card, true);
        refreshSummary();
        maybePerfectDay(ctx);
      });
    },
    onSwipeLeft: () => openSkipSheet(ctx, habit, card),
    onLongPress: () => openQuickActions(ctx, habit, card),
  });
}

/** generic gesture layer: horizontal swipe + long-press + tap */
function attachGestures(el, { onTap, onSwipeRight, onSwipeLeft, onLongPress }) {
  let startX = 0,
    startY = 0,
    dx = 0,
    swiping = false,
    longTimer = null,
    longFired = false,
    onOrb = false;

  el.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    onOrb = !!(e.target.closest && e.target.closest(".orb-toggle"));
    startX = e.clientX;
    startY = e.clientY;
    dx = 0;
    swiping = false;
    longFired = false;
    clearTimeout(longTimer);
    longTimer = setTimeout(() => {
      if (!swiping) {
        longFired = true;
        onLongPress && onLongPress();
      }
    }, 550);
  });

  el.addEventListener("pointermove", (e) => {
    const ddx = e.clientX - startX;
    const ddy = e.clientY - startY;
    if (!swiping && Math.abs(ddx) > 12 && Math.abs(ddx) > Math.abs(ddy) * 1.5) {
      swiping = true;
      clearTimeout(longTimer);
      el.setPointerCapture?.(e.pointerId);
      el.classList.add("card-swiping");
    }
    if (swiping) {
      dx = Math.max(-120, Math.min(120, ddx));
      el.style.transform = `translateX(${dx}px)`;
      e.preventDefault();
    } else if (Math.abs(ddx) > 8 || Math.abs(ddy) > 8) {
      clearTimeout(longTimer);
    }
  });

  const finish = () => {
    clearTimeout(longTimer);
    if (swiping) {
      el.classList.remove("card-swiping");
      el.classList.add("settling");
      el.style.transform = "";
      setTimeout(() => el.classList.remove("settling"), 320);
      if (dx > 64) onSwipeRight && onSwipeRight();
      else if (dx < -64) onSwipeLeft && onSwipeLeft();
      swiping = false;
    } else if (!longFired && !onOrb && onTap) {
      onTap(); // card body tap -> habit detail (orb taps only toggle)
    }
  };
  el.addEventListener("pointerup", finish);
  el.addEventListener("pointercancel", finish);
  el.addEventListener("lostpointercapture", finish);

  // prevent text selection while swiping
  el.addEventListener("dragstart", (e) => e.preventDefault());
}

// ---------------------------------------------------------------------------
// summary refresh (hero + counts + strip) without rebuilding cards
// ---------------------------------------------------------------------------
async function refreshSummary() {
  const today = todayKey();
  const habits = await repo.getHabits();
  const completions = await repo.getCompletions({ start: earliestCreatedKey(habits), end: today });
  const completionsByKey = new Map(completions.map((c) => [`${c.habitId}:${c.date}`, c]));
  const byHabit = new Map(habits.map((h) => [h.id, []]));
  for (const c of completions) byHabit.get(c.habitId)?.push(c);
  const ctx = {
    today,
    habits,
    settings: await repo.getSettings(),
    completions,
    completionsByKey,
    byHabit,
  };
  renderHero(ctx);
  renderWeekStrip(ctx);
  // counts follow the live DOM cards
  for (const g of stats.GROUPS) {
    const section = document.getElementById(`section-${g.key}`);
    const cards = [...section.querySelectorAll(".habit-card")];
    const done = cards.filter((c) => c.dataset.completed === "true").length;
    document.getElementById(g.countId).textContent = `${done} of ${cards.length} ${g.tail}`;
  }
  lastHabitsSignature = habitSignature(habits, completionsByKey, today);
  return ctx;
}

// ---------------------------------------------------------------------------
// perfect-day celebration (only when ALL scheduled habits are done)
// ---------------------------------------------------------------------------
function maybePerfectDay(ctx) {
  const scheduled = scheduledToday(ctx);
  if (!scheduled.length) return;
  const allDone = scheduled.every((h) => document.querySelector(`.habit-card[data-id="${h.id}"]`)?.dataset.completed === "true");
  if (allDone && celebratedForDay !== ctx.today) {
    celebratedForDay = ctx.today;
    hapticPerfectDay();
    const ring = document.getElementById("hero-progress-stroke").getBoundingClientRect();
    const x = ring.left + ring.width / 2;
    const y = ring.top + ring.height / 2;
    createStardust(x, y, "#F6DBC0");
    setTimeout(() => createStardust(x, y, "#ffafd5"), 120);
    setTimeout(() => createStardust(x, y, "#935073"), 240);
  }
}

// ---------------------------------------------------------------------------
// sheets: skip-with-reason + quick actions + note
// ---------------------------------------------------------------------------
function openSkipSheet(ctx, habit, card) {
  const applySkip = (reason) => {
    closeTopSheet();
    skipNextFullRender = true;
    repo.setCompletion(habit.id, ctx.today, "skipped", reason).then(() => {
      // card visuals must follow: refreshSummary() counts from the DOM
      if (card && card.isConnected) {
        card.dataset.completed = "false";
        applyCompletedVisuals(card, false);
      }
      refreshSummary();
    });
  };
  showSheet({
    title: "Why skip this vote?",
    build(body) {
      for (const reason of SKIP_REASONS) {
        body.appendChild(
          sheetItem({
            label: reason,
            icon: "check",
            onClick: () => applySkip(reason),
          })
        );
      }
      body.appendChild(sheetGhostButton("Skip without a reason", () => applySkip(null)));
    },
  });
}

function openQuickActions(ctx, habit, card) {
  hapticTab();
  showSheet({
    title: habit.name,
    build(body, api) {
      const done = card.getAttribute("data-completed") === "true";
      body.appendChild(
        sheetItem({
          label: done ? "Mark as not done" : "Mark as done",
          icon: done ? "undo" : "check_circle",
          onClick: () => {
            api.close();
            card.querySelector(".orb-toggle").click();
          },
        })
      );
      body.appendChild(
        sheetItem({
          label: "Skip with a reason",
          icon: "skip_next",
          onClick: () => {
            api.close();
            openSkipSheet(ctx, habit, card);
          },
        })
      );
      body.appendChild(
        sheetItem({
          label: "Add a note",
          icon: "edit_note",
          onClick: () => {
            api.close();
            openNoteSheet(ctx, habit);
          },
        })
      );
      body.appendChild(
        sheetItem({
          label: "Edit habit",
          icon: "settings",
          onClick: () => {
            api.close();
            emit("navigate", { screen: "new-habit", habitId: habit.id }); // stepper arrives in Step 3
          },
        })
      );
      body.appendChild(sheetGhostButton("Cancel", () => api.close()));
    },
  });
}

function openNoteSheet(ctx, habit) {
  showSheet({
    title: `Note · ${habit.name}`,
    build(body, api) {
      const ta = document.createElement("textarea");
      ta.className = "sheet-note";
      ta.placeholder = "How did it go?";
      ta.rows = 4;
      body.appendChild(ta);
      setTimeout(() => ta.focus(), 350);
      body.appendChild(
        sheetPrimaryButton("Save note", () => {
          repo.saveNote({ habitId: habit.id, date: ctx.today, text: ta.value });
          api.close();
          emit("toast", "Note saved");
        })
      );
      body.appendChild(sheetGhostButton("Cancel", () => api.close()));
    },
  });
}

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------
export async function initToday() {
  await renderToday(true);
  // repo data changes -> re-render (unless the change came from this screen's
  // own in-place toggle, which already updated the summary)
  on("change", ({ entity }) => {
    if (skipNextFullRender) {
      skipNextFullRender = false;
      return;
    }
    if (entity === "notes") return; // notes don't affect Today visuals
    renderToday(true).catch((e) => console.error("[today] render failed", e));
  });
  // midnight rollover / resume
  const checkDay = () => {
    if (todayKey() !== lastDayKey) {
      renderToday(true).catch((e) => console.error("[today] day-rollover render failed", e));
    }
  };
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) checkDay();
  });
  setInterval(checkDay, 30 * 1000);
}

export { closeTopSheet, anySheetOpen, dateKey };
