// Every gameplay number lives here. Nothing else in the game may hard-code a
// feel value. The debug panel (js/debug.js) edits these live and saves the
// changes on this device; "Copy changes" gives text to paste back into this file.
//
// Units: metres, seconds, radians unless the comment says otherwise.

export const DEFAULTS = {
  ride: {
    slopeAccel: 9,        // downhill pull at grade 1, pointing straight down the fall line
    drag: 0.016,          // air/snow drag, multiplied by speed squared (sets top speed)
    minSpeed: 7,          // braking and deep snow never take her below this
    maxHeading: 1.1,      // sharpest carve angle away from straight downhill
    turnRate: 6,          // how quickly the board swings to the steer angle (higher = snappier)
    boostAccel: 9,        // extra push while boost is held
    brakeDecel: 13,       // slow-down while brake is held
    deepSnowDrag: 4,      // drag multiplier off the piste
    edgePush: 6,          // how hard the far edge of the deep snow pushes her back (per metre)
    edgeWidth: 9,         // metres of deep snow before the hard edge
  },
  jump: {
    chargeTime: 0.45,     // seconds of holding jump for a full-power pop
    popMin: 4.5,          // upward speed from a tap
    popMax: 8.5,          // upward speed from a full charge
    launchScale: 0.62,    // how much of a ramp's upward throw is kept (1 = real physics)
    launchSharpness: 1.3, // how abruptly the ground must fall away before she leaves it
  },
  air: {
    gravity: 16,          // lower = floatier
    minAirForCallout: 0.7,// seconds in the air before a plain jump gets a call-out
  },
  spin: {
    tapImpulse: 4.2,      // spin speed added per key tap
    holdRate: 3.2,        // slow spin from simply holding the key
    maxRate: 13,          // fastest spin
    damping: 1.1,         // how fast spin dies away with no input
    touchGain: 1.0,       // rider radians per radian of finger circling
    landTolerance: 0.2,   // fraction of a half-turn forgiven on landing (0.2 = 36 degrees)
    maxHalves: 12,        // 12 half-turns = 2160
  },
  flip: {
    rate: 7.5,            // flip speed; one flip takes 2*pi / rate seconds
    landTolerance: 0.25,  // fraction of a flip forgiven on landing
  },
  touch: {
    steerRange: 70,       // pixels of thumb drag for full steer
    swipeDistance: 46,    // pixels of straight vertical travel that count as a flip swipe
    swipeTime: 0.28,      // ...within this many seconds
    circleStart: 0.9,     // radians of curved finger travel before spin starts counting
  },
  camera: {
    fov: 46,              // degrees
    height: 40,           // above the rider
    back: 17,             // how far downhill of its look point the camera sits
    lead: 17,             // look point this far downhill of the rider (more = see further ahead)
    followX: 0.75,        // how much the camera follows sideways (1 = locked)
    airLift: 1.6,         // extra camera height per metre of rider height
    airLead: 0.6,         // extra look-ahead per metre of rider height (keeps her and the landing in view)
    speedLead: 0.15,      // extra lead per m/s above 15
    smooth: 4,            // camera catch-up speed
  },
  stats: {
    // A rider stat of 1..10 scales its number between these two multipliers.
    low: 0.8,
    high: 1.2,
  },
};

const KEY = 'summit.tuning.v1';

function clone(o) { return JSON.parse(JSON.stringify(o)); }

export const T = clone(DEFAULTS);

// Apply this device's saved overrides ({ 'ride.drag': 0.02, ... }).
let overrides = {};
try { overrides = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { overrides = {}; }
for (const [path, v] of Object.entries(overrides)) {
  const [g, k] = path.split('.');
  if (T[g] && typeof DEFAULTS[g][k] === 'number' && typeof v === 'number') T[g][k] = v;
  else delete overrides[path];
}

export function setTuning(group, key, value) {
  T[group][key] = value;
  if (value === DEFAULTS[group][key]) delete overrides[`${group}.${key}`];
  else overrides[`${group}.${key}`] = value;
  try { localStorage.setItem(KEY, JSON.stringify(overrides)); } catch { /* storage unavailable */ }
}

export function resetTuning() {
  for (const g of Object.keys(DEFAULTS)) Object.assign(T[g], DEFAULTS[g]);
  overrides = {};
  try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}

export function changedTuning() { return { ...overrides }; }
