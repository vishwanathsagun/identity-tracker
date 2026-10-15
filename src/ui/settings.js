// src/ui/settings.js — the Settings screen (UI ADDITION — glass tokens).
//
// Sections: Profile · Notifications (tone, quiet hours, daily summary) ·
// Behavior (haptics, motion/transparency, week start) · Data (export /
// import / delete) · About (+ demo data button in DEV builds).
// Every control writes through repo.setSettings -> repo 'change', which
// main.js already uses to reconcile notifications; the screen live-refreshes
// while open. Also home of applyAccessibilitySettings(), called by main.js on
// boot and on every settings change.

import * as repo from "../repo.js";
import { emit, on } from "../state.js";
import { showSheet, sheetPrimaryButton, sheetGhostButton, closeTopSheet } from "./sheets.js";
import { showToast } from "./nav.js";
import { syncNotifications } from "../notify.js";
import { hapticCheck, hapticUncheck, hapticWarning } from "../haptics.js";

const APP_VERSION = "1.0.0";

let rootEl = null;
let open = false;

export function initSettings() {
  rootEl = document.getElementById("screen-settings");
  if (!rootEl) {
    rootEl = document.createElement("section");
    rootEl.id = "screen-settings";
    const host = document.getElementById("screen-today");
    rootEl.className = `${host.className} hidden`;
    host.parentElement.insertBefore(rootEl, host.nextSibling);
  }
  on("change", ({ entity }) => {
    if (open && (entity === "settings" || entity === "habits")) refresh();
  });
}

export function isSettingsOpen() {
  return open;
}

export async function showSettings() {
  if (!rootEl) initSettings();
  open = true;
  rootEl.classList.remove("hidden");
  document.getElementById("screen-today").classList.add("hidden");
  await render();
}

export function hideSettings() {
  open = false;
  if (rootEl) rootEl.classList.add("hidden");
  document.getElementById("screen-today").classList.remove("hidden");
}

export async function refresh() {
  if (!open || !rootEl) return;
  await render();
}

/** Reduce motion / transparency: class toggles consumed by additions.css. */
export function applyAccessibilitySettings(s) {
  const html = document.documentElement;
  const autoTransparent =
    s.reduce_transparency_mode === "auto" &&
    window.matchMedia("(prefers-reduced-transparency: reduce), (prefers-reduced-motion: reduce)").matches;
  html.classList.toggle("reduce-motion", s.reduce_motion === "true");
  html.classList.toggle("reduce-transparency", s.reduce_transparency === "true" || autoTransparent);
}

// ---------------------------------------------------------------------------
// render
// ---------------------------------------------------------------------------
async function render() {
  const s = await repo.getSettings();
  rootEl.textContent = "";

  // header row: back (Settings is not a bottom-nav tab) + title
  const head = document.createElement("div");
  head.className = "identity-head";
  const back = document.createElement("button");
  back.type = "button";
  back.className = "screen-back";
  back.setAttribute("aria-label", "Back to Today");
  back.innerHTML = `<span class="material-symbols-outlined text-[22px]">arrow_back</span>`;
  back.addEventListener("click", () => emit("navigate", { screen: "today" }));
  head.appendChild(back);
  const h = document.createElement("h2");
  h.className = "screen-title font-headline-lg-mobile text-headline-lg-mobile text-on-surface";
  h.textContent = "Settings";
  head.appendChild(h);
  rootEl.appendChild(head);

  const set = (patch) => repo.setSettings(patch);

  // --- profile -------------------------------------------------------------
  rootEl.appendChild(sectionLabel("PROFILE"));
  const nameInput = textRow("Display name", s.display_name || "", async (v) => {
    await set({ display_name: v });
    showToast("Name saved");
  });
  rootEl.appendChild(nameInput);

  // --- notifications -------------------------------------------------------
  rootEl.appendChild(sectionLabel("NOTIFICATIONS"));
  rootEl.appendChild(
    selectRow("Reminder tone", s.notification_tone || "neutral", [
      ["gentle", "Gentle"],
      ["neutral", "Neutral"],
      ["push", "Push"],
    ], (v) => set({ notification_tone: v }))
  );
  rootEl.appendChild(
    switchRow("Quiet hours", "No reminders inside this window", s.quiet_hours_enabled === "true", async (v) => {
      await set({ quiet_hours_enabled: String(v) });
      if (v) syncNotifications().catch(() => {});
    })
  );
  if (s.quiet_hours_enabled === "true") {
    rootEl.appendChild(timeRow("Quiet from", s.quiet_hours_start || "22:00", (v) => set({ quiet_hours_start: v })));
    rootEl.appendChild(timeRow("Quiet until", s.quiet_hours_end || "07:00", (v) => set({ quiet_hours_end: v })));
  }
  rootEl.appendChild(
    switchRow("Daily summary", "One evening recap — skipped on perfect days", s.daily_summary_enabled === "true", async (v) => {
      await set({ daily_summary_enabled: String(v) });
      if (v) syncNotifications().catch(() => {});
    })
  );
  if (s.daily_summary_enabled === "true") {
    rootEl.appendChild(timeRow("Summary time", s.daily_summary_time || "20:00", (v) => set({ daily_summary_time: v })));
  }
  rootEl.appendChild(hint("Reminders schedule 14 days ahead and re-check whenever anything changes."));

  // --- behavior ------------------------------------------------------------
  rootEl.appendChild(sectionLabel("BEHAVIOR"));
  rootEl.appendChild(
    switchRow("Haptics", "Tiny vibration feedback on taps", s.haptics === "true", (v) => set({ haptics: String(v) }))
  );
  rootEl.appendChild(
    switchRow("Reduce motion", "Quiet animations and transitions", s.reduce_motion === "true", (v) =>
      set({ reduce_motion: String(v) })
    )
  );
  rootEl.appendChild(
    switchRow("Reduce transparency", "Solid surfaces instead of blur", s.reduce_transparency === "true", (v) =>
      set({ reduce_transparency: String(v) })
    )
  );
  if (s.reduce_transparency === "true" || s.reduce_transparency_mode !== "off") {
    rootEl.appendChild(
      selectRow("Transparency", s.reduce_transparency_mode || "off", [
        ["off", "Off"],
        ["auto", "Follow system"],
        ["on", "Always"],
      ], (v) => set({ reduce_transparency_mode: v }))
    );
  }
  rootEl.appendChild(
    segmentedRow("Week starts on", s.first_day_of_week === "sun" ? 1 : 0, ["Monday", "Sunday"], (i) =>
      set({ first_day_of_week: i === 1 ? "sun" : "mon" })
    )
  );

  // --- data ----------------------------------------------------------------
  rootEl.appendChild(sectionLabel("DATA"));  rootEl.appendChild(buttonRow("Export backup", "Download a JSON copy of everything", "download", () => doExport(), "primary", "Export"));
  rootEl.appendChild(buttonRow("Import backup", "Restore from a JSON file — replaces all data", "upload", () => doImport(), "ghost", "Import"));
  rootEl.appendChild(buttonRow("Delete all data", "Habits, history, identities, settings", "delete_forever", () => confirmDelete(), "danger", "Delete"));

  if (import.meta.env.DEV) {
    rootEl.appendChild(sectionLabel("DEV"));
    rootEl.appendChild(buttonRow("Load demo data", "Replaces current data with the Stitch demo set", "science", () => doDevSeed(), "ghost", "Load"));
  }

  // --- about ---------------------------------------------------------------
  rootEl.appendChild(sectionLabel("ABOUT"));
  rootEl.appendChild(staticRow("Version", `Violet Dusk ${APP_VERSION}`));
  rootEl.appendChild(staticRow("Storage", "On-device only — nothing leaves your phone"));
}

// ---------------------------------------------------------------------------
// data actions
// ---------------------------------------------------------------------------
function doExport() {
  repo
    .exportBackup()
    .then((backup) => {
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `violet-dusk-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      showToast("Backup exported");
    })
    .catch((e) => {
      console.warn("[settings] export failed", e);
      showToast("Export failed");
    });
}

function doImport() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.addEventListener("change", async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      hapticWarning();
      showToast("That file isn't valid JSON");
      return;
    }
    if (!repo.isValidBackup(data)) {
      hapticWarning();
      showToast("Not a valid Violet Dusk backup");
      return;
    }
    showSheet({
      title: "Replace all data?",
      build(body, api) {
        const p = document.createElement("p");
        p.className = "font-body-sm text-body-sm text-on-surface-variant mb-4";
        const counts = ["habits", "completions", "identities", "notes"].filter((t) => Array.isArray(data[t]) && data[t].length);
        p.textContent = `This file has ${counts.map((t) => `${data[t].length} ${t}`).join(", ")}. Importing replaces everything currently on this device. This cannot be undone.`;
        body.appendChild(p);
        body.appendChild(
          sheetPrimaryButton("Replace everything", async () => {
            try {
              await repo.importBackup(data);
              api.close();
              showToast("Backup restored");
            } catch (e) {
              console.warn("[settings] import failed", e);
              hapticWarning();
              showToast("Import failed — nothing changed");
            }
          })
        );
        body.appendChild(sheetGhostButton("Cancel", () => api.close()));
      },
    });
  });
  input.click();
}

function confirmDelete() {
  showSheet({
    title: "Delete all data?",
    build(body, api) {
      const p = document.createElement("p");
      p.className = "font-body-sm text-body-sm text-on-surface-variant mb-4";
      p.textContent = "Every habit, vote, note, identity and setting will be erased from this device. This cannot be undone — export a backup first if you want to keep your history.";
      body.appendChild(p);

      // type-to-confirm gate: irreversible wipe needs an explicit gesture
      const gate = document.createElement("input");
      gate.type = "text";
      gate.className = "glass-input mb-3";
      gate.placeholder = "Type DELETE to confirm";
      gate.setAttribute("aria-label", "Type DELETE to confirm");
      gate.autocomplete = "off";
      body.appendChild(gate);

      const delBtn = sheetPrimaryButton("Delete everything", async () => {
        await repo.deleteAllData();
        api.close();
        showToast("All data deleted");
      });
      delBtn.disabled = true;
      gate.addEventListener("input", () => {
        delBtn.disabled = gate.value.trim().toUpperCase() !== "DELETE";
      });
      body.appendChild(delBtn);
      body.appendChild(sheetGhostButton("Cancel", () => api.close()));
      gate.focus();
    },
  });
}

function doDevSeed() {
  showSheet({
    title: "Load demo data?",
    build(body, api) {
      const p = document.createElement("p");
      p.className = "font-body-sm text-body-sm text-on-surface-variant mb-4";
      p.textContent = "Replaces current data with the Stitch demo dataset.";
      body.appendChild(p);
      body.appendChild(
        sheetPrimaryButton("Load demo", async () => {
          const { loadDemoData } = await import("../dev/seed.js");
          await loadDemoData();
          api.close();
          showToast("Demo data loaded");
        })
      );
      body.appendChild(sheetGhostButton("Cancel", () => api.close()));
    },
  });
}

// ---------------------------------------------------------------------------
// row builders
// ---------------------------------------------------------------------------
function sectionLabel(text) {
  const el = document.createElement("p");
  el.className = "pick-label font-label-md text-label-md text-on-surface-variant settings-sec";
  el.textContent = text;
  return el;
}

function hint(text) {
  const el = document.createElement("p");
  el.className = "font-body-sm text-body-sm text-on-surface-variant mt-1 mb-1";
  el.textContent = text;
  return el;
}

function card() {
  const el = document.createElement("div");
  el.className = "settings-card";
  return el;
}

function rowShell(label, hint) {
  const c = card();
  const wrap = document.createElement("div");
  wrap.className = "flex flex-col min-w-0";
  const l = document.createElement("p");
  l.className = "font-body-md text-body-md text-on-surface";
  l.textContent = label;
  wrap.appendChild(l);
  if (hint) {
    const p = document.createElement("p");
    p.className = "font-body-sm text-body-sm text-on-surface-variant mt-0.5";
    p.textContent = hint;
    wrap.appendChild(p);
  }
  c.appendChild(wrap);
  return { card: c, wrap };
}

function switchRow(label, hint, checked, onChange) {
  const { card: c, wrap } = rowShell(label, hint);
  c.classList.add("settings-row");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "switch";
  btn.setAttribute("role", "switch");
  btn.setAttribute("aria-checked", String(checked));
  btn.setAttribute("aria-label", label);
  btn.addEventListener("click", async () => {
    const next = btn.getAttribute("aria-checked") !== "true";
    btn.setAttribute("aria-checked", String(next));
    next ? hapticCheck() : hapticUncheck();
    try {
      await onChange(next);
    } catch (e) {
      btn.setAttribute("aria-checked", String(!next));
      console.warn("[settings] toggle failed", e);
    }
  });
  c.appendChild(wrap);
  c.appendChild(btn);
  return c;
}

function selectRow(label, value, options, onChange) {
  const { card: c, wrap } = rowShell(label);
  c.classList.add("settings-row");
  const sel = document.createElement("select");
  sel.className = "glass-input settings-select";
  for (const [v, text] of options) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = text;
    if (v === value) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener("change", () => onChange(sel.value));
  c.appendChild(wrap);
  c.appendChild(sel);
  return c;
}

function timeRow(label, value, onChange) {
  const { card: c, wrap } = rowShell(label);
  c.classList.add("settings-row");
  const inp = document.createElement("input");
  inp.type = "time";
  inp.className = "glass-input settings-time";
  inp.value = value;
  inp.addEventListener("change", () => onChange(inp.value));
  c.appendChild(wrap);
  c.appendChild(inp);
  return c;
}

function textRow(label, value, onChange) {
  const { card: c, wrap } = rowShell(label);
  c.classList.add("settings-row");
  const inp = document.createElement("input");
  inp.type = "text";
  inp.className = "glass-input settings-text";
  inp.value = value;
  inp.maxLength = 40;
  inp.placeholder = "Your name";
  inp.addEventListener("change", () => onChange(inp.value.trim()));
  c.appendChild(wrap);
  c.appendChild(inp);
  return c;
}

function segmentedRow(label, activeIndex, labels, onSelect) {
  const c = card();
  const l = document.createElement("p");
  l.className = "font-body-md text-body-md text-on-surface";
  l.textContent = label;
  c.appendChild(l);
  const seg = document.createElement("div");
  seg.className = "seg flex gap-1 mt-2";
  labels.forEach((text, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `seg-btn${i === activeIndex ? " on" : ""}`;
    b.textContent = text;
    b.addEventListener("click", () => {
      seg.querySelectorAll(".seg-btn").forEach((x, j) => x.classList.toggle("on", j === i));
      hapticCheck();
      onSelect(i);
    });
    seg.appendChild(b);
  });
  c.appendChild(seg);
  return c;
}

function buttonRow(label, hint, icon, onClick, variant, btnText = "Open") {
  const { card: c, wrap } = rowShell(label, hint);
  c.classList.add("settings-row");
  const b = document.createElement("button");
  b.type = "button";
  b.className = `settings-btn settings-btn-${variant}`;
  b.innerHTML = `<span class="material-symbols-outlined text-[20px]">${icon}</span><span class="font-label-md text-label-md">${btnText}</span>`;
  b.setAttribute("aria-label", label);
  b.addEventListener("click", onClick);
  c.appendChild(wrap);
  c.appendChild(b);
  return c;
}

function staticRow(label, value) {
  const { card: c, wrap } = rowShell(label);
  c.classList.add("settings-row");
  const v = document.createElement("p");
  v.className = "font-body-sm text-body-sm text-on-surface-variant text-right";
  v.textContent = value;
  c.appendChild(wrap);
  c.appendChild(v);
  return c;
}
