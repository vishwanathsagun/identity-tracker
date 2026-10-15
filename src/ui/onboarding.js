// src/ui/onboarding.js — first-run onboarding (UI ADDITION — glass tokens).
//
// Shown when settings.onboarding_done !== "true". Three steps:
//   1. Welcome — what the app is (tiny habits = votes for who you're becoming)
//   2. How it works — three bullets (small habits, votes/identity, consistency)
//   3. Your name + reminders — display name field; "Get started" saves the
//      name, requests notification permission (syncNotifications requests it
//      on native), sets onboarding_done, and closes.
// Android back is consumed while open (main.js checks isOnboardingOpen).

import * as repo from "../repo.js";
import { showToast } from "./nav.js";
import { syncNotifications } from "../notify.js";

let overlay = null;
let step = 0;
let nameValue = "";

/** Returns true when onboarding was shown (first run). */
export async function maybeShowOnboarding() {
  const s = await repo.getSettings();
  if (s.onboarding_done === "true") return false;
  nameValue = s.display_name || "";
  showOnboarding();
  return true;
}

export function isOnboardingOpen() {
  return overlay != null;
}

export function closeOnboarding() {
  if (overlay) {
    overlay.remove();
    overlay = null;
  }
}

function showOnboarding() {
  closeOnboarding();
  step = 0;
  overlay = document.createElement("div");
  overlay.id = "onboarding";
  overlay.className = "onboard";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Welcome");
  document.body.appendChild(overlay);
  renderStep();
}

async function finish() {
  // Never trap the user on this screen: the save is guarded, the overlay
  // closes BEFORE anything native, and reminder setup runs detached +
  // time-boxed (a hung permission call on some devices used to block here).
  try {
    await repo.setSettings({ onboarding_done: "true", display_name: nameValue.trim() || "friend" });
  } catch (e) {
    console.warn("[onboarding] settings save failed", e);
  }
  closeOnboarding();
  showToast(`Welcome, ${nameValue.trim() || "friend"} — one small vote at a time.`);
  // requests notification permission on native — detached so it can't stall UI
  timeBox(syncNotifications(), 5000, "reminder setup").catch((e) =>
    console.warn("[onboarding] reminder setup skipped", e)
  );
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

function renderStep() {
  if (!overlay) return;
  overlay.textContent = "";

  const card = document.createElement("div");
  card.className = "onboard-card";
  overlay.appendChild(card);

  const art = document.createElement("div");
  art.className = "onboard-art";
  art.innerHTML = `<span class="material-symbols-outlined onboard-glyph">${
    ["auto_awesome", "how_to_vote", "person"][step]
  }</span>`;
  card.appendChild(art);

  if (step === 0) card.appendChild(title("Violet Dusk"));
  if (step === 0) {
    card.appendChild(body("Tiny habits, cast as votes for the person you're becoming."));
  }

  if (step === 1) {
    card.appendChild(title("How it works"));
    const list = document.createElement("div");
    list.className = "flex flex-col gap-3 mt-1";
    for (const [icon, head, sub] of [
      ["center_focus_weak", "Shrink the habit", "Two minutes counts. Small enough to never skip."],
      ["how_to_vote", "Cast a vote", "Every check marks a vote for an identity — not a streak to fear."],
      ["trending_up", "Watch consistency grow", "Insights track your rhythm, best runs and weekly rhythm."],
    ]) {
      const row = document.createElement("div");
      row.className = "onboard-bullet";
      row.innerHTML = `<span class="material-symbols-outlined text-[22px] text-[#F6DBC0] shrink-0">${icon}</span>
        <div class="flex flex-col min-w-0">
          <p class="font-body-md text-body-md text-on-surface">${head}</p>
          <p class="font-body-sm text-body-sm text-on-surface-variant">${sub}</p>
        </div>`;
      list.appendChild(row);
    }
    card.appendChild(list);
  }

  if (step === 2) {
    card.appendChild(title("What should we call you?"));
    card.appendChild(body("Used for your greeting — you can change it later in Settings."));
    const inp = document.createElement("input");
    inp.type = "text";
    inp.className = "glass-input w-full mt-3";
    inp.value = nameValue;
    inp.maxLength = 40;
    inp.placeholder = "Your name";
    inp.setAttribute("aria-label", "Your name");
    inp.addEventListener("change", () => (nameValue = inp.value.trim()));
    card.appendChild(inp);
    const note = document.createElement("p");
    note.className = "font-body-sm text-body-sm text-on-surface-variant mt-3";
    note.textContent = "On the next step we'll ask permission to send reminder notifications — always optional, tunable in Settings.";
    card.appendChild(note);
  }

  // dots
  const dots = document.createElement("div");
  dots.className = "onboard-dots";
  for (let i = 0; i < 3; i++) {
    const d = document.createElement("span");
    d.className = `onboard-dot${i === step ? " on" : ""}`;
    dots.appendChild(d);
  }
  card.appendChild(dots);

  // actions
  const actions = document.createElement("div");
  actions.className = "flex flex-col gap-2 mt-4";
  const primary = document.createElement("button");
  primary.type = "button";
  primary.className = "onboard-primary";
  primary.textContent = step < 2 ? "Continue" : "Get started";
  primary.addEventListener("click", () => {
    if (step < 2) {
      step++;
      renderStep();
    } else {
      nameValue = (overlay.querySelector('input[type="text"]') || {}).value ?? nameValue;
      finish();
    }
  });
  actions.appendChild(primary);
  if (step < 2) {
    const skip = document.createElement("button");
    skip.type = "button";
    skip.className = "onboard-skip";
    skip.textContent = "Skip";
    skip.addEventListener("click", () => finish());
    actions.appendChild(skip);
  }
  card.appendChild(actions);
}

function title(text) {
  const el = document.createElement("h2");
  el.className = "font-headline-lg-mobile text-headline-lg-mobile text-on-surface text-center";
  el.textContent = text;
  return el;
}

function body(text) {
  const el = document.createElement("p");
  el.className = "font-body-md text-body-md text-on-surface-variant text-center mt-2";
  el.textContent = text;
  return el;
}
