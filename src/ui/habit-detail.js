// src/ui/habit-detail.js — Habit detail screen (UI ADDITION — full-screen
// glass overlay). Shows the habit's identity line, stat tiles, a 4-week
// calendar heatmap (per-day states from stats.habitDayState), weekly rollup,
// notes, and Edit / Archive actions that route into the stepper.

import * as repo from "../repo.js";
import * as stats from "../stats.js";
import { emit, on } from "../state.js";
import { addDays, formatFriendly, formatTime12, todayKey } from "../date.js";
import { openScreen } from "./screens.js";
import { openStepper } from "./stepper.js";
import { hapticTab } from "../haptics.js";

const ACCENT_HEX = { peach: "#F6DBC0", mauve: "#935073", plum: "#ffafd5" };
const DAY_STATE_CLASS = {
  done: "cal-done",
  skipped: "cal-skip",
  missed: "cal-miss",
  pending: "cal-pending",
  unscheduled: "cal-off",
};

export function openHabitDetail(habitId) {
  let offChange = null;
  let refreshing = false;

  const screen = openScreen({
    id: "habit-detail",
    title: "Habit",
    build(body, api) {
      refresh(body, api).catch((e) => console.error("[detail] render failed", e));
      // live-refresh when repo data changes while this screen is open
      offChange = on("change", async () => {
        if (refreshing || !api.el.isConnected) return;
        refreshing = true;
        try {
          await refresh(body, api);
        } catch (e) {
          console.error("[detail] refresh failed", e);
        } finally {
          refreshing = false;
        }
      });
    },
  });

  // stop listening once the overlay is gone (its removal is async)
  const poll = setInterval(() => {
    if (!screen.el.isConnected) {
      clearInterval(poll);
      offChange && offChange();
    }
  }, 1000);

  async function refresh(body, api) {
    const habit = await repo.getHabit(habitId);
    if (!habit) {
      emit("toast", "Habit not found");
      api.close();
      return;
    }
    const today = todayKey();
    const createdKey = habit.createdAt ? habit.createdAt.slice(0, 10) : today;
    const completions = await repo.getCompletions({ start: createdKey, end: today }, habitId);
    const notes = await repo.getNotes(habitId);
    const titleEl = screen.el.querySelector(".screen-title");
    if (titleEl) titleEl.textContent = habit.name;
    renderBody(body, api, habit, completions, notes);
  }
}

function renderBody(body, api, habit, completions, notes) {
  const today = todayKey();
  body.textContent = "";
  body.classList.add("detail-body");

  // --- identity line -------------------------------------------------------
  const head = document.createElement("div");
  head.className = "detail-head";
  const orb = document.createElement("div");
  orb.className = "detail-orb";
  orb.style.background = habit.colorKey === "mauve" ? "#935073" : habit.colorKey === "plum" ? "#502D55" : "linear-gradient(135deg, #935073, #F6DBC0)";
  orb.innerHTML = `<span class="material-symbols-outlined text-[24px]" style="color:${habit.colorKey === "peach" ? "#1c0e22" : "#F6DBC0"}">${habit.icon}</span>`;
  head.appendChild(orb);
  const headText = document.createElement("div");
  headText.className = "flex flex-col gap-0.5";
  const hname = document.createElement("p");
  hname.className = "font-headline-sm text-headline-sm text-on-surface";
  hname.textContent = habit.name;
  headText.appendChild(hname);
  const cueLine = document.createElement("p");
  cueLine.className = "font-body-sm text-body-sm text-on-surface-variant";
  const cueBits = [];
  if (habit.cueTime) cueBits.push(formatTime12(habit.cueTime));
  if (habit.cuePlace) cueBits.push(habit.cuePlace);
  if (habit.stackAnchor) cueBits.unshift(habit.stackAnchor);
  cueLine.textContent = cueBits.join(" · ") || "No cue set";
  headText.appendChild(cueLine);
  if (habit.twoMinVersion) {
    const twoMin = document.createElement("p");
    twoMin.className = "font-body-sm text-body-sm mt-1";
    twoMin.style.color = ACCENT_HEX[habit.colorKey] || "#F6DBC0";
    twoMin.textContent = `2-min: ${habit.twoMinVersion}`;
    headText.appendChild(twoMin);
  }
  head.appendChild(headText);
  body.appendChild(head);

  // --- stat tiles ----------------------------------------------------------
  const score = stats.consistencyScore(habit, completions, today);
  const run = stats.currentRun(habit, completions, today);
  const best = stats.bestRun(habit, completions, today);
  const votes = stats.totalVotes(completions);
  const rate = stats.completionRate(habit, completions, today);
  const level = stats.levelForVotes(votes);

  const tiles = document.createElement("div");
  tiles.className = "stat-grid";
  tiles.appendChild(tile(`${Math.round(score)}%`, "consistency"));
  tiles.appendChild(tile(String(run), run === 1 ? "day run" : "day run"));
  tiles.appendChild(tile(String(best), "best run"));
  tiles.appendChild(tile(String(votes), "votes"));
  body.appendChild(tiles);

  const levelRow = document.createElement("div");
  levelRow.className = "level-row";
  levelRow.innerHTML = `<span class="font-label-md text-label-md text-on-surface-variant">Level</span><span class="font-label-lg text-label-lg" style="color:${ACCENT_HEX[habit.colorKey] || "#F6DBC0"}">${level.current.name}${level.next ? ` — ${level.next.min - votes} votes to ${level.next.name}` : " — max level"}</span>`;
  body.appendChild(levelRow);

  const rateRow = document.createElement("div");
  rateRow.className = "level-row";
  rateRow.innerHTML = `<span class="font-label-md text-label-md text-on-surface-variant">Completion rate</span><span class="font-label-lg text-label-lg text-on-surface">${Math.round(rate)}%</span>`;
  body.appendChild(rateRow);

  // --- 4-week heatmap ------------------------------------------------------
  const calTitle = document.createElement("p");
  calTitle.className = "pick-label font-label-md text-label-md text-on-surface-variant mt-5 mb-2";
  calTitle.textContent = "LAST 4 WEEKS";
  body.appendChild(calTitle);

  const cal = document.createElement("div");
  cal.className = "detail-cal";
  for (let back = 27; back >= 0; back--) {
    const key = addDays(today, -back);
    const st = stats.habitDayState(habit, completions, key, today);
    const cell = document.createElement("div");
    cell.className = "cal-cell " + (DAY_STATE_CLASS[st] || "");
    cell.title = `${formatFriendly(key)} — ${st}`;
    cal.appendChild(cell);
  }
  body.appendChild(cal);

  const legend = document.createElement("div");
  legend.className = "cal-legend font-body-sm text-body-sm text-on-surface-variant";
  legend.innerHTML = `<span><i class="cal-cell cal-done"></i>done</span><span><i class="cal-cell cal-skip"></i>skipped</span><span><i class="cal-cell cal-miss"></i>missed</span><span><i class="cal-cell cal-off"></i>off</span>`;
  body.appendChild(legend);

  // --- weekly rollup -------------------------------------------------------
  const wkTitle = document.createElement("p");
  wkTitle.className = "pick-label font-label-md text-label-md text-on-surface-variant mt-5 mb-2";
  wkTitle.textContent = "WEEKLY ROLLUP";
  body.appendChild(wkTitle);
  const roll = stats.weeklyRollup(habit, completions, today, 4);
  roll.forEach((w, i) => {
    const row = document.createElement("div");
    row.className = "rollup-row";
    const pct = w.scheduled ? Math.round((w.done / w.scheduled) * 100) : 0;
    row.innerHTML = `<span class="font-body-sm text-body-sm text-on-surface">${i === 0 ? "This week" : i === 1 ? "Last week" : `${i + 1} weeks ago`}</span><span class="font-body-sm text-body-sm text-on-surface-variant">${w.done} / ${w.scheduled} · ${pct}%${w.skipped ? ` · ${w.skipped} skipped` : ""}</span>`;
    body.appendChild(row);
  });

  // --- notes ---------------------------------------------------------------
  if (notes.length) {
    const nTitle = document.createElement("p");
    nTitle.className = "pick-label font-label-md text-label-md text-on-surface-variant mt-5 mb-2";
    nTitle.textContent = "NOTES";
    body.appendChild(nTitle);
    for (const n of notes.slice(-5).reverse()) {
      const card = document.createElement("div");
      card.className = "note-card";
      card.innerHTML = `<p class="font-body-sm text-body-sm text-on-surface">${escapeHtml(n.text)}</p><p class="font-body-sm text-body-sm text-on-surface-variant mt-1">${n.date ? formatFriendly(n.date.slice(0, 10)) : ""}</p>`;
      body.appendChild(card);
    }
  }

  // --- actions -------------------------------------------------------------
  const actions = document.createElement("div");
  actions.className = "stepper-nav mt-6";
  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "flex-1 min-h-[48px] rounded-full bg-[#F6DBC0] text-[#1c0e22] font-label-lg text-label-lg font-semibold shadow-[0_0_20px_rgba(246,219,192,0.4)] active:scale-95 transition-transform";
  edit.textContent = "Edit habit";
  edit.addEventListener("click", () => {
    hapticTab();
    openStepper(habit); // save fires 'change' -> this screen re-renders above
  });
  actions.appendChild(edit);
  const archive = document.createElement("button");
  archive.type = "button";
  archive.className = "min-h-[48px] px-5 rounded-full border border-[rgba(248,244,233,0.15)] text-on-surface font-label-lg text-label-lg font-semibold active:scale-95 transition-transform";
  archive.textContent = habit.archivedAt ? "Restore" : "Archive";
  archive.addEventListener("click", async () => {
    await repo.archiveHabit(habit.id, !habit.archivedAt);
    emit("toast", habit.archivedAt ? "Habit restored" : "Habit archived");
    api.close();
  });
  actions.appendChild(archive);
  body.appendChild(actions);
}

function tile(value, caption) {
  const t = document.createElement("div");
  t.className = "stat-tile";
  t.innerHTML = `<p class="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">${escapeHtml(String(value))}</p><p class="font-body-sm text-body-sm text-on-surface-variant">${escapeHtml(caption)}</p>`;
  return t;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
