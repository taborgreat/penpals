// The page's one ear (world.md): the being's, on its head. Sounds are heard from the moment a gesture
// lets the page play them (startSound); before, and in silence, nothing runs. An event heard wakes the
// ear's clock; two seconds with nothing, it stops (silence costs nothing).
//   hear(event)   (sound/ear.js's events: t on now()'s clock)     earAt(pose)   startSound()
//   roomIs(acoustics | null)   the room the ear is in (sound/room.js acoustics)
//   spaceIs(key | null)        whose space it is (its key: matter's music, sound/music.js)
//   bedIs(name, bands | null)  a sound that lasts, heard all about
//   weatherIs(weather | null)  the weather's rain and wind (law/weather.js), as heard where the ear is
import { createEar } from './ear.js';
import { createAudioOut } from './audio.js';
import { weatherBeds } from './weather.js';

export const now = () => performance.now() / 1000;
let out = null;
let ear = null;
let pose = null;
let room = null;
let space = null;
let timer = 0;
let quiet = 0;
function tick() {
  const r = ear.frame(now(), 0.03);
  quiet = r.idle ? quiet + 1 : 0;
  if (quiet > 100) {
    clearInterval(timer); // two seconds with nothing to sound
    timer = 0;
  }
}
export function hear(e) {
  if (!ear) return; // (no gesture yet: the page may not play)
  ear.hear(e);
  if (!timer) timer = setInterval(tick, 20);
}
export const earAt = (p) => {
  pose = p;
  ear?.head(p);
  out?.head(p);
};
export const roomIs = (ac) => {
  room = ac;
  ear?.room(ac);
};
export const spaceIs = (key) => {
  space = key;
  ear?.space(key);
};
export const bedIs = (name, bands) => out?.bed(name, bands);
export function weatherIs(w) {
  if (!out) return;
  const beds = w && pose ? weatherBeds(w, pose, room) : { rain: null, wind: null };
  out.bed('rain', beds.rain);
  out.bed('wind', beds.wind);
}
export const listening = () => !!ear;
export function startSound() {
  if (out || typeof AudioContext === 'undefined') return;
  out = createAudioOut();
  ear = createEar({ out, rate: out.rate }); // (grains at the audio's own rate)
  if (pose) earAt(pose);
  if (room) ear.room(room);
  ear.space(space);
  out.start();
}
