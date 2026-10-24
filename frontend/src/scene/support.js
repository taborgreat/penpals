// Whether this device shows ink as the scene, or the flat look (the record's own
// image): the flat look when WebGL2 is not there, when the viewer asks for less
// motion, when saving data, on low power, or when they chose it. Remembered per
// device (a convenience only).
import { useSyncExternalStore } from 'react';

const KEY = 'penpals:view';

// Low power: on battery and nearly out (LOW_BATTERY or less), where the browser
// tells (the Battery Status API: Chromium; others keep the scene). Systems start
// saving power about there, and the scene draws every frame while it moves and
// at night, so it stands down to the flat look until the device charges.
export const LOW_BATTERY = 0.2;
let lowPower = false;
const lowListeners = new Set();
export function watchBattery(nav = typeof navigator === 'undefined' ? null : navigator) {
  if (!nav?.getBattery) return Promise.resolve(false);
  return nav.getBattery().then(
    (b) => {
      const update = () => {
        const low = !b.charging && b.level <= LOW_BATTERY;
        if (low === lowPower) return;
        lowPower = low;
        for (const fn of lowListeners) fn();
      };
      update();
      b.addEventListener('chargingchange', update);
      b.addEventListener('levelchange', update);
      return true;
    },
    () => false,
  );
}
watchBattery();
export const isLowPower = () => lowPower;
// Low power as React state: a view goes flat while it lasts, and back after.
export function useLowPower() {
  return useSyncExternalStore(
    (fn) => {
      lowListeners.add(fn);
      return () => lowListeners.delete(fn);
    },
    isLowPower,
    () => false,
  );
}

let webgl2 = null;

function hasWebgl2() {
  if (webgl2 !== null) return webgl2;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    webgl2 = !!gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webgl2 = false;
  }
  return webgl2;
}

export function sceneSupported() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  if (navigator.connection?.saveData) return false;
  if (lowPower) return false;
  return hasWebgl2();
}

export function viewChoice() {
  try {
    return localStorage.getItem(KEY) ?? 'scene';
  } catch {
    return 'scene';
  }
}
export function setViewChoice(v) {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    // private mode: not remembered
  }
}

// The scene is shown when the device can and the viewer has not chosen the flat look.
export const sceneOn = () => sceneSupported() && viewChoice() !== 'flat';

// Phones: a lower resolution and a frame cap.
export const isPhone = () => typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches ?? false) && Math.min(window.innerWidth, window.innerHeight) < 700;
