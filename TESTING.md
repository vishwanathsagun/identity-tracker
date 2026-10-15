# Violet Dusk Habits — Testing & Build Guide

Everything below was verified against this build. Sections marked ✅ were
executed and passed; sections marked ⚠️ could not be executed in this
environment and are covered by inspection or module-level tests instead.

---

## 1. Run locally (web)

```bash
npm install
npm run dev          # vite dev server, http://localhost:5173
```

The web build is a first-class test target: the same SQL and migrations run on
`@capacitor-community/sqlite` (Android) and `sql.js` WASM + localStorage (web).
Web state persists to `localStorage["violet-dusk.db.v1"]` (debounced ~150ms).

`npm run build` produces `dist/`, `npm run preview` serves it.

Dev-only helpers:

- `window.__loadDevSeed()` — replace all data with the Stitch demo dataset
  (same data as the "Load demo data" button in Settings → DEV).
- Settings → DEV section is only rendered in dev builds.

## 2. Build the Android APK

```bash
npm run build              # vite build -> dist/
npx cap sync android       # copies dist/ into android/app/src/main/assets/public/
export ANDROID_HOME="C:\Users\<you>\AppData\Local\Android\Sdk"   # Windows example
cd android
./gradlew assembleDebug
```

APK output: `android/app/build/outputs/apk/debug/app-debug.apk` (~19.6 MB).

Install on a device/emulator: `adb install -r <apk>`.

Notes:
- `cap sync` must run after every web build; parity between `dist/` and
  `android/app/src/main/assets/public/` is byte-for-byte (see §4).
- Native bits: `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM`, `VIBRATE`,
  `RECEIVE_BOOT_COMPLETED` in the manifest; `res/drawable/ic_stat_name.xml`
  monochrome status-bar icon; `capacitor.config.json` sets
  `LocalNotifications.iconColor: #7C5CFF`.

## 3. Automated checks

```bash
node scripts/verify-notify.mjs     # expected: "26 passed, 0 failed", exit 0
```

Loads the real `src/notify.js` (not a copy) with the real date/stats helpers
and asserts the pure notification planner: frequency & 14-day scheduling,
per-habit cap of 3/day, quiet hours `[start, end)` including midnight wrap and
boundary minutes, done/skip suppression, archived exclusion, tone copy rules,
daily-summary rules (today-only, skipped on perfect days, dropped after its
time), past-slot guard, and deterministic id space. Exit status is the test
result — do not filter it away.

## 4. QA pass — results for this build

All of the following were executed in a browser against the real repo
(dev server) and passed:

**Onboarding** ✅
- First run shows the 3-step overlay; "Get started" saves the display name,
  updates the greeting live, marks onboarding done; overlay never reappears;
  "Skip" path leaves defaults intact.

**Settings** ✅ (opened via header avatar **and** bell; exits via back button,
bottom-nav Today, and Android hardware back)
- Every control's effect is visible and **survives a page reload**:
  quiet hours (+ conditional from/until rows), daily summary (+ time row),
  reminder tone, week starts on (Monday/Sunday segmented), haptics,
  reduce motion (`<html class="reduce-motion">` applied on boot), reduce
  transparency (+ off/follow-system/always mode row).
- Display name → toast + live greeting update.
- Delete-all: sheet requires typing `DELETE` exactly (button disabled
  otherwise); Cancel verified; deletion itself is covered by module tests.
- Export → "Backup exported" toast. Import validates the file, shows counts,
  and replaces data in one transaction (module-level: export shape,
  5/5 invalid backups rejected, bad import throws with data untouched,
  import-of-own-export is an identical roundtrip: 7 habits / 436 completions /
  12 settings at time of test).
- DEV "Load demo data" sheet opens and cancels safely.

**Today / tabs / CRUD** ✅
- Completion toggle roundtrip: tally and pending counts change and restore.
- Calendar renders the real month grid (Oct 2026, 47 cells); Insights,
  Identity, Today all open/close and refresh via repo change events.
- Habit create (5-step stepper) appears on Today immediately; edit-mode
  "Delete forever" removes it (data returned to pre-test state).
- **Archive → Restore roundtrip** (see §5): archived habit leaves Today,
  appears under Identity → ARCHIVED, "Open" → detail → "Restore" brings it back.

**Console** ✅ clean — no errors or `[notify]`/`[settings]` warnings.

**APK packaging** ✅
- `vite build` 0 → `cap sync` 0 → `gradlew assembleDebug` 0, BUILD SUCCESSFUL.
- `dist/` ↔ `android/app/src/main/assets/public/` byte-identical (`diff -r`).
- Merged manifest contains the four permissions and both notification
  receivers; status-bar icon resource present; bundle contains the settings /
  onboarding / gate strings shipped that pass.

## 5. Bugs found and fixed during QA

1. **Archived habits were unreachable** — `repo.getHabits({ includeArchived })`
   had no UI consumer, so the detail screen's "Restore" action was dead code.
   Fix: the Identity screen now lists an `ARCHIVED (n)` section (tap →
   detail → Restore). Verified roundtrip.
2. **`habitRow` promised a detail link it never had** — with no identity
   picker it rendered static "linked" text. Archived rows now get an explicit
   "Open" button; other rows are unchanged.
3. (Step 7) `changed("all")` emitted one event no screen listened to; it now
   fans out per entity so import/delete-all refreshes every screen.
4. **On-device boot had no failure path** — the web QA passed but a native-only
   failure (SQLite plugin) could kill `boot()` silently, leaving a dead
   interface (reported from a real phone). Fixes:
   - `db.js` is now native-first with a 6s timeout and a **transparent fallback
     to the in-app sql.js driver** (query routing follows the driver that
     actually opened, not the platform flag), so the app works even if the
     native plugin fails or hangs.
   - `main.js` boot now has an **8s watchdog and an on-screen error panel**
     showing the exact error and failing stage — a WebView has no visible
     console, so failures must surface in the UI.
5. **On-device: bridge errors + "Get started" trap (real-phone reports)** — two
   screenshots from a physical device: (a) the red startup panel showing an
   un-message'd error from `win.androidBridge.onmessage`/`returnResult` (a
   native plugin call rejecting mid-boot), and (b) onboarding stuck forever on
   the name step after tapping "Get started". Root causes and fixes:
   - `db.js` previously only guarded the native **open**; any later native
     call rejection still killed boot. Now every native call is wrapped:
     the **first mid-flight failure permanently demotes to the in-app driver**
     (`demoteNative` closes the native connection, boots sql.js, applies
     migrations if the web driver hasn't had them, and retries the failed op
     there). Transactions detect a mid-transaction demotion.
   - `onboarding.finish()` awaited `repo.setSettings` unguarded and then
     awaited `syncNotifications()` — a rejection OR a hung permission bridge
     call meant `closeOnboarding()` never ran (the exact "can't move past this
     page" report). Now: save guarded, overlay closes **before** any native
     work, reminder setup runs detached and time-boxed (5s).
   - `notify.js` `syncNotifications` is time-boxed (20s) around the whole
     native section, so one hung bridge call can't leave `reconciling` stuck
     true and wedge every future reconcile.
   - `main.js` time-boxes `initNotifications` (5s, non-fatal — reminders are
     optional) and the backButton listener (4s) so a hung plugin can no longer
     stall boot at a stage.
   Verified: production bundle boots clean in a browser, fresh-install
   onboarding → name → "Get started" closes the overlay, persists the name,
   survives reload without re-showing onboarding, zero console errors, no
   watchdog panel through the 8s+ window.
## 6. Known limitations

- ⚠️ **No emulator/device in this environment**: native runtime behavior —
  the notification permission prompt, scheduled/quiet-hours delivery, shade
  action buttons (`mark_done` / `later_today`), tap-to-open, and
  boot/resume reconcile — is verified by code inspection, the pure-planner
  harness, and APK packaging, not by execution on Android. If anything still
  fails on a device, the app now shows a red **on-screen startup panel** with
  the exact error/stage — screenshot it and that pins the cause.
- ⚠️ Export's browser download step (blob + anchor click) and the import file
  picker cannot be automated here; the data layer behind both is covered by
  module-level tests (§3, §4).
- The web driver is for development/preview only; production data lives in
  the native SQLite file — **unless** the native driver fails on the device,
  in which case the app silently continues on in-app storage (console error
  `[db] native driver failed`) rather than bricking; reinstalling on a
  healthy device restores native storage. The exact native root cause on the
  reported phone is inferred by elimination (no device here to reproduce);
  the on-screen panel remains the instrument for pinning it.
- One habit ("Morning Hydration & Sunlight") sits in ARCHIVED from testing
  that predates this session; leave or restore it as you like.

## 7. Additions list

Relative to the frozen Stitch prototype (`code.html`) and template scaffold:

**Template (unchanged origin)** — `code.html`, `DESIGN.md`, `screen.png`,
`package.json`, `vite.config.mjs`, `tailwind.config.js`, `postcss.config.js`,
`src/styles/main.css` (generated), `scripts/vendor-fonts.mjs`,
`public/fonts/`, Android project scaffold under `android/`.

**Added — core**

| File | Role |
| --- | --- |
| `src/main.js` | Boot (db → repo → screens), routing, hardware back, reconcile hooks |
| `src/state.js` | Tiny event bus (`emit`/`on`) |
| `src/db.js` | SQLite driver split + versioned migrations (native SQLite / web sql.js) |
| `src/repo.js` | Data access, settings cache, backup export/import, delete-all, change fan-out |
| `src/date.js` | Day keys, week math, time↔minutes helpers |
| `src/stats.js` | Scheduling, streaks, consistency score/chips |
| `src/notify.js` | Pure notification planner + native scheduler reconcile |
| `src/haptics.js` | Capacitor Haptics wrapper honoring the haptics setting |
| `src/dev/seed.js` | Stitch demo dataset |

**Added — UI** (`src/ui/`): `today.js`, `habit-card.js`, `nav.js`, `sheets.js`,
`screens.js` (stacked overlay screens), `stepper.js` (5-step habit create/edit),
`habit-detail.js`, `calendar.js`, `insights.js`, `identity.js`, `settings.js`,
`onboarding.js`.

**Added — styling/assets/config**: `src/styles/additions.css` (all glass UI on
top of the DESIGN.md tokens), `scripts/verify-notify.mjs`,
`capacitor.config.json` (app id `app.violetdusk.habits`, notification icon
color), `index.html` rewritten as the app shell (header with bell/avatar,
bottom-nav dock, Today sections), `android/app/src/main/res/drawable/ic_stat_name.xml`,
notification permissions + receivers in `AndroidManifest.xml`,
`public/assets/sql-wasm.wasm` (web driver), vendored fonts.
