// src/ui/identity.js — the Identity screen (UI ADDITION — glass tokens).
//
// The spec's identity model: habits are votes for the person you're becoming;
// this screen manages the identities those votes count toward.
//   - identity cards: name + "why" + linked habits (tap habit -> detail)
//   - add/edit via glass sheet (name + why fields)
//   - delete offers reassign-to-other or unlink (spec: habits survive)
//   - "Unassigned" section links habits without an identity
// Live-refreshes on repo 'change' while visible.

import * as repo from "../repo.js";
import * as stats from "../stats.js";
import { emit, on } from "../state.js";
import { todayKey } from "../date.js";
import { showSheet, sheetPrimaryButton, sheetGhostButton, closeTopSheet } from "./sheets.js";

const ACCENT_HEX = { peach: "#F6DBC0", mauve: "#935073", plum: "#ffafd5" };

let rootEl = null;
let open = false;

export function initIdentity() {
  rootEl = document.getElementById("screen-identity");
  if (!rootEl) {
    rootEl = document.createElement("section");
    rootEl.id = "screen-identity";
    const host = document.getElementById("screen-today");
    rootEl.className = `${host.className} hidden`;
    host.parentElement.insertBefore(rootEl, host.nextSibling);
  }
  on("change", ({ entity }) => {
    if (open && (entity === "identities" || entity === "habits" || entity === "completions")) refresh();
  });
}

export function isIdentityOpen() {
  return open;
}

export async function showIdentity() {
  if (!rootEl) initIdentity();
  open = true;
  rootEl.classList.remove("hidden");
  document.getElementById("screen-today").classList.add("hidden");
  await render();
}

export function hideIdentity() {
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
  const [identities, habits, allHabits] = await Promise.all([
    repo.getIdentities(),
    repo.getHabits(),
    repo.getHabits({ includeArchived: true }),
  ]);
  const completions = await repo.getCompletions({ start: earliestKey(habits, today), end: today });
  const byHabit = new Map(habits.map((h) => [h.id, []]));
  for (const c of completions) byHabit.get(c.habitId)?.push(c);

  rootEl.textContent = "";

  // header row: title + add
  const head = document.createElement("div");
  head.className = "identity-head";
  const h = document.createElement("h2");
  h.className = "font-headline-lg-mobile text-headline-lg-mobile text-on-surface";
  h.textContent = "Identity";
  head.appendChild(h);
  const add = document.createElement("button");
  add.type = "button";
  add.className = "identity-add";
  add.setAttribute("aria-label", "Add identity");
  add.innerHTML = `<span class="material-symbols-outlined text-[22px]">add</span>`;
  add.addEventListener("click", () => openIdentitySheet(null));
  head.appendChild(add);
  rootEl.appendChild(head);

  if (!identities.length) {
    const note = document.createElement("p");
    note.className = "font-body-sm text-body-sm text-on-surface-variant mt-2";
    note.textContent = "No identities yet. An identity is who each habit is a vote for — e.g. \"I'm a runner\".";
    rootEl.appendChild(note);
  }

  // identity cards
  for (const ident of identities) {
    const linked = habits.filter((x) => x.identityId === ident.id);
    const votes = linked.reduce((s, x) => s + stats.totalVotes(byHabit.get(x.id) || []), 0);
    rootEl.appendChild(identityCard(ident, linked, votes));
  }

  // unassigned habits
  const unassigned = habits.filter((h) => !h.identityId);
  const sec = document.createElement("p");
  sec.className = "pick-label font-label-md text-label-md text-on-surface-variant mt-5 mb-2";
  sec.textContent = unassigned.length ? `UNASSIGNED (${unassigned.length})` : "UNASSIGNED";
  rootEl.appendChild(sec);
  if (!unassigned.length) {
    const p = document.createElement("p");
    p.className = "font-body-sm text-body-sm text-on-surface-variant";
    p.textContent = "Every habit is casting votes somewhere.";
    rootEl.appendChild(p);
  } else {
    for (const habit of unassigned) rootEl.appendChild(habitRow(habit, identities, null));
  }

  // archived habits — the only path back to Restore (tap -> detail -> Restore)
  const archived = allHabits.filter((h) => h.archivedAt);
  if (archived.length) {
    const a = document.createElement("p");
    a.className = "pick-label font-label-md text-label-md text-on-surface-variant mt-5 mb-2";
    a.textContent = `ARCHIVED (${archived.length})`;
    rootEl.appendChild(a);
    const note = document.createElement("p");
    note.className = "font-body-sm text-body-sm text-on-surface-variant -mt-1 mb-2";
    note.textContent = "Archived habits keep their history. Tap one to restore it.";
    rootEl.appendChild(note);
    for (const habit of archived) rootEl.appendChild(habitRow(habit, [], null, true));
  }
}

function earliestKey(habits, today) {
  let min = today;
  for (const h of habits) {
    const k = h.createdAt ? h.createdAt.slice(0, 10) : today;
    if (k < min) min = k;
  }
  return min;
}

function identityCard(ident, linked, votes) {
  const card = document.createElement("div");
  card.className = "identity-card";

  const top = document.createElement("div");
  top.className = "identity-top";
  const nameWrap = document.createElement("div");
  nameWrap.className = "flex flex-col";
  const name = document.createElement("p");
  name.className = "font-headline-sm text-headline-sm text-on-surface";
  name.textContent = ident.name;
  nameWrap.appendChild(name);
  if (ident.why) {
    const why = document.createElement("p");
    why.className = "font-body-sm text-body-sm text-on-surface-variant mt-0.5";
    why.textContent = `“${ident.why}”`;
    nameWrap.appendChild(why);
  }
  top.appendChild(nameWrap);
  const meta = document.createElement("span");
  meta.className = "font-label-md text-label-md";
  meta.style.color = "#F6DBC0";
  meta.textContent = `${linked.length} habit${linked.length === 1 ? "" : "s"} · ${votes} votes`;
  top.appendChild(meta);
  card.appendChild(top);

  const actions = document.createElement("div");
  actions.className = "identity-actions";
  const edit = miniBtn("Edit", () => openIdentitySheet(ident));
  const del = miniBtn("Delete", () => confirmDelete(ident, linked));
  del.classList.add("danger");
  actions.appendChild(edit);
  actions.appendChild(del);
  card.appendChild(actions);

  for (const habit of linked) card.appendChild(habitRow(habit, [], ident));
  if (!linked.length) {
    const p = document.createElement("p");
    p.className = "font-body-sm text-body-sm text-on-surface-variant py-1";
    p.textContent = "No habits yet — link one from below.";
    card.appendChild(p);
  }
  return card;
}

function habitRow(habit, identities, currentIdent, linkToDetail = false) {
  const row = document.createElement("div");
  row.className = "rollup-row identity-habit";
  const left = document.createElement("span");
  left.className = "font-body-sm text-body-sm text-on-surface";
  left.innerHTML = `<span class="material-symbols-outlined align-middle text-[16px]" style="color:${ACCENT_HEX[habit.colorKey] || "#F6DBC0"}">${habit.icon}</span> ${escapeHtml(habit.name)}`;
  row.appendChild(left);

  const right = document.createElement("span");
  right.className = "identity-link";
  if (identities.length) {
    // picker to assign this habit to an identity
    const sel = document.createElement("select");
    sel.className = "identity-select";
    const none = document.createElement("option");
    none.value = "";
    none.textContent = currentIdent ? "Unassigned" : "No identity";
    sel.appendChild(none);
    for (const ident of identities) {
      const o = document.createElement("option");
      o.value = String(ident.id);
      o.textContent = ident.name;
      if (currentIdent && ident.id === currentIdent.id) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener("change", async () => {
      const v = sel.value ? Number(sel.value) : null;
      await repo.updateHabit(habit.id, { identityId: v });
      emit("toast", v ? "Habit linked" : "Habit unlinked");
    });
    right.appendChild(sel);
  } else if (linkToDetail) {
    // e.g. archived rows: the detail screen is where Restore lives
    right.appendChild(miniBtn("Open", () => emit("navigate", { screen: "habit-detail", habitId: habit.id })));
  } else {
    right.textContent = "linked";
  }
  row.appendChild(right);
  return row;
}

// ---------------------------------------------------------------------------
// sheets: create/edit + delete-with-reassign
// ---------------------------------------------------------------------------
function openIdentitySheet(ident) {
  const editing = !!ident;
  let name = ident?.name || "";
  let why = ident?.why || "";
  showSheet({
    title: editing ? "Edit identity" : "New identity",
    build(body, api) {
      body.appendChild(field("Name", name, "e.g. I'm a runner", (v) => (name = v)));
      body.appendChild(field("Why (optional)", why, "What this identity means to you", (v) => (why = v)));
      body.appendChild(
        sheetPrimaryButton(editing ? "Save" : "Create identity", async () => {
          if (!name.trim()) {
            emit("toast", "Give the identity a name");
            return;
          }
          if (editing) await repo.updateIdentity(ident.id, { name: name.trim(), why: why.trim() || null });
          else await repo.createIdentity({ name: name.trim(), why: why.trim() || null });
          emit("toast", editing ? "Identity saved" : "Identity created");
          api.close();
        })
      );
      body.appendChild(sheetGhostButton("Cancel", () => api.close()));
    },
  });
}

function confirmDelete(ident, linked) {
  showSheet({
    title: `Delete “${ident.name}”?`,
    build(body, api) {
      const p = document.createElement("p");
      p.className = "font-body-sm text-body-sm text-on-surface-variant";
      p.textContent = linked.length
        ? `${linked.length} linked habit${linked.length === 1 ? "" : "s"} will survive. Choose where their votes go.`
        : "This identity has no linked habits.";
      body.appendChild(p);

      if (linked.length) {
        body.appendChild(
          sheetPrimaryButton("Move habits to…", () => {
            closeTopSheet();
            setTimeout(() => reassignSheet(ident), 320);
          })
        );
      }
      body.appendChild(
        sheetPrimaryButton("Unlink habits & delete", async () => {
          await repo.deleteIdentity(ident.id, null);
          emit("toast", "Identity deleted");
          api.close();
        })
      );
      body.appendChild(sheetGhostButton("Cancel", () => api.close()));
    },
  });
}

async function reassignSheet(deletedIdent) {
  const others = (await repo.getIdentities()).filter((i) => i.id !== deletedIdent.id);
  showSheet({
    title: "Move habits to",
    build(body, api) {
      if (!others.length) {
        const p = document.createElement("p");
        p.className = "font-body-sm text-body-sm text-on-surface-variant";
        p.textContent = "No other identities. Habits will be unassigned.";
        body.appendChild(p);
      }
      for (const ident of others) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "sheet-item";
        b.innerHTML = `<span class="material-symbols-outlined text-[20px] text-[#F6DBC0]">psychology</span><span>${escapeHtml(ident.name)}</span>`;
        b.addEventListener("click", async () => {
          await repo.deleteIdentity(deletedIdent.id, ident.id);
          emit("toast", `Deleted — habits moved to ${ident.name}`);
          api.close();
        });
        body.appendChild(b);
      }
      body.appendChild(
        sheetGhostButton("Cancel", () => api.close())
      );
    },
  });
}

function field(labelText, value, placeholder, onInput) {
  const wrap = document.createElement("label");
  wrap.className = "flex flex-col gap-1";
  const l = document.createElement("span");
  l.className = "font-label-md text-label-md text-on-surface-variant";
  l.textContent = labelText;
  const inp = document.createElement("input");
  inp.type = "text";
  inp.className = "glass-input";
  inp.value = value;
  inp.placeholder = placeholder;
  inp.addEventListener("input", () => onInput(inp.value));
  wrap.appendChild(l);
  wrap.appendChild(inp);
  return wrap;
}

function miniBtn(text, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "identity-mini";
  b.textContent = text;
  b.addEventListener("click", onClick);
  return b;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
