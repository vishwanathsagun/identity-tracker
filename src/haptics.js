// src/haptics.js — haptic feedback, gated by the settings.haptics toggle.
// check-in = Medium, uncheck = Light, tab change = Selection, perfect day = Success.
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

// settings snapshot provider, injected by main.js (avoids circular imports)
let settingsProvider = () => ({});
export function configureHaptics(provider) {
  settingsProvider = provider;
}

function enabled() {
  try {
    return String(settingsProvider().haptics) !== "false";
  } catch {
    return true;
  }
}

async function safe(fn) {
  if (!Capacitor.isNativePlatform()) return; // no-op on web (preview)
  if (!enabled()) return;
  try {
    await fn();
  } catch (e) {
    // Haptics failing must never break the UI
  }
}

export function hapticCheck() {
  return safe(() => Haptics.impact({ style: ImpactStyle.Medium }));
}

export function hapticUncheck() {
  return safe(() => Haptics.impact({ style: ImpactStyle.Light }));
}

export function hapticTab() {
  return safe(() => Haptics.selectionChanged());
}

export function hapticPerfectDay() {
  return safe(() => Haptics.notification({ type: NotificationType.Success }));
}

export function hapticWarning() {
  return safe(() => Haptics.notification({ type: NotificationType.Warning }));
}
