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
  ice: {
    // Ice channels (a level's `ice` list): a faster surface beside some jumps.
    speedUp: 1.2,         // top speed on ice as a multiple of normal (1.2 = 20% faster)
    margin: 0.8,          // metres outside the drawn edge that still count as ice (forgiveness)
    linger: 0.5,          // seconds the speed-up keeps going after she leaves the ice
    fade: 0.25,           // seconds for the speed-up to come in, and to die away
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
    fov: 48,              // degrees
    height: 40,           // above the rider
    back: 17,             // how far downhill of its look point the camera sits
    lead: 13,             // look point this far downhill of the rider (more = see further ahead)
    followX: 0.75,        // how much the camera follows sideways (1 = locked)
    airTrack: 0.85,       // how much the camera aim rises with her in the air (1 = aims at her, 0 = at the ground)
    airLift: 1.0,         // zoom out: extra camera distance per metre of rider height
    airCentre: 0.55,      // metres she moves toward the middle of the screen per metre of height
    minLead: 3,           // never aim closer to her than this
    speedLead: 0.15,      // extra lead per m/s above 15
    smooth: 4,            // camera catch-up speed
  },
  race: {
    gatePenalty: 1,       // seconds added to a Race time for each missed gate
    gateHalfWidth: 2.4,   // half the gap between a gate's two poles (also where the poles are drawn)
    countdownStep: 0.7,   // seconds per count of 3-2-1 before a run
    finishCoast: 1.6,     // seconds she rides on after the line before the results appear
  },
  meter: {
    fillPer100: 2.5,      // percent of meter gained per 100 trick points
    chargedAt: 0.8,       // fraction of the meter at which the small bonuses start
    chargedJump: 1.1,     // charged (80%+) multipliers
    chargedAir: 1.06,
    chargedSpin: 1.15,
    adrenalineTime: 7,    // seconds adrenaline lasts once fired
    adrJump: 1.35,        // adrenaline multipliers
    adrAir: 1.15,
    adrSpin: 1.6,
    adrBoost: 2,
    crashLoss: 0.25,      // fraction of the meter lost in a crash
    readyBeat: 1.1,       // seconds per beat of the "adrenaline ready" pulse: the button's CSS pulse and the sound both use it
  },
  score: {
    spinBase: 100,        // points per half-turn
    spinGrowth: 0.1,      // each extra half-turn is worth this much more
    flipBase: 300,        // points for one flip
    flipGrowth: 1.25,     // multiplier per extra flip
    comboBonus: 1.5,      // spin and flip in the same air
  },
  scenery: {
    // Breakable signs and snowmen (js/data/scenery.js). A hit is a one-off speed cut.
    slowSign: 0.15,       // fraction of speed lost hitting a trail post, trail map or caution sign
    slowSmallSnowman: 0.2,// ...a small snowman
    slowBigSnowman: 0.25, // ...a big snowman
    riderRadius: 0.45,    // how close her centre must get to a piece's outline to hit it
  },
  stats: {
    // A rider stat of 1..10 scales its number between these two multipliers.
    low: 0.8,
    high: 1.2,
  },
  audio: {
    // Sound (js/audio.js). Levels are 0..1 gains, pitches in Hz, times in seconds.
    // ---- volumes
    master: 0.8,          // overall level before the player's volume setting
    volBoard: 0.9,        // board on snow, carving, braking, boost, deep snow
    volWind: 0.6,         // wind
    volImpacts: 0.9,      // take-off, landing, hitting things, crashes
    volTricks: 0.7,       // jump charge, spin and flip whooshes, trick blips
    volMeter: 0.6,        // charged shimmer, ready pulse, adrenaline
    volVoice: 0.7,        // the rider's voice
    volUi: 0.5,           // menu clicks, countdown, gates, finish, results
    maxVoices: 12,        // most one-shots playing at once; the quietest is dropped
    pauseDuck: 0.12,      // level of one-shots still ringing while paused
    fadeTime: 0.25,       // seconds the continuous layers take to fade in or out
    // ---- 1. board on snow: two speed bands
    boardSplit: 17,       // m/s where "slow cruise" hands over to "fast"
    boardBlend: 2,        // m/s over which the hand-over happens (small = a clearer change)
    boardTop: 32,         // m/s at which the fast band is at its loudest and brightest
    boardSlowLevel: 0.3,  // slow band loudness at the hand-over speed
    boardSlowCutoff: 520, // slow band: low-pass cutoff (soft hush)
    boardFastLevel: 0.42, // fast band loudness at the hand-over speed (rises to 1.4x at boardTop)
    boardFastCutoff: 2600,// fast band: centre brightness (bright roar)
    boardAdrBright: 1.45, // brightness multiplier while adrenaline runs
    boardAdrRate: 1.3,    // grain speed multiplier while adrenaline runs (a faster feel)
    // ---- 2. carving
    carveLevel: 0.5,      // edge scrape at full lock
    carveFreq: 3600,      // scrape pitch
    carveQ: 2.2,          // scrape harshness (filter sharpness)
    carvePan: 0.35,       // how far the scrape pans toward the carving side (0..1)
    carveMinSpeed: 9,     // m/s below which carving is nearly silent
    // ---- 3-5. brake, boost, deep snow
    brakeLevel: 0.65,     // braking spray
    brakeFreq: 1700,      // braking spray pitch
    boostLevel: 0.5,      // whoosh when boost starts
    boostTime: 0.5,       // whoosh length
    deepLevel: 0.55,      // muffled powder off the piste
    deepCutoff: 380,      // powder muffling (low-pass cutoff)
    deepBoardCut: 0.35,   // board sound kept while in deep snow
    edgeBumpLevel: 0.8,   // firm bump when the far edge pushes her back
    edgeBumpGap: 0.7,     // seconds before another bump can sound
    // ---- 6. wind
    windLevel: 0.4,       // wind at windTop on the ground
    windMinSpeed: 10,     // m/s at which wind starts
    windTop: 38,          // m/s for full ground wind
    windFreq: 650,        // wind centre pitch
    windPerMetre: 0.05,   // extra wind per metre above the snow
    windPerSecond: 0.25,  // extra wind per second of air time
    windAirMax: 0.6,      // most extra wind the air can add
    // ---- 7-11. jumps and tricks
    chargeLevel: 0.12,    // jump charge tone
    chargeLow: 220,       // charge tone pitch at the start of the hold
    chargeHigh: 660,      // charge tone pitch at full charge
    minAir: 0.12,         // seconds: an unpopped natural hop shorter than this makes no take-off or landing sound
    popLevel: 0.55,       // take-off pop at a tap
    popChargedGain: 0.7,  // extra pop loudness at full charge
    clackLevel: 0.7,      // wooden clack off a man-made kicker
    puffLevel: 0.55,      // snow puff off a natural roller or ledge
    spinLevel: 0.32,      // whoosh per 180 of spin
    flipLevel: 0.7,       // deeper whoosh per flip
    landLevel: 0.75,      // landing thump at landImpactFull
    landImpactFull: 12,   // m/s of downward speed for a full landing thump
    landSloppy: 0.25,     // misalignment (0..1) above which a landing sounds scrappy
    trickLevel: 0.4,      // trick landed blip
    trickNote: 660,       // blip's first note for the smallest trick
    trickTopValue: 3000,  // trick value that gets the highest, longest blip
    // ---- 12-17. meter and adrenaline
    chargedLevel: 0.35,   // shimmer at 80 %
    readyLevel: 0.18,     // ready pulse level for the first beats
    readyBeats: 4,        // beats at full level before the pulse settles
    readyQuiet: 0.3,      // ready pulse level after that, as a fraction of readyLevel
    readyNote: 523,       // ready pulse pitch
    surgeLevel: 0.6,      // adrenaline fired surge
    surgeTime: 1.1,       // surge length
    heartLevel: 0.45,     // heartbeat layer while adrenaline runs
    heartGap: 0.5,        // seconds per heartbeat (0.5 = 120 a minute)
    warnTime: 1.5,        // seconds before adrenaline ends that the warning starts
    warnLevel: 0.4,       // warning beeps
    warnGap: 0.25,        // seconds between warning beeps
    powerDownLevel: 0.45, // falling power down when adrenaline ends
    adrBoomLevel: 0.7,    // extra low boom on an adrenaline landing
    adrSparkleLevel: 0.25,// sparkle on an adrenaline landing
    // ---- 18-22. hitting things
    signLevel: 0.75,      // trail post, trail map, caution sign
    snowmanLevel: 0.8,    // snowman thud (big snowman is deeper)
    patterLevel: 0.25,    // falling snow chunks
    treeLevel: 0.9,       // tree thump and crack
    showerLevel: 0.4,     // snow shower off a tree
    fenceLevel: 0.65,     // fence slap and rattle
    tumbleLevel: 0.6,     // each thud of a crash tumble
    tumbleThuds: 4,       // thuds in a tumble
    tumbleGap: 0.2,       // seconds between tumble thuds
    respawnLevel: 0.45,   // soft whump on respawn
    // ---- 23-27. run flow
    countLevel: 0.45,     // 3-2-1 beeps
    countNote: 784,       // 3-2-1 pitch
    goNote: 1568,         // "go" pitch
    startLevel: 0.55,     // start gate release
    gateLevel: 0.4,       // gate passed tick
    gateMissLevel: 0.35,  // gate missed buzz
    finishLevel: 0.55,    // finish horn and chime
    stingLevel: 0.45,     // results stings
    // ---- 28. voice (each rider's own voice is in js/data/riders.js)
    voiceBigPop: 0.8,     // jump charge (0..1) that counts as a big pop
    voiceBigTrick: 600,   // trick value that counts as a big trick
    // ---- 29. menus
    clickLevel: 0.35,     // menu button click
    backLevel: 0.35,      // back button
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
