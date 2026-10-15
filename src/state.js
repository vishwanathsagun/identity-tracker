// src/state.js — lightweight store + event emitter.
// Screens subscribe and re-render when repo data changes.

const listeners = new Set();
const channelListeners = new Map(); // event -> Set<fn>

let state = {
  /** last time any repo data changed (epoch ms) */
  revision: 0,
  /** local day key currently rendered — screens re-render when this flips */
  activeDateKey: "",
};

export function getState() {
  return state;
}

/** merge a patch into state and notify subscribers */
export function setState(patch) {
  state = { ...state, ...patch };
  for (const fn of listeners) {
    try {
      fn(state);
    } catch (e) {
      console.error("[state] subscriber failed", e);
    }
  }
}

/** subscribe to ALL state changes; returns unsubscribe */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** named-channel event emitter (used for 'change', 'navigate', 'toast', ...) */
export function on(event, fn) {
  if (!channelListeners.has(event)) channelListeners.set(event, new Set());
  channelListeners.get(event).add(fn);
  return () => channelListeners.get(event)?.delete(fn);
}

export function off(event, fn) {
  channelListeners.get(event)?.delete(fn);
}

export function emit(event, payload) {
  const set = channelListeners.get(event);
  if (!set) return;
  for (const fn of set) {
    try {
      fn(payload);
    } catch (e) {
      console.error(`[state] '${event}' listener failed`, e);
    }
  }
}
