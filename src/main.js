// src/main.js — app boot: db -> repo -> state -> screens.
import "./styles/additions.css";
import * as repo from "./repo.js";
import { configureHaptics } from "./haptics.js";
import { initNav, initToast, setActiveTab } from "./ui/nav.js";
import { initToday, anySheetOpen, closeTopSheet } from "./ui/today.js";
import { anyScreenOpen, closeAllScreens, closeTopScreen } from "./ui/screens.js";
import { openStepper } from "./ui/stepper.js";
import { openHabitDetail } from "./ui/habit-detail.js";
import { initCalendar, showCalendar, hideCalendar, isCalendarOpen, refreshCalendar } from "./ui/calendar.js";
import { initInsights, showInsights, hideInsights, isInsightsOpen } from "./ui/insights.js";
import { initIdentity, showIdentity, hideIdentity, isIdentityOpen } from "./ui/identity.js";
import { initSettings, showSettings, hideSettings, isSettingsOpen, applyAccessibilitySettings } from "./ui/settings.js";
import { maybeShowOnboarding, isOnboardingOpen } from "./ui/onboarding.js";
import { emit, on } from "./state.js";
import { Capacitor } from "@capacitor/core";
import { initNotifications, syncNotifications } from "./notify.js";

let cachedSettings = {};
let notifyTimer = null;
let bootStage = "start"; // for the watchdog: which boot step are we in?

/** bound a promise: reject after ms so one hung native call can't stall boot */
function timeBox(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timed out: ${label} (${ms}ms)`)), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

/** debounce the reconcile so a burst of edits schedules once */
function scheduleReconcile() {
  clearTimeout(notifyTimer);
  notifyTimer = setTimeout(() => {
    syncNotifications().catch((e) => console.warn("[notify] reconcile failed", e));
  }, 800);
}

/** hide every non-Today tab screen (Today is the base layer) */
function hideAllTabScreens() {
  if (isCalendarOpen()) hideCalendar();
  if (isInsightsOpen()) hideInsights();
  if (isIdentityOpen()) hideIdentity();
  if (isSettingsOpen()) hideSettings();
}

async function boot() {
  bootStage = "database";
  await repo.initRepo();
  bootStage = "settings";
  cachedSettings = await repo.getSettings();
  configureHaptics(() => cachedSettings);
  applyAccessibilitySettings(cachedSettings);
  on("change", async ({ entity }) => {
    if (entity === "settings") {
      cachedSettings = await repo.getSettings();
      applyAccessibilitySettings(cachedSettings);
    }
  });

  bootStage = "screens";
  initNav();
  initToast();
  await initToday();
  initCalendar();
  initInsights();
  initIdentity();
  initSettings();

  // notifications: reconcile now, and again on every relevant data change.
  // Time-boxed + non-fatal: some devices hang on notification bridge calls,
  // and boot must proceed regardless (reminders are optional).
  bootStage = "notifications";
  try {
    await timeBox(initNotifications(), 5000, "notifications init");
  } catch (e) {
    console.warn("[main] notifications init skipped", e);
  }
  scheduleReconcile();
  on("change", ({ entity }) => {
    if (entity === "habits" || entity === "settings" || entity === "completions") scheduleReconcile();
  });

  // first run: onboarding overlay (dismissed by Get started / Skip)
  bootStage = "onboarding";
  await maybeShowOnboarding();

  // header entry points: avatar + bell both open Settings
  for (const id of ["header-settings", "header-bell"]) {
    document.getElementById(id)?.addEventListener("click", () => emit("navigate", { screen: "settings" }));
  }

  // Day rollover on resume is handled by initToday's visibilitychange check.

  // screen routing: the + button and "Edit habit" action emit 'navigate'
  on("navigate", async ({ screen, habitId }) => {
    if (screen === "new-habit") {
      openStepper(habitId ? await repo.getHabit(habitId) : null);
      return;
    }
    if (screen === "habit-detail") {
      if (habitId) openHabitDetail(habitId);
      return;
    }
    if (screen === "calendar") {
      closeAllScreens();
      hideAllTabScreens();
      await showCalendar();
      return;
    }
    if (screen === "insights") {
      closeAllScreens();
      hideAllTabScreens();
      await showInsights();
      return;
    }
    if (screen === "identity") {
      closeAllScreens();
      hideAllTabScreens();
      await showIdentity();
      return;
    }
    if (screen === "settings") {
      closeAllScreens();
      hideAllTabScreens();
      await showSettings();
      return;
    }
    if (screen === "today") {
      closeAllScreens(); // tabs are always reachable under overlays
      hideAllTabScreens();
      setActiveTab("today"); // e.g. arriving from a calendar day-tap
      return;
    }
  });

  // repo changes while the calendar is open -> refresh the visible view
  on("change", ({ entity }) => {
    if (entity === "habits" || entity === "completions") refreshCalendar(); // no-op when hidden
  });

  // Android hardware back: close sheets first, then let screens handle, then exit
  if (Capacitor.isNativePlatform()) {
    try {
      const { App } = await import("@capacitor/app");
      await timeBox(App.addListener("backButton", ({ canGoBack }) => {
        if (isOnboardingOpen()) return; // first-run modal owns the flow
        if (anySheetOpen()) {
          closeTopSheet();
          return;
        }
        if (anyScreenOpen()) {
          closeTopScreen();
          return;
        }
        if (isCalendarOpen() || isInsightsOpen() || isIdentityOpen() || isSettingsOpen()) {
          hideAllTabScreens();
          setActiveTab("today");
          return;
        }
        if (canGoBack) window.history.back();
        else App.exitApp();
      }), 4000, "backButton listener");
    } catch (e) {
      console.warn("[main] backButton listener unavailable", e);
    }
  }

  // dev-only demo data (also exposed in Settings -> Dev in DEV builds)
  if (import.meta.env.DEV) {
    const { loadDemoData } = await import("./dev/seed.js");
    window.__loadDevSeed = async () => {
      await loadDemoData();
    };
    console.info("[dev] run __loadDevSeed() to load the Stitch demo dataset");
  }

  bootStage = "done";
}

// Fail loudly: a WebView gives us no console, so a failed OR hung boot must
// surface on screen (with the failing stage) instead of a dead interface.
const bootWatchdog = setTimeout(() => {
  if (bootStage !== "done") showBootError(new Error(`startup stuck at "${bootStage}"`));
}, 8000);

boot()
  .then(() => clearTimeout(bootWatchdog))
  .catch((e) => showBootError(e));

function showBootError(e) {
  console.error("[main] boot failed", e);
  if (document.getElementById("boot-error")) return;
  const div = document.createElement("div");
  div.id = "boot-error";
  div.style.cssText =
    "position:fixed;left:10px;right:10px;bottom:10px;z-index:9999;background:#3a1420;color:#ffd7d7;" +
    "border:1px solid rgba(255,143,143,.55);border-radius:14px;padding:12px 14px;" +
    "font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;word-break:break-word;" +
    "box-shadow:0 10px 30px rgba(0,0,0,.55);";
  div.textContent =
    "⚠ Startup problem — please screenshot this:\n\n" + ((e && (e.stack || e.message)) || String(e));
  document.body.appendChild(div);
}
