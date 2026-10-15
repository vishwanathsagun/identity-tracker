// src/dev/seed.js — the ORIGINAL Stitch demo dataset, mapped to the real schema.
// Dev-only: exposed via a hidden "Load demo data" path (Settings button in Step 7,
// window.__loadDevSeed() in dev builds). Never bundled into production behavior.

import * as repo from "../repo.js";
import { addDays, dateKey, localTimestamp, todayKey } from "../date.js";

// cue_time drives grouping + reminders; stack_anchor/cue_place render the cue line.
export const DEMO_HABITS = [
  {
    name: "Morning Hydration & Sunlight",
    icon: "water_drop",
    colorKey: "peach",
    cueTime: "07:00",
    cuePlace: "Kitchen & Balcony",
    cueIcon: "schedule",
    stackAnchor: "After waking up",
    twoMinVersion: "Drink 1 glass of water",
    target: 0.94,
  },
  {
    name: "10-Min Mindful Breath",
    icon: "self_improvement",
    colorKey: "mauve",
    cueTime: "07:45",
    cuePlace: "Living room cushion",
    cueIcon: "event_seat",
    stackAnchor: "After coffee",
    twoMinVersion: "Sit & take 3 deep breaths",
    target: 0.88,
  },
  {
    name: "Deep Work Session",
    icon: "electric_bolt",
    colorKey: "peach",
    cueTime: "13:30",
    cuePlace: "Standing desk",
    cueIcon: "laptop_mac",
    stackAnchor: "After lunch",
    twoMinVersion: "Open notes & write 1 sentence",
    target: 0.91,
  },
  {
    name: "Brisk Walk or Stretch",
    icon: "directions_walk",
    colorKey: "mauve",
    cueTime: "15:30",
    cuePlace: "Outdoors or porch",
    cueIcon: "park",
    stackAnchor: null,
    twoMinVersion: "Put shoes on & step outside",
    target: 0.79,
  },
  {
    name: "Read 10 Pages",
    icon: "menu_book",
    colorKey: "plum",
    cueTime: "21:30",
    cuePlace: "Bedside lamp",
    cueIcon: "bedtime",
    stackAnchor: "Before bed",
    twoMinVersion: "Open book to page 1",
    target: 0.85,
  },
  {
    name: "Digital Sunset",
    icon: "nightlight",
    colorKey: "peach",
    cueTime: "22:00",
    cuePlace: "Living room dock",
    cueIcon: "phone_iphone",
    stackAnchor: null,
    twoMinVersion: "Plug phone across room",
    target: 0.72,
  },
];

// deterministic PRNG so the demo history (and consistency chips) are stable
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export async function loadDemoData() {
  const today = todayKey();
  const created = localTimestamp(new Date(addDays(today, -84)));
  const ids = [];
  for (let i = 0; i < DEMO_HABITS.length; i++) {
    const d = DEMO_HABITS[i];
    ids.push(
      await repo.createHabit({
        name: d.name,
        icon: d.icon,
        colorKey: d.colorKey,
        cueTime: d.cueTime,
        cuePlace: d.cuePlace,
        cueIcon: d.cueIcon,
        stackAnchor: d.stackAnchor,
        twoMinVersion: d.twoMinVersion,
        frequencyType: "daily",
        frequencyDays: [0, 1, 2, 3, 4, 5, 6],
        reminderTimes: [],
        createdAt: created,
      })
    );
  }

  // history: ~12 weeks at each habit's target rate, then the exact demo week shape:
  //   2 days ago = perfect (peach dot), yesterday = partial (mauve dot: 4-6 done),
  //   today = habits 1-3 done (3/6, 50% ring) — and NO never-miss-twice nudge.
  for (let i = 0; i < ids.length; i++) {
    const rand = lcg(1000 + i * 7919);
    for (let back = 84; back >= 3; back--) {
      if (rand() < DEMO_HABITS[i].target) {
        await repo.setCompletion(ids[i], addDays(today, -back), "done");
      }
    }
  }
  for (const i of [0, 1, 2, 3, 4, 5]) await repo.setCompletion(ids[i], addDays(today, -2), "done"); // perfect day
  for (const i of [3, 4, 5]) await repo.setCompletion(ids[i], addDays(today, -1), "done"); // partial day
  for (const i of [0, 1, 2]) await repo.setCompletion(ids[i], today, "done"); // today: 3 of 6

  return { habitIds: ids, habits: await repo.getHabits(), date: dateKey() };
}
