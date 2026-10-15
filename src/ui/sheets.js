// src/ui/sheets.js — glass bottom sheet (UI ADDITION, built from the design's
// existing tokens/components: plum glass fill, peach rim, pill items).
// Sheets stack; Android back button / Esc / backdrop tap close the top sheet.

const openSheets = [];
let backdrop = null;

function ensureBackdrop() {
  if (backdrop) return backdrop;
  backdrop = document.createElement("div");
  backdrop.className = "sheet-backdrop";
  backdrop.addEventListener("click", () => top()?.close());
  document.body.appendChild(backdrop);
  return backdrop;
}

function top() {
  return openSheets[openSheets.length - 1] || null;
}

export function closeTopSheet() {
  const sheet = top();
  if (!sheet) return false;
  sheet.close();
  return true;
}

export function anySheetOpen() {
  return openSheets.length > 0;
}

/**
 * showSheet({ title, build(bodyEl, api) })
 *   build() may return cleanup fn. api = { close }.
 */
export function showSheet({ title, build }) {
  ensureBackdrop();
  const panel = document.createElement("div");
  panel.className = "sheet-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");

  const handle = document.createElement("div");
  handle.className = "mx-auto mb-3 h-1.5 w-10 rounded-full bg-[#935073]/40";
  panel.appendChild(handle);

  if (title) {
    const h = document.createElement("div");
    h.className = "sheet-title px-1 pb-2";
    h.textContent = title;
    panel.appendChild(h);
  }

  const body = document.createElement("div");
  body.className = "flex flex-col gap-space-sm";
  panel.appendChild(body);

  const api = { close };
  let cleanup = null;
  if (typeof build === "function") cleanup = build(body, api);

  document.body.appendChild(panel);
  const sheet = { panel, close };
  openSheets.push(sheet);

  // open on the next frame; setTimeout fallback covers environments where
  // rAF is throttled (background webview) so the sheet never gets stuck hidden
  let opened = false;
  const openNow = () => {
    if (opened) return;
    opened = true;
    backdrop.classList.add("open");
    panel.classList.add("open");
  };
  requestAnimationFrame(openNow);
  setTimeout(openNow, 80);

  function close() {
    const idx = openSheets.indexOf(sheet);
    if (idx === -1) return;
    openSheets.splice(idx, 1);
    panel.classList.remove("open");
    if (!openSheets.length) backdrop.classList.remove("open");
    setTimeout(() => {
      panel.remove();
      if (typeof cleanup === "function") cleanup();
    }, 300);
  }

  return api;
}

/** pill action item (existing chip/pill language) */
export function sheetItem({ label, icon, onClick }) {
  const btn = document.createElement("button");
  btn.className = "sheet-item";
  if (icon) {
    const i = document.createElement("span");
    i.className = "material-symbols-outlined text-[20px] text-[#F6DBC0]";
    i.textContent = icon;
    btn.appendChild(i);
  }
  const span = document.createElement("span");
  span.textContent = label;
  btn.appendChild(span);
  btn.addEventListener("click", () => onClick && onClick());
  return btn;
}

export function sheetPrimaryButton(label, onClick) {
  const btn = document.createElement("button");
  btn.className =
    "w-full min-h-[48px] rounded-full bg-[#F6DBC0] text-[#1c0e22] font-label-lg text-label-lg font-semibold shadow-[0_0_20px_rgba(246,219,192,0.4)]";
  btn.textContent = label;
  btn.addEventListener("click", () => onClick && onClick());
  return btn;
}

export function sheetGhostButton(label, onClick) {
  const btn = document.createElement("button");
  btn.className =
    "w-full min-h-[48px] rounded-full border border-[rgba(248,244,233,0.15)] text-on-surface font-label-lg text-label-lg font-semibold";
  btn.textContent = label;
  btn.addEventListener("click", () => onClick && onClick());
  return btn;
}
