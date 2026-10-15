// src/ui/insights.js — the Insights screen (UI ADDITION — glass tokens).
//
// Sections (spec order):
//   1. Atom View — an SVG radial chart: one "atom" per habit, arranged in a
//      ring, each drawn at a radius/pulse proportional to its consistency
//      score and tinted by its accent. The center shows the level + total
//      votes. Tapping an atom scrolls its habit row into view (and vice versa).
//   2. Level banner — Seed/Spar... level for total votes + progress to next.
//   3. Consistency leaders — every habit sorted by score, with chip copy.
//   4. Weekly rhythm — last 4 weeks done/scheduled across all habits.
//   5. Best runs — top 3 best-run habits.
// Live-refreshes on repo 'change' while visible (same pattern as calendar).

import * as repo from "../repo.js";
import * as stats from "../stats.js";
import { on } from "../state.js";
import { addDays, todayKey } from "../date.js";
import { emit } from "../state.js";

const ACCENT_HEX = { peach: "#F6DBC0", mauve: "#935073", plum: "#ffafd5" };

let rootEl = null;
let open = false;

export function initInsights() {
  rootEl = document.getElementById("screen-insights");
  if (!rootEl) {
    rootEl = document.createElement("section");
    rootEl.id = "screen-insights";
    const host = document.getElementById("screen-today");
    rootEl.className = `${host.className} hidden`;
    host.parentElement.insertBefore(rootEl, host.nextSibling);
  }
  on("change", ({ entity }) => {
    if (open && (entity === "habits" || entity === "completions" || entity === "identities")) refresh();
  });
}

export function isInsightsOpen() {
  return open;
}

export async function showInsights() {
  if (!rootEl) initInsights();
  open = true;
  rootEl.classList.remove("hidden");
  document.getElementById("screen-today").classList.add("hidden");
  await render();
}

export function hideInsights() {
  open = false;
  if (rootEl) rootEl.classList.add("hidden");
  document.getElementById("screen-today").classList.remove("hidden");
}

export async function refresh() {
  if (!open || !rootEl) return;
  await render();
}

// ---------------------------------------------------------------------------
// render
// ---------------------------------------------------------------------------
async function render() {
  const today = todayKey();
  const habits = await repo.getHabits();
  const earliest = earliestKey(habits, today);
  const completions = await repo.getCompletions({ start: earliest, end: today });
  const byHabit = new Map(habits.map((h) => [h.id, []]));
  for (const c of completions) byHabit.get(c.habitId)?.push(c);

  // per-habit enriched rows
  const rows = habits.map((h) => {
    const list = byHabit.get(h.id) || [];
    return {
      habit: h,
      list,
      score: stats.consistencyScore(h, list, today),
      chip: stats.consistencyChip(h, list, today),
      run: stats.currentRun(h, list, today),
      best: stats.bestRun(h, list, today),
      votes: stats.totalVotes(list),
    };
  });
  const totalVotes = rows.reduce((s, r) => s + r.votes, 0);
  const level = stats.levelForVotes(totalVotes);

  rootEl.textContent = "";
  rootEl.appendChild(heading("Insights"));
  rootEl.appendChild(atomView(rows, totalVotes, level));
  rootEl.appendChild(levelBanner(totalVotes, level));
  rootEl.appendChild(leaders(rows));
  rootEl.appendChild(weeklyRhythm(habits, completions, today));
  rootEl.appendChild(bestRuns(rows));
}

function heading(text) {
  const h = document.createElement("h2");
  h.className = "font-headline-lg-mobile text-headline-lg-mobile text-on-surface mt-2 mb-4";
  h.textContent = text;
  return h;
}

function earliestKey(habits, today) {
  let min = today;
  for (const h of habits) {
    const k = h.createdAt ? h.createdAt.slice(0, 10) : today;
    if (k < min) min = k;
  }
  return min;
}

// --- Atom View --------------------------------------------------------------
function atomView(rows, totalVotes, level) {
  const wrap = document.createElement("div");
  wrap.className = "atom-wrap";

  const SIZE = 300;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${SIZE} ${SIZE}`);
  svg.setAttribute("class", "atom-svg");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Atom view of habit consistency");

  // center: level + votes
  const centerG = document.createElementNS(ns, "g");
  const c1 = document.createElementNS(ns, "circle");
  c1.setAttribute("cx", cx);
  c1.setAttribute("cy", cy);
  c1.setAttribute("r", "44");
  c1.setAttribute("class", "atom-nucleus");
  centerG.appendChild(c1);
  const t1 = document.createElementNS(ns, "text");
  t1.setAttribute("x", cx);
  t1.setAttribute("y", cy - 4);
  t1.setAttribute("text-anchor", "middle");
  t1.setAttribute("class", "atom-center-label");
  t1.textContent = level.current.name;
  centerG.appendChild(t1);
  const t2 = document.createElementNS(ns, "text");
  t2.setAttribute("x", cx);
  t2.setAttribute("y", cy + 14);
  t2.setAttribute("text-anchor", "middle");
  t2.setAttribute("class", "atom-center-sub");
  t2.textContent = `${totalVotes} votes`;
  centerG.appendChild(t2);
  svg.appendChild(centerG);

  const n = Math.max(rows.length, 1);
  const baseR = 108;
  rows.forEach((r, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    // radius of the dot scales with consistency; orbit distance is fixed
    const dotR = 7 + (r.score / 100) * 11;
    const x = cx + Math.cos(angle) * baseR;
    const y = cy + Math.sin(angle) * baseR;

    const g = document.createElementNS(ns, "g");
    g.setAttribute("class", "atom-node");
    g.setAttribute("tabindex", "0");
    g.setAttribute("role", "button");
    g.setAttribute("aria-label", `${r.habit.name}: ${Math.round(r.score)}% consistency`);

    const halo = document.createElementNS(ns, "circle");
    halo.setAttribute("cx", x);
    halo.setAttribute("cy", y);
    halo.setAttribute("r", dotR + 5);
    halo.setAttribute("class", "atom-halo");
    halo.style.fill = ACCENT_HEX[r.habit.colorKey] || ACCENT_HEX.peach;
    g.appendChild(halo);

    const c = document.createElementNS(ns, "circle");
    c.setAttribute("cx", x);
    c.setAttribute("cy", y);
    c.setAttribute("r", dotR);
    c.style.fill = ACCENT_HEX[r.habit.colorKey] || ACCENT_HEX.peach;
    g.appendChild(c);

    const label = document.createElementNS(ns, "text");
    label.setAttribute("x", x);
    label.setAttribute("y", y + dotR + 13);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("class", "atom-node-label");
    // short label: first word, capped
    label.textContent = r.habit.name.split(" ")[0].slice(0, 10);
    g.appendChild(label);

    const jump = () => {
      const el = document.getElementById(`insight-habit-${r.habit.id}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("flash");
        setTimeout(() => el.classList.remove("flash"), 900);
      }
    };
    g.addEventListener("click", jump);
    g.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        jump();
      }
    });
    svg.appendChild(g);
  });

  wrap.appendChild(svg);
  return wrap;
}

// --- level banner -----------------------------------------------------------
function levelBanner(totalVotes, level) {
  const box = document.createElement("div");
  box.className = "level-row";
  const pct = level.next ? Math.min(100, Math.round((totalVotes / level.next.min) * 100)) : 100;
  box.innerHTML = `<span class="font-label-md text-label-md text-on-surface-variant">Level</span><span class="font-label-lg text-label-lg" style="color:#F6DBC0">${level.current.name}${level.next ? ` — ${level.next.min - totalVotes} votes to ${level.next.name}` : " — max level"}</span>`;
  const bar = document.createElement("div");
  bar.className = "progress-track";
  bar.innerHTML = `<div class="progress-fill" style="width:${pct}%"></div>`;
  const frag = document.createDocumentFragment();
  frag.appendChild(box);
  frag.appendChild(bar);
  const wrap = document.createElement("div");
  wrap.appendChild(frag);
  return wrap;
}

// --- consistency leaders ----------------------------------------------------
function leaders(rows) {
  const wrap = document.createElement("div");
  wrap.appendChild(sectionTitle("Consistency"));
  const sorted = [...rows].sort((a, b) => b.score - a.score);
  for (const r of sorted) {
    const card = document.createElement("div");
    card.id = `insight-habit-${r.habit.id}`;
    card.className = "rollup-row insight-habit";
    card.innerHTML = `<span class="font-body-md text-body-md text-on-surface"><span class="material-symbols-outlined align-middle text-[18px]" style="color:${ACCENT_HEX[r.habit.colorKey] || "#F6DBC0"}">${r.habit.icon}</span> ${escapeHtml(r.habit.name)}</span><span class="font-body-sm text-body-sm text-on-surface-variant">${r.chip.percent}% · ${r.run}-run · ${r.votes} votes</span>`;
    card.addEventListener("click", () => emit("navigate", { screen: "habit-detail", habitId: r.habit.id }));
    wrap.appendChild(card);
  }
  if (!sorted.length) wrap.appendChild(emptyNote("Add a habit to see consistency here."));
  return wrap;
}

// --- weekly rhythm ----------------------------------------------------------
function weeklyRhythm(habits, completions, today) {
  const wrap = document.createElement("div");
  wrap.appendChild(sectionTitle("Last 4 weeks"));
  const completionsByKey = new Map(completions.map((c) => [`${c.habitId}:${c.date}`, c]));
  const chart = document.createElement("div");
  chart.className = "rhythm-chart";
  for (let w = 3; w >= 0; w--) {
    const end = addDays(today, -7 * w);
    let scheduled = 0;
    let done = 0;
    for (let d = -6; d <= 0; d++) {
      const key = addDays(end, d);
      for (const h of habits) {
        if (!stats.isScheduled(h, key)) continue;
        const c = completionsByKey.get(`${h.id}:${key}`);
        if (c && c.status === "skipped") continue;
        if (key === today && !c) continue;
        scheduled += 1;
        if (c && c.status === "done") done += 1;
      }
    }
    const pct = scheduled ? Math.round((done / scheduled) * 100) : 0;
    const col = document.createElement("div");
    col.className = "rhythm-col";
    col.innerHTML = `<div class="rhythm-bar"><div class="rhythm-fill" style="height:${pct}%"></div></div><span class="font-body-sm text-body-sm text-on-surface-variant">${pct}%</span>`;
    col.title = `${done}/${scheduled} done`;
    chart.appendChild(col);
  }
  wrap.appendChild(chart);
  return wrap;
}

// --- best runs --------------------------------------------------------------
function bestRuns(rows) {
  const wrap = document.createElement("div");
  wrap.appendChild(sectionTitle("Best runs"));
  const sorted = [...rows].sort((a, b) => b.best - a.best).slice(0, 3);
  for (const r of sorted) {
    const row = document.createElement("div");
    row.className = "rollup-row";
    row.innerHTML = `<span class="font-body-sm text-body-sm text-on-surface">${escapeHtml(r.habit.name)}</span><span class="font-body-sm text-body-sm text-on-surface-variant">${r.best} ${r.best === 1 ? "day" : "days"}</span>`;
    wrap.appendChild(row);
  }
  if (!sorted.length || sorted[0].best === 0) wrap.appendChild(emptyNote("Complete habits to start a run."));
  return wrap;
}

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------
function sectionTitle(text) {
  const p = document.createElement("p");
  p.className = "pick-label font-label-md text-label-md text-on-surface-variant mt-5 mb-2";
  p.textContent = text.toUpperCase();
  return p;
}

function emptyNote(text) {
  const p = document.createElement("p");
  p.className = "font-body-sm text-body-sm text-on-surface-variant py-2";
  p.textContent = text;
  return p;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
