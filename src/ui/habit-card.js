// src/ui/habit-card.js — rendering + visuals for Today habit cards.
// The stardust + orb class-swapping logic below is a VERBATIM port of the
// Stitch prototype's inline script (same class strings, same animations),
// extracted so cards can be data-driven. Visual output is unchanged.

const particleField = () => document.getElementById("particle-field");

/** Ported verbatim from the prototype (celestial stardust burst) */
export function createStardust(originX, originY, colorHex) {
  const field = particleField();
  if (!field) return;
  const particleCount = 16;
  for (let i = 0; i < particleCount; i++) {
    const dot = document.createElement("div");
    dot.className = "absolute rounded-full pointer-events-none";

    const size = Math.random() * 6 + 3;
    dot.style.width = size + "px";
    dot.style.height = size + "px";
    dot.style.backgroundColor = colorHex || "#F6DBC0";
    dot.style.boxShadow = `0 0 12px ${colorHex || "#F6DBC0"}`;
    dot.style.left = originX + "px";
    dot.style.top = originY + "px";

    const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.4;
    const velocity = Math.random() * 75 + 40;
    const targetX = Math.cos(angle) * velocity;
    const targetY = Math.sin(angle) * velocity;

    field.appendChild(dot);

    dot.animate(
      [
        { transform: "translate(0, 0) scale(1)", opacity: 1 },
        { transform: `translate(${targetX}px, ${targetY}px) scale(0)`, opacity: 0 },
      ],
      {
        duration: 700 + Math.random() * 200,
        easing: "cubic-bezier(0.2, 0.9, 0.3, 1)",
      }
    ).onfinish = () => dot.remove();
  }
}

const ACCENT_GLOW = { peach: "#F6DBC0", mauve: "#935073", plum: "#ffafd5" };
export function accentGlow(accent) {
  return ACCENT_GLOW[accent] || "#F6DBC0";
}

/** Ported verbatim class-swapping from the prototype's toggle handler */
export function applyCompletedVisuals(card, isCompleted) {
  const bg = card.querySelector(".orb-bg");
  const icon = bg.querySelector("span");
  const accent = card.getAttribute("data-accent");

  if (isCompleted) {
    card.setAttribute("data-completed", "true");
    card.classList.remove("bg-surface-container-low/55");
    card.classList.add("bg-surface-container-high/50");

    bg.classList.remove("bg-surface-variant/40", "group-hover:bg-surface-variant/70");
    icon.classList.remove("text-transparent", "group-hover:text-on-surface-variant/40");

    if (accent === "mauve") {
      bg.className =
        "orb-bg absolute inset-1.5 rounded-full bg-[#935073] flex items-center justify-center shadow-[0_0_20px_rgba(147,80,115,0.7)] transition-all";
      icon.className = "material-symbols-outlined text-[#F8F4E9] text-[22px] font-bold";
    } else if (accent === "plum") {
      bg.className =
        "orb-bg absolute inset-1.5 rounded-full bg-[#502D55] border border-[#935073] flex items-center justify-center shadow-[0_0_20px_rgba(80,45,85,0.8)] transition-all";
      icon.className = "material-symbols-outlined text-[#F6DBC0] text-[22px] font-bold";
    } else {
      bg.className =
        "orb-bg absolute inset-1.5 rounded-full bg-gradient-to-tr from-[#935073] to-[#F6DBC0] flex items-center justify-center shadow-[0_0_20px_rgba(246,219,192,0.65)] transition-all";
      icon.className = "material-symbols-outlined text-[#1c0e22] text-[22px] font-bold";
    }
  } else {
    card.setAttribute("data-completed", "false");
    card.classList.add("bg-surface-container-low/55");
    card.classList.remove("bg-surface-container-high/50");

    bg.className =
      "orb-bg absolute inset-1.5 rounded-full bg-surface-variant/40 border border-[#935073]/30 flex items-center justify-center transition-all group-hover:bg-surface-variant/70";
    icon.className = "material-symbols-outlined text-transparent text-[22px] group-hover:text-on-surface-variant/40 transition-colors";
  }
}

/** spring bounce on the orb (ported timing) */
export function springOrb(btn) {
  btn.classList.add("spring-active");
  setTimeout(() => btn.classList.remove("spring-active"), 400);
}

// ---------------------------------------------------------------------------
// template capture: the 6 Stitch cards ARE the template pool (design-frozen:
// dynamic lists are clones of the existing markup)
// ---------------------------------------------------------------------------
let TEMPLATES = null;

export function captureTemplates() {
  const cards = [...document.querySelectorAll("#section-morning .habit-card, #section-afternoon .habit-card, #section-evening .habit-card")];
  const find = (accent, done) => cards.find((c) => c.dataset.accent === accent && c.dataset.completed === done);
  TEMPLATES = {
    peachDone: find("peach", "true"),
    peachPending: find("peach", "false"),
    mauveDone: find("mauve", "true"),
    mauvePending: find("mauve", "false"),
    plumPending: find("plum", "false"),
  };
  // plum-completed never exists in the demo; derive it the same way the
  // prototype's own toggle derives it (pending plum + class swap)
  if (TEMPLATES.plumPending) {
    const derived = TEMPLATES.plumPending.cloneNode(true);
    applyCompletedVisuals(derived, true);
    TEMPLATES.plumDone = derived;
  }
  if (Object.values(TEMPLATES).some((t) => !t)) {
    console.warn("[today] template pool incomplete", TEMPLATES);
  }
  return TEMPLATES;
}

export function getTemplate(accent, completed) {
  const key = `${accent}${completed ? "Done" : "Pending"}`;
  return TEMPLATES[key] || TEMPLATES.peachPending;
}

// ---------------------------------------------------------------------------
// field helpers (no markup change needed — attribute-substring selectors)
// ---------------------------------------------------------------------------
function cueParts(card) {
  const icon = card.querySelector('[class*="text-[15px]"]');
  return { row: icon?.parentElement, icon, text: icon?.parentElement?.lastElementChild };
}

function twoMinParts(card) {
  const icons = card.querySelectorAll('[class*="text-[13px]"]');
  const icon = icons[0];
  return { chip: icon?.parentElement, icon };
}

function consistencyParts(card) {
  const icons = card.querySelectorAll('[class*="text-[13px]"]');
  const icon = icons[1];
  return { chip: icon?.parentElement, icon };
}

function setChipText(chip, text) {
  if (!chip) return;
  // chip children = [icon span, text node]
  for (const node of [...chip.childNodes]) {
    if (node.nodeType === Node.TEXT_NODE) node.remove();
  }
  chip.appendChild(document.createTextNode(" " + text + " "));
}

/**
 * Clone a Stitch template card and fill it with real habit data.
 */
export function renderCard(habit, { completed, chip, nudge }) {
  const card = getTemplate(habit.colorKey, completed).cloneNode(true);
  card.setAttribute("data-accent", habit.colorKey);
  card.setAttribute("data-id", String(habit.id));
  card.setAttribute("data-completed", completed ? "true" : "false");

  card.querySelector(".habit-title").textContent = habit.name;

  const cue = cueParts(card);
  if (cue.text) {
    const label = habit.cueTime ? (habit.stackAnchor ? habit.stackAnchor : `At ${to12(habit.cueTime)}`) : habit.stackAnchor || "";
    cue.text.textContent = `${label}${habit.cuePlace ? " · " + habit.cuePlace : ""}`;
  }
  if (cue.icon && habit.cueIcon) cue.icon.textContent = habit.cueIcon;

  const twoMin = twoMinParts(card);
  if (twoMin.chip) {
    if (habit.twoMinVersion) {
      setChipText(twoMin.chip, `2-min: ${habit.twoMinVersion}`);
    } else {
      twoMin.chip.remove();
    }
  }

  const cons = consistencyParts(card);
  if (cons.chip && chip) {
    setChipText(cons.chip, `${chip.percent}% steady`);
    if (cons.icon) cons.icon.textContent = chip.icon;
  }

  if (nudge) card.setAttribute("data-nudge", "true");
  else card.removeAttribute("data-nudge");

  // if state was derived from the opposite-state template, fix visuals
  applyCompletedVisuals(card, completed);

  return card;
}

/** append the never-miss-twice nudge chip (cloned from the card's own chip) */
export function attachNudge(card) {
  const cons = consistencyParts(card);
  if (!cons.chip) return;
  const nudge = cons.chip.cloneNode(true);
  nudge.removeAttribute("data-field");
  setChipText(nudge, "A small vote today restarts your run");
  const icon = nudge.querySelector('[class*="text-[13px]"]');
  if (icon) icon.textContent = "history_toggle_off";
  cons.chip.parentElement.appendChild(nudge);
}

function to12(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}
