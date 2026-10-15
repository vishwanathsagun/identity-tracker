// src/ui/nav.js — bottom navigation.
// The tab class-swapping below is a VERBATIM port of the prototype's inline
// script (same class strings) so active-state visuals are unchanged; extended
// with haptics + screen routing as screens land.
import { on, emit } from "../state.js";
import { hapticTab } from "../haptics.js";

let navItems = [];

const INACTIVE = "flex-1 h-12 min-h-[48px] rounded-full flex flex-col items-center justify-center gap-0.5 text-on-surface-variant hover:text-on-surface transition-all";
const ACTIVE = "flex-1 h-12 min-h-[48px] rounded-full flex flex-col items-center justify-center gap-0.5 transition-all text-[#F6DBC0] bg-[#34243a]/80 shadow-[0_0_16px_rgba(147,80,115,0.35)]";

/** programmatic active-tab sync (used by Android back returning to Today) */
export function setActiveTab(path) {
  navItems.forEach((el) => {
    if (el.querySelector(".-mt-5")) return; // center + button
    const on = el.getAttribute("data-path") === path;
    el.className = on ? ACTIVE : INACTIVE;
    const lbl = el.querySelector(".font-label-sm");
    if (lbl) lbl.classList.toggle("font-semibold", on);
    if (on) el.setAttribute("aria-current", "page");
    else el.removeAttribute("aria-current");
  });
}

export function initNav() {
  navItems = [...document.querySelectorAll("nav a[data-path]")];
  navItems.forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      if (item.getAttribute("data-path") === "new-habit") {
        hapticTab();
        emit("navigate", { screen: "new-habit" });
        return;
      }
      setActiveTab(item.getAttribute("data-path"));
      hapticTab();
      emit("navigate", { screen: item.getAttribute("data-path") });
    });
  });
}

let toastEl = null;
let toastTimer = null;

/** toast (UI ADDITION — glass pill built from existing tokens) */
export function showToast(msg) {
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.id = "app-toast";
    toastEl.className =
      "app-toast fixed left-1/2 -translate-x-1/2 bottom-24 z-[70] px-4 py-2.5 rounded-full bg-[#24162a]/90 border border-[#935073]/30 backdrop-blur-xl shadow-[0_16px_40px_-12px_rgba(18,8,24,0.7)] font-label-md text-label-md text-on-surface";
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("visible"), 2200);
}

export function initToast() {
  on("toast", showToast);
}
