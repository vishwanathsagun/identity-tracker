// src/ui/screens.js — full-screen overlay screens (UI ADDITION, built from the
// same glass language as sheets: plum fill, peach rim, slide-up motion).
// Screens stack: Habit detail -> Edit stepper, Android back / Esc close the top.

const stack = [];

export function anyScreenOpen() {
  return stack.length > 0;
}

export function topScreenId() {
  return stack.length ? stack[stack.length - 1].id : null;
}

export function closeTopScreen() {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

export function closeAllScreens() {
  while (stack.length) stack[stack.length - 1].close();
}

export function closeScreen(id) {
  const entry = stack.find((s) => s.id === id);
  if (entry) entry.close();
}

/**
 * openScreen({ id, title, build(bodyEl, api) })
 *   api = { close, el } — build() populates the scrollable body.
 * Re-opening the same id replaces the existing entry.
 */
export function openScreen({ id, title, build }) {
  closeScreen(id);

  const overlay = document.createElement("section");
  overlay.className = "screen-overlay";
  overlay.dataset.screen = id;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");

  const header = document.createElement("header");
  header.className = "screen-header";

  const back = document.createElement("button");
  back.className = "screen-back";
  back.setAttribute("aria-label", "Back");
  back.innerHTML = `<span class="material-symbols-outlined text-[24px]">chevron_left</span>`;
  header.appendChild(back);

  const h = document.createElement("h2");
  h.className = "screen-title font-headline-sm text-headline-sm text-on-surface";
  h.textContent = title || "";
  header.appendChild(h);

  // spacer keeps the title visually centered against the back button
  const spacer = document.createElement("span");
  spacer.style.width = "40px";
  header.appendChild(spacer);

  const body = document.createElement("div");
  body.className = "screen-body";

  overlay.appendChild(header);
  overlay.appendChild(body);
  document.body.appendChild(overlay);

  const entry = { id, overlay, close };
  stack.push(entry);

  const api = { close, el: overlay };
  if (typeof build === "function") build(body, api);

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    const i = stack.indexOf(entry);
    if (i !== -1) stack.splice(i, 1);
    overlay.classList.remove("open");
    setTimeout(() => overlay.remove(), 300);
  }

  back.addEventListener("click", close);
  // open on next frame with timer fallback (rAF may be throttled in webviews)
  let opened = false;
  const openNow = () => {
    if (closed || opened) return;
    opened = true;
    overlay.classList.add("open");
  };
  requestAnimationFrame(openNow);
  setTimeout(openNow, 80);

  return api;
}
