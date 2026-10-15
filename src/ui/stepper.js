// src/ui/stepper.js — Add / Edit habit stepper (UI ADDITION — full-screen
// overlay built from the design's glass tokens; the frozen prototype has no
// stepper, so every control here follows DESIGN.md's input/chip recipes).
//
// Steps: 1 name+icon+color · 2 shrink-it (2-min) · 3 cue · 4 rhythm · 5 reminders
// Edit mode prefills everything and adds Archive / Delete actions.

import * as repo from "../repo.js";
import { emit } from "../state.js";
import { openScreen } from "./screens.js";
import { hapticTab } from "../haptics.js";

const DAY_LABELS_SUN = ["S", "M", "T", "W", "T", "F", "S"]; // index = JS getDay()

// curated icon + accent pools (all used by the frozen demo cards)
const ICONS = [
  "water_drop", "self_improvement", "electric_bolt", "directions_walk",
  "menu_book", "nightlight", "fitness_center", "local_cafe",
  "code", "music_note", "psychology", "spa",
];
const COLORS = ["peach", "mauve", "plum"];
const COLOR_HEX = { peach: "#F6DBC0", mauve: "#935073", plum: "#ffafd5" };

const FREQ_MODES = [
  { key: "daily", label: "Every day" },
  { key: "days_of_week", label: "Specific days" },
  { key: "times_per_week", label: "Times per week" },
];

const STEP_TITLES = ["Name it", "Shrink it", "Set the cue", "Rhythm", "Reminders"];

/** Open the stepper. Pass habit (row object) to edit, null to create. */
export function openStepper(habit = null) {
  const editing = !!habit;
  const draft = habit
    ? {
        name: habit.name,
        icon: habit.icon,
        colorKey: habit.colorKey,
        twoMinVersion: habit.twoMinVersion || "",
        cueTime: habit.cueTime || "",
        cuePlace: habit.cuePlace || "",
        cueIcon: habit.cueIcon || "schedule",
        stackAnchor: habit.stackAnchor || "",
        frequencyType: habit.frequencyType,
        frequencyDays: [...habit.frequencyDays],
        timesPerWeek: habit.timesPerWeek || habit.frequencyDays.length || 3,
        reminderTimes: [...habit.reminderTimes],
        reminderMessage: habit.reminderMessage || "",
        identityId: habit.identityId ?? null,
      }
    : {
        name: "",
        icon: "check_circle",
        colorKey: "mauve",
        twoMinVersion: "",
        cueTime: "",
        cuePlace: "",
        cueIcon: "schedule",
        stackAnchor: "",
        frequencyType: "daily",
        frequencyDays: [0, 1, 2, 3, 4, 5, 6],
        timesPerWeek: 3,
        reminderTimes: [],
        reminderMessage: "",
        identityId: null,
      };

  let step = 0;

  openScreen({
    id: "stepper",
    title: editing ? "Edit habit" : STEP_TITLES[0],
    build(body, api) {
      render(body, api);
    },
  });

  function render(body, api) {
    body.textContent = "";
    body.classList.add("stepper-body");

    // step dots
    const dots = document.createElement("div");
    dots.className = "stepper-dots";
    for (let i = 0; i < STEP_TITLES.length; i++) {
      const d = document.createElement("span");
      d.className = "stepper-dot" + (i === step ? " active" : i < step ? " done" : "");
      dots.appendChild(d);
    }
    body.appendChild(dots);

    const title = document.createElement("h3");
    title.className = "font-headline-sm text-headline-sm text-on-surface mt-4 mb-1";
    title.textContent = STEP_TITLES[step];
    body.appendChild(title);

    const hint = document.createElement("p");
    hint.className = "font-body-sm text-body-sm text-on-surface-variant mb-4";
    hint.textContent = HINTS[step];
    body.appendChild(hint);

    const content = document.createElement("div");
    content.className = "flex flex-col gap-space-md";
    body.appendChild(content);

    STEPS[step](content, draft);

    // nav row
    const nav = document.createElement("div");
    nav.className = "stepper-nav";
    if (step > 0) {
      const back = ghostBtn("Back", () => {
        step -= 1;
        hapticTab();
        render(body, api);
      });
      nav.appendChild(back);
    }
    const next = primaryBtn(step === STEP_TITLES.length - 1 ? (editing ? "Save changes" : "Create habit") : "Next", async () => {
      if (!validate(step, draft, api)) return;
      hapticTab();
      if (step < STEP_TITLES.length - 1) {
        step += 1;
        render(body, api);
        return;
      }
      // save
      try {
        if (editing) {
          await repo.updateHabit(habit.id, draft);
          emit("toast", "Habit updated");
        } else {
          await repo.createHabit(draft);
          emit("toast", "Habit created");
        }
        api.close();
      } catch (e) {
        console.error("[stepper] save failed", e);
        emit("toast", "Could not save — try again");
      }
    });
    nav.appendChild(next);
    body.appendChild(nav);

    // edit-mode actions
    if (editing && step === STEP_TITLES.length - 1) {
      const actions = document.createElement("div");
      actions.className = "stepper-actions";
      const archive = ghostBtn(habit.archivedAt ? "Restore habit" : "Archive habit", async () => {
        await repo.archiveHabit(habit.id, !habit.archivedAt);
        emit("toast", habit.archivedAt ? "Habit restored" : "Habit archived");
        api.close();
      });
      actions.appendChild(archive);
      const del = dangerBtn("Delete forever", async () => {
        await repo.deleteHabit(habit.id);
        emit("toast", "Habit deleted");
        api.close();
      });
      actions.appendChild(del);
      body.appendChild(actions);
    }
  }
}

const HINTS = [
  "What vote are you casting? Keep it short and concrete.",
  "The 2-minute version you can do on your worst day.",
  "A cue ties the habit to a moment — when and where it happens.",
  "Choose when this habit shows up on your Today screen.",
  "Optional nudges. Reminders fire only inside quiet-hour bounds.",
];

// ---------------------------------------------------------------------------
// steps
// ---------------------------------------------------------------------------
const STEPS = [
  // 1 — name + icon + color
  (box, draft) => {
    box.appendChild(field("Habit name", draft.name, (v) => (draft.name = v), { placeholder: "e.g. Morning walk" }));
    box.appendChild(label("Icon"));
    const icons = document.createElement("div");
    icons.className = "pick-grid";
    for (const icon of ICONS) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pick-tile" + (draft.icon === icon ? " on" : "");
      b.innerHTML = `<span class="material-symbols-outlined text-[22px]">${icon}</span>`;
      b.addEventListener("click", () => {
        draft.icon = icon;
        icons.querySelectorAll(".pick-tile").forEach((t) => t.classList.remove("on"));
        b.classList.add("on");
      });
      icons.appendChild(b);
    }
    box.appendChild(icons);
    box.appendChild(label("Accent"));
    const colors = document.createElement("div");
    colors.className = "flex gap-3";
    for (const c of COLORS) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "color-dot" + (draft.colorKey === c ? " on" : "");
      b.style.background = COLOR_HEX[c];
      b.setAttribute("aria-label", c);
      b.addEventListener("click", () => {
        draft.colorKey = c;
        colors.querySelectorAll(".color-dot").forEach((t) => t.classList.remove("on"));
        b.classList.add("on");
      });
      colors.appendChild(b);
    }
    box.appendChild(colors);
  },

  // 2 — 2-minute version
  (box, draft) => {
    box.appendChild(field("Shrink it to 2 minutes", draft.twoMinVersion, (v) => (draft.twoMinVersion = v), { placeholder: "e.g. Put shoes on & step outside" }));
    const tip = document.createElement("p");
    tip.className = "font-body-sm text-body-sm text-on-surface-variant";
    tip.textContent = "Example: \"Read 10 pages\" shrinks to \"Open book to page 1\". The small version keeps the vote castable on hard days.";
    box.appendChild(tip);
  },

  // 3 — cue (time / place / stack)
  (box, draft) => {
    const timeRow = document.createElement("div");
    timeRow.className = "cue-row";
    timeRow.appendChild(field("Time (optional)", draft.cueTime, (v) => (draft.cueTime = v), { type: "time" }));
    box.appendChild(timeRow);
    box.appendChild(field("Place (optional)", draft.cuePlace, (v) => (draft.cuePlace = v), { placeholder: "e.g. Balcony" }));
    box.appendChild(field("Stack after… (optional)", draft.stackAnchor, (v) => (draft.stackAnchor = v), { placeholder: "e.g. After coffee" }));
  },

  // 4 — rhythm (frequency)
  (box, draft) => {
    const seg = document.createElement("div");
    seg.className = "seg";
    for (const mode of FREQ_MODES) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "seg-btn" + (draft.frequencyType === mode.key ? " on" : "");
      b.textContent = mode.label;
      b.addEventListener("click", () => {
        draft.frequencyType = mode.key;
        if (mode.key === "daily") draft.frequencyDays = [0, 1, 2, 3, 4, 5, 6];
        renderRhythm();
      });
      seg.appendChild(b);
    }
    box.appendChild(seg);

    const extra = document.createElement("div");
    box.appendChild(extra);

    const renderRhythm = () => {
      seg.querySelectorAll(".seg-btn").forEach((b, i) => b.classList.toggle("on", FREQ_MODES[i].key === draft.frequencyType));
      extra.textContent = "";
      extra.className = "flex flex-col gap-space-md";
      if (draft.frequencyType === "daily") return;

      if (draft.frequencyType === "days_of_week") {
        extra.appendChild(label("Days"));
        const pills = document.createElement("div");
        pills.className = "day-row";
        for (let d = 0; d < 7; d++) {
          const b = document.createElement("button");
          b.type = "button";
          const on = draft.frequencyDays.includes(d);
          b.className = "day-pill" + (on ? " on" : "");
          b.textContent = DAY_LABELS_SUN[d];
          b.addEventListener("click", () => {
            const i = draft.frequencyDays.indexOf(d);
            if (i === -1) draft.frequencyDays.push(d);
            else if (draft.frequencyDays.length > 1) draft.frequencyDays.splice(i, 1);
            draft.frequencyDays.sort();
            b.classList.toggle("on", draft.frequencyDays.includes(d));
          });
          pills.appendChild(b);
        }
        extra.appendChild(pills);
      }

      if (draft.frequencyType === "times_per_week") {
        const targetLabel = label(`Target: ${draft.timesPerWeek}× per week`);
        extra.appendChild(targetLabel);
        const row = document.createElement("div");
        row.className = "day-row";
        for (let n = 1; n <= 7; n++) {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "day-pill" + (draft.timesPerWeek === n ? " on" : "");
          b.textContent = String(n);
          b.addEventListener("click", () => {
            draft.timesPerWeek = n;
            row.querySelectorAll(".day-pill").forEach((p, i) => p.classList.toggle("on", i + 1 === n));
            targetLabel.textContent = `Target: ${n}× per week`;
          });
          row.appendChild(b);
        }
        extra.appendChild(row);
        const note = document.createElement("p");
        note.className = "font-body-sm text-body-sm text-on-surface-variant";
        note.textContent = "Pick which days below (the target keeps you honest).";
        extra.appendChild(note);
        const pills = document.createElement("div");
        pills.className = "day-row";
        for (let d = 0; d < 7; d++) {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "day-pill" + (draft.frequencyDays.includes(d) ? " on" : "");
          b.textContent = DAY_LABELS_SUN[d];
          b.addEventListener("click", () => {
            const i = draft.frequencyDays.indexOf(d);
            if (i === -1) draft.frequencyDays.push(d);
            else if (draft.frequencyDays.length > 1) draft.frequencyDays.splice(i, 1);
            draft.frequencyDays.sort();
            b.classList.toggle("on", draft.frequencyDays.includes(d));
          });
          pills.appendChild(b);
        }
        extra.appendChild(pills);
      }
    };
    renderRhythm();
  },

  // 5 — reminders
  (box, draft) => {
    box.appendChild(label("Reminder times"));
    const list = document.createElement("div");
    list.className = "flex flex-col gap-2";
    const renderTimes = () => {
      list.textContent = "";
      draft.reminderTimes.forEach((t, i) => {
        const row = document.createElement("div");
        row.className = "reminder-row";
        const inp = document.createElement("input");
        inp.type = "time";
        inp.className = "glass-input w-full";
        inp.value = t;
        inp.addEventListener("change", () => (draft.reminderTimes[i] = inp.value));
        row.appendChild(inp);
        const rm = document.createElement("button");
        rm.type = "button";
        rm.className = "screen-back";
        rm.setAttribute("aria-label", "Remove reminder");
        rm.innerHTML = `<span class="material-symbols-outlined text-[20px]">close</span>`;
        rm.addEventListener("click", () => {
          draft.reminderTimes.splice(i, 1);
          renderTimes();
        });
        row.appendChild(rm);
        list.appendChild(row);
      });
      if (draft.reminderTimes.length < 3) {
        const add = ghostBtn("+ Add reminder", () => {
          draft.reminderTimes.push("09:00");
          renderTimes();
        });
        add.classList.add("self-start");
        list.appendChild(add);
      }
    };
    renderTimes();
    box.appendChild(list);
    box.appendChild(field("Reminder message (optional)", draft.reminderMessage, (v) => (draft.reminderMessage = v), { placeholder: "e.g. Your future self says thanks" }));

    // identity (optional) — links this habit's votes to who it's a vote for
    box.appendChild(label("Identity (optional)"));
    const sel = document.createElement("select");
    sel.className = "glass-input identity-select w-full";
    sel.addEventListener("change", () => (draft.identityId = sel.value ? Number(sel.value) : null));
    const loading = document.createElement("option");
    loading.textContent = "Loading…";
    sel.appendChild(loading);
    box.appendChild(sel);
    repo.getIdentities().then((idents) => {
      sel.textContent = "";
      const none = document.createElement("option");
      none.value = "";
      none.textContent = "No identity yet";
      sel.appendChild(none);
      for (const ident of idents) {
        const o = document.createElement("option");
        o.value = String(ident.id);
        o.textContent = ident.name;
        sel.appendChild(o);
      }
      sel.value = draft.identityId ? String(draft.identityId) : "";
    });
  },
];

// ---------------------------------------------------------------------------
// validation
// ---------------------------------------------------------------------------
function validate(step, draft, api) {
  if (step === 0 && !draft.name.trim()) {
    emit("toast", "Give the habit a name first");
    return false;
  }
  if (step === 3) {
    if (draft.frequencyType === "days_of_week" && !draft.frequencyDays.length) {
      emit("toast", "Pick at least one day");
      return false;
    }
    if (draft.frequencyType === "times_per_week" && (!draft.frequencyDays.length || draft.timesPerWeek > draft.frequencyDays.length)) {
      emit("toast", `Pick ${draft.timesPerWeek}+ days for that target`);
      return false;
    }
  }
  if (step === 4 && draft.reminderTimes.some((t) => !t)) {
    emit("toast", "Each reminder needs a time");
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// small control factories (DESIGN.md input/chip recipes)
// ---------------------------------------------------------------------------
function label(text) {
  const l = document.createElement("p");
  l.className = "pick-label font-label-md text-label-md text-on-surface-variant";
  l.textContent = text;
  return l;
}

function field(labelText, value, onInput, { type = "text", placeholder = "" } = {}) {
  const wrap = document.createElement("label");
  wrap.className = "flex flex-col gap-1";
  const l = document.createElement("span");
  l.className = "font-label-md text-label-md text-on-surface-variant";
  l.textContent = labelText;
  const inp = document.createElement("input");
  inp.type = type;
  inp.className = "glass-input";
  inp.value = value;
  inp.placeholder = placeholder;
  inp.addEventListener("input", () => onInput(inp.value));
  wrap.appendChild(l);
  wrap.appendChild(inp);
  return wrap;
}

function primaryBtn(text, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className =
    "flex-1 min-h-[48px] rounded-full bg-[#F6DBC0] text-[#1c0e22] font-label-lg text-label-lg font-semibold shadow-[0_0_20px_rgba(246,219,192,0.4)] active:scale-95 transition-transform";
  b.textContent = text;
  b.addEventListener("click", onClick);
  return b;
}

function ghostBtn(text, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "min-h-[48px] px-5 rounded-full border border-[rgba(248,244,233,0.15)] text-on-surface font-label-lg text-label-lg font-semibold active:scale-95 transition-transform";
  b.textContent = text;
  b.addEventListener("click", onClick);
  return b;
}

function dangerBtn(text, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "min-h-[48px] px-5 rounded-full border border-[#ffb4ab]/40 text-[#ffb4ab] font-label-lg text-label-lg font-semibold active:scale-95 transition-transform";
  b.textContent = text;
  b.addEventListener("click", onClick);
  return b;
}
