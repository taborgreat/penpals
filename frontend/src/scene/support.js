// Whether this device shows ink as the scene, or the flat look (the record's own
// image): the flat look when WebGL2 is not there, when the viewer asks for less
// motion, when saving data or power, or when they chose it. Remembered per
// device (a convenience only).

const KEY = 'penpals:view';
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
