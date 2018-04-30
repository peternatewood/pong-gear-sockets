/*
+ Metal Gear reduced to pong controls
+ Catch and throw a grenade over the net
+ If you're hit by the grenade, or it enters your goal (explosives, missiles ?), you lose a life (no goals?)
+ Punch grenade to reflect; must be facing grenade; cannot move while punching
+ Use countdown to determine how long punch lasts
+ Powerups: box?, tranquilizer?
  - Slow Field: grenade is slower on your side of the field
  - Fast Field: grenade is faster on your side
  - Tranq Pistol: single-shot pistol temporarily puts opponent to sleep if it hits
*/
// Socket stuff
var socket = io();
socket.on("name", function(name) {
  console.log("Welcome %s!", name);
});

const TAU = 2 * Math.PI;
const LOAD_DELAY = 600;
var loadCountdown = LOAD_DELAY;
var scene = "title"; // title, game, gameover

var context = document.getElementById('canvas').getContext('2d');
context.lineJoin = "round";
context.lineWidth = 2;
context.textAlign = "center";
const SCREEN_W = context.canvas.width;
const SCREEN_H = context.canvas.height;

var titleX = SCREEN_W / -2;
var animateTitle = true;

var spritesheet = document.getElementById("spritesheet");
const SNAKE_W = 288 / 8;
const SNAKE_H = 192 / 3;
const TILE_SIZE = 32;
const MIN_X = new Uint16Array([
  TILE_SIZE + SNAKE_W / 2, // Player 1
  SCREEN_W / 2 + TILE_SIZE + SNAKE_W / 2 // Player 2
]);
const MAX_X = new Uint16Array([
  SCREEN_W / 2 - TILE_SIZE - SNAKE_W / 2, // Player 1
  SCREEN_W - SNAKE_W / 2 - TILE_SIZE // Player 2
]);
const MIN_Y = TILE_SIZE + SNAKE_H / 2;
const MAX_Y = SCREEN_H - TILE_SIZE - SNAKE_H / 2;
const PUNCH_DELAY = 480;

const PALETTE = [ "", "#FFF", "#000", "#214a4a", "#de946b" ];
var prerender = document.getElementById("prerender");
var preContext = prerender.getContext("2d");
// Prerender background
function prerenderField() {
  preContext.clearRect(0, 0, SCREEN_W, SCREEN_H);

  preContext.lineWidth = 2;
  preContext.strokeStyle = "#333";
  preContext.fillStyle = PALETTE[3];
  for (var r = 1; r < 7; r++) {
    preContext.fillRect(0, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    preContext.strokeRect(0, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    preContext.fillRect(SCREEN_W - TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    preContext.strokeRect(SCREEN_W - TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
  }
  // Goals
  for (var r = 7 * TILE_SIZE; r < 13 * TILE_SIZE; r += SNAKE_H) {
    preContext.drawImage(spritesheet, 5 * SNAKE_W, 2 * SNAKE_H, SNAKE_W, SNAKE_H, 0, r, SNAKE_W, SNAKE_H);
    preContext.drawImage(spritesheet, 5 * SNAKE_W, 2 * SNAKE_H, SNAKE_W, SNAKE_H, SCREEN_W - (SNAKE_W - 2), r, SNAKE_W, SNAKE_H);
  }
  for (var r = 13; r < 19; r++) {
    preContext.fillRect(0, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    preContext.strokeRect(0, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    preContext.fillRect(SCREEN_W - TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    preContext.strokeRect(SCREEN_W - TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
  }
  for (var c = 0; c < 32; c++) {
    preContext.fillRect(c * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE);
    preContext.strokeRect(c * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE);
    preContext.fillRect(c * TILE_SIZE, SCREEN_H - TILE_SIZE, TILE_SIZE, TILE_SIZE);
    preContext.strokeRect(c * TILE_SIZE, SCREEN_H - TILE_SIZE, TILE_SIZE, TILE_SIZE);
  }
  // Center separation lines
  preContext.beginPath();
  preContext.moveTo(SCREEN_W / 2 - 1.15 * TILE_SIZE, SCREEN_H - 2 * TILE_SIZE);
  preContext.arc(SCREEN_W / 2, SCREEN_H / 2, 2.5 * TILE_SIZE, 0.65 * Math.PI, 1.35 * Math.PI);
  preContext.lineTo(SCREEN_W / 2 - 1.15 * TILE_SIZE, 2 * TILE_SIZE);
  preContext.moveTo(SCREEN_W / 2 + 1.15 * TILE_SIZE, 2 * TILE_SIZE);
  preContext.arc(SCREEN_W / 2, SCREEN_H / 2, 2.5 * TILE_SIZE, 1.65 * Math.PI, 0.35 * Math.PI);
  preContext.lineTo(SCREEN_W / 2 + 1.15 * TILE_SIZE, SCREEN_H - 2 * TILE_SIZE);
  preContext.stroke();
  preContext.closePath();
}
prerenderField();
spritesheet.onload = prerenderField; // If the image hasn't loaded by this point, make sure to prerender when it does

// Prerender gameover
function prerenderGameover() {
  preContext.fillStyle = "#333";
  preContext.fillRect(0, 0, SCREEN_W, SCREEN_H);
  // Render remaining lives for winning player
  preContext.textAlign = "center";
  preContext.font = "72px Gugi";
  preContext.fillStyle = PALETTE[3];
  preContext.strokeStyle = PALETTE[1];
  preContext.lineWidth = 2;
  preContext.strokeText("Player " + (winner + 1) + " wins!", SCREEN_W / 2, SCREEN_H / 4);
  preContext.fillText("Player " + (winner + 1) + " wins!", SCREEN_W / 2, SCREEN_H / 4);
  preContext.font = "32px Gugi";
  preContext.strokeText("Remaining Lives: " + lives[winner], SCREEN_W / 2, SCREEN_H / 2);
  preContext.fillText("Remaining Lives: " + lives[winner], SCREEN_W / 2, SCREEN_H / 2);
  preContext.font = "24px monospace";
  preContext.fillStyle = PALETTE[1];
  preContext.fillText("Press any key to play again", SCREEN_W / 2, SCREEN_H * 0.75);
}

const SPAWN_CHANCE = 0.25;
const POWERUP_DELAY = 3000;
const POWERUP_RADIUS = 12;
const POWERUP_SIZE = 32;
const HALF_POWERUP_SIZE = POWERUP_SIZE / 2;
// No more than one powerup active at a time on each side of the field
// x, y, type, countdown
// Types: 0 = none, 1 = tranq, 2 = slow, 3 = fast
var powerups = new Uint16Array(8);
const MESSAGE_DELAY = 1000;
const POWERUP_MESSAGE_TEXT = [ "", "Tranquilizer!", "Slow Grenade!", "Fast Grenade!" ];
// type, countdown
var powerupMessages = new Uint16Array(4);
// x, y, state
// State: 0 => inactive, 1 => active, 2 => firing
var tranquilizers = new Uint16Array(6);
function updatePowerup(p) {
  // Set ranges for spawning
  const MIN_X = 2 * TILE_SIZE;
  const MAX_X = SCREEN_W / 2 - 2 * TILE_SIZE;
  const MIN_Y = 2 * TILE_SIZE;
  const MAX_Y = SCREEN_H - 2 * TILE_SIZE;

  if (powerups[4 * p + 3] === 0) {
    if (grenadeSpeeds[p] !== 2) {
      // If grenade speed powerup was active, deactivate it and reset the powerup spawn delay
      grenadeSpeeds[p] = 2;
      powerups[4 * p + 3] = POWERUP_DELAY;
    }
    else if (powerups[4 * p + 2] === 0) {
      // Decide whether to generate a powerup or not
      if (Math.random() < SPAWN_CHANCE) {
        powerups[4 * p] = (p * SCREEN_W / 2) + MIN_X + Math.random() * (MAX_X - MIN_X) >> 0;
        powerups[4 * p + 1] = MIN_Y + Math.random() * (MAX_Y - MIN_Y) >> 0;
        powerups[4 * p + 2] = (Math.random() * 3 >> 0) + 1; // Get number from 1 to 3 inclusive
        powerups[4 * p + 3] = POWERUP_DELAY / 2;
      }
      else {
        powerups[4 * p + 3] = POWERUP_DELAY;
      }
    }
    else {
      // Powerup expired
      powerups[4 * p + 2] = 0;
      powerups[4 * p + 3] = POWERUP_DELAY;
    }
  }

  powerups[4 * p + 3] -= DELTA_TIME;
  if (powerupMessages[2 * p + 1] !== 0) {
    powerupMessages[2 * p + 1] -= DELTA_TIME;
  }

  // Check for player collision
  if (powerups[4 * p + 2] !== 0) {
    // Rectangular collision detection
    if (players[4 * p] - SNAKE_W / 2 < powerups[4 * p] + HALF_POWERUP_SIZE && players[4 * p] + SNAKE_W / 2 > powerups[4 * p] - HALF_POWERUP_SIZE && players[4 * p + 1] - SNAKE_H / 2 < powerups[4 * p + 1] + HALF_POWERUP_SIZE && players[4 * p + 1] + SNAKE_H / 2 > powerups[4 * p + 1] - HALF_POWERUP_SIZE) {
      // Activate effect
      if (powerups[4 * p + 2] === 1) {
        // Tranquilizer
        tranquilizers[3 * p + 2] = 1;
        powerupMessages[2 * p] = 1;
        powerupMessages[2 * p + 1] = MESSAGE_DELAY;
      }
      else {
        // Speed modifier
        grenadeSpeeds[p] = powerups[4 * p + 2] === 3 ? 3 : 1;
        // Flash powerup message
        powerupMessages[2 * p] = powerups[4 * p + 2];
        powerupMessages[2 * p + 1] = MESSAGE_DELAY;
      }
      // Destroy powerup
      powerups[4 * p + 2] = 0;
      powerups[4 * p + 3] = POWERUP_DELAY;
    }
  }
}
function updateTranquilizer(p) {
  tranquilizers[3 * p] += p === 0 ? 2 : -2;
  var otherP = p === 0 ? 1 : 0;
  // Handle collisions
  if (tranquilizers[3 * p] >= SCREEN_W - TILE_SIZE || tranquilizers[3 * p] < TILE_SIZE) {
    // Hit the wall
    tranquilizers[3 * p + 2] = 0;
  }
  else if (tranquilizers[3 * p] > players[4 * otherP] - SNAKE_W / 2 && tranquilizers[3 * p] < players[4 * otherP] + SNAKE_W / 2 && tranquilizers[3 * p + 1] > players[4 * otherP + 1] - SNAKE_H / 2 && tranquilizers[3 * p + 1] < players[4 * otherP + 1] + SNAKE_H / 2) {
    // The tranquilizer's center is inside the player's hitbox
    asleep[otherP] = SLEEP_DELAY;
    tranquilizers[3 * p + 2] = 0;
  }
}
// Prerender powerups
var powerupsCanvas = document.getElementById("powerups");
var powerupsContext = powerupsCanvas.getContext("2d");
var preX, preY;
const TRANQUILIZER_PIXELS = new Uint8Array([
  2,2,2,2,2,2,2,2,2,0,0,
  2,3,1,1,1,3,3,2,3,2,0,
  2,3,3,3,3,3,3,3,3,2,0,
  0,2,2,2,2,2,3,0,3,2,0,
  0,0,0,0,0,0,2,3,3,3,2,
  0,0,0,0,0,0,0,2,3,3,2,
  0,0,0,0,0,0,0,2,3,3,2,
  0,0,0,0,0,0,0,0,2,2,2
]);
preX = 16 - 11;
preY = 0;
for (var i = 0; i < TRANQUILIZER_PIXELS.length; i++) {
  if (TRANQUILIZER_PIXELS[i] > 0) {
    powerupsContext.fillStyle = PALETTE[TRANQUILIZER_PIXELS[i]];
    // For player 1
    powerupsContext.fillRect(32 - (preX + 2 * (i % 11)), preY + 2 * (i / 11 >> 0), 2, 2);
    // For player 2
    powerupsContext.fillRect(preX + 2 * (i % 11), (preY + 2 * (i / 11 >> 0)) + 16, 2, 2);
  }
}
powerupsContext.font = "16px Gugi";
powerupsContext.textAlign = "center";
// Slow field
powerupsContext.beginPath();
powerupsContext.arc(48, 16, POWERUP_RADIUS, 0, TAU);
powerupsContext.lineWidth = 4;
powerupsContext.strokeStyle = "#000";
powerupsContext.stroke();
powerupsContext.lineWidth = 2;
powerupsContext.strokeStyle = "#3AF";
powerupsContext.stroke();
powerupsContext.closePath();
powerupsContext.strokeStyle = "#000";
powerupsContext.strokeText("S", 48, 22);
powerupsContext.fillStyle = "#3AF";
powerupsContext.fillText("S", 48, 22);
// Fast field
powerupsContext.beginPath();
powerupsContext.arc(80, 16, POWERUP_RADIUS, 0, TAU);
powerupsContext.lineWidth = 4;
powerupsContext.strokeStyle = "#000";
powerupsContext.stroke();
powerupsContext.lineWidth = 2;
powerupsContext.strokeStyle = "#C73";
powerupsContext.stroke();
powerupsContext.closePath();
powerupsContext.strokeStyle = "#000";
powerupsContext.strokeText("F", 80, 22);
powerupsContext.fillStyle = "#C73";
powerupsContext.fillText("F", 80, 22);

// Sound effects
var aContext;
if (typeof AudioContext === "undefined") {
  if (typeof webkitAudioContext === "undefined") {
    // TODO: If there's no way to play audio, provide a message of some kind
    aContext = false;
  }
  aContext = new webkitAudioContext();
}
else {
  aContext = new AudioContext();
}

var soundsVolume = 1;
// Adjust gain based on oscillator type; sawtooth and square tend to be more harsh
function calculateGain(f, type, sustain) {
  var gainMod;
  switch (type) {
    case 'sine':      gainMod = sustain ?  2 : 1; break;
    case 'triangle':  gainMod = sustain ?  3 : 1; break;
    case 'sawtooth':  gainMod = sustain ? 10 : 2; break;
    case 'square':    gainMod = sustain ? 11 : 3; break;
  }
  return soundsVolume * (Math.pow(1.05, f / -20) / gainMod);
}
// TODO: make these play-sound functions more DRY
function playPunchSound(p) {
  // In case browser doesn't support WebAudio API
  // or sounds are muted
  if (!aContext || aContext.muted) { return 0; }
  var t = aContext.currentTime;
  var o = aContext.createOscillator();
  var g = aContext.createGain();
  o.connect(g);
  g.connect(aContext.destination);
  var f = p == 0 ? 55 : 37;
  o.frequency.value = f;
  o.type = "square";
  g.gain.setValueAtTime(calculateGain(f, 'square'), t);
  g.gain.linearRampToValueAtTime(0, t + 0.2);
  o.start(t);
  o.stop(t + 0.2);
}
function playRicochetSound(p) {
  // In case browser doesn't support WebAudio API
  // or sounds are muted
  if (!aContext || aContext.muted) { return 0; }
  var t = aContext.currentTime;
  var o = aContext.createOscillator();
  var g = aContext.createGain();
  o.connect(g);
  g.connect(aContext.destination);
  var f = p == 0 ? 220 : 148;
  o.frequency.value = f;
  o.type = "square";
  g.gain.setValueAtTime(calculateGain(f, 'square'), t);
  g.gain.linearRampToValueAtTime(0, t + 0.2);
  o.start(t);
  o.stop(t + 0.2);
}
function playExplodeSound(p) {
  // In case browser doesn't support WebAudio API
  // or sounds are muted
  if (!aContext || aContext.muted) { return 0; }
  var t = aContext.currentTime;
  var o = aContext.createOscillator();
  var g = aContext.createGain();
  o.connect(g);
  g.connect(aContext.destination);
  var f = p == 0 ? 220 : 148;
  o.type = "square";
  var n = calculateGain(f, 'square');
  g.gain.setValueAtTime(n, t);
  g.gain.setValueAtTime(n, t + 0.3);
  g.gain.linearRampToValueAtTime(0, t + 0.4);
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(f / 4, t + 0.4);
  o.start(t);
  o.stop(t + 0.4);
}

// Music and audio controls
var music = document.getElementById("music");
music.pause(); // Just in case it's already playing for some reason
// Toggle mute on checkbox click
var muteMusic = document.getElementById("mute-music");
muteMusic.addEventListener("change", toggleMuteMusic);
function toggleMuteMusic() {
  music.muted = muteMusic.checked;
}
toggleMuteMusic();
var muteSounds = document.getElementById("mute-sounds");
muteSounds.addEventListener("change", toggleMuteSounds);
function toggleMuteSounds() {
  aContext.muted = muteSounds.checked;
}
toggleMuteSounds();
// Change music volume
var musicVolumeRange = document.getElementById("volume-music");
musicVolumeRange.addEventListener("input", updateMusicVolume);
function updateMusicVolume() {
  var volume = parseFloat(musicVolumeRange.value);
  if (typeof volume === "number" && !isNaN(volume)) {
    music.volume = volume;
  }
}
updateMusicVolume();
// Change sound volume
var soundsVolumeRange = document.getElementById("volume-sounds");
soundsVolumeRange.addEventListener("input", updateSoundsVolume);
function updateSoundsVolume() {
  var volume = parseFloat(soundsVolumeRange.value);
  if (typeof volume === "number" && !isNaN(volume)) {
    soundsVolume = volume;
  }
}
updateSoundsVolume();

const GOAL_W = TILE_SIZE;
const GOAL_H = 6 * TILE_SIZE;
// Upper left corners
var goals = new Uint16Array([
  0, 7 * TILE_SIZE,
  SCREEN_W - TILE_SIZE, 7 * TILE_SIZE
]);

const GRENADE_POINTS = new Uint8Array([
  0,0,1,1,2,
  0,2,3,2,1,
  2,3,2,3,2,
  2,3,2,3,2,
  3,3,3,3,3,
  2,3,2,3,2,
  0,2,3,2,0
]);
// Prerender grenade
var grenadeSprites = document.getElementById("grenade");
var grenadeContext = grenadeSprites.getContext("2d");
var x, y;
for (var i = 0; i < GRENADE_POINTS.length; i++) {
  if (GRENADE_POINTS[i] !== 0) {
    x = 2 * (i % 5);
    y = 2 * (i / 5 >> 0);
    grenadeContext.fillStyle = PALETTE[GRENADE_POINTS[i]];
    // Upright
    grenadeContext.fillRect(x + 2, y, 2, 2);
    // Clockwise
    grenadeContext.fillRect(y + 14, x + 2, 2, 2);
    // Upside down
    grenadeContext.fillRect(38 - x, 12 - y, 2, 2);
    // Counter-clockwise
    grenadeContext.fillRect(-y + 54, -x + 10, 2, 2);
  }
}

const GRENADE_SIZE = 12;
// x, y, xVel, yVel, frame counter, animation frame
var grenade = new Uint16Array(6);
// Speed on player 1 and 2's sides separately
var grenadeSpeeds = new Uint8Array(2);
var grenadeState = 0;
function isGrenadeInPlayer(p) {
  return players[4 * p] - SNAKE_W / 2 < grenade[0] + GRENADE_SIZE && players[4 * p] + SNAKE_W / 2 > grenade[0] && players[4 * p + 1] - SNAKE_H / 2 < grenade[1] + GRENADE_SIZE && players[4 * p + 1] + SNAKE_H / 2 > grenade[1];
}
function explodeGrenade(p) {
  // Schedule player to lose life
  lostPlayer = p;
  // Start grenade explosion animation
  grenadeState = 1;
  grenade[4] = 0;
  grenade[5] = 0;
  // Sound effect
  playExplodeSound(p);
  // Set players' sprites to stand
  spriteClips[0] = spriteClips[0] > 3 ? 4 : 0;
  spriteClips[2] = spriteClips[2] > 3 ? 4 : 0;
  // Stop music
  music.pause();
}
function handleGrenadeCollisions(p) {
  if (inputs[p].punch) {
    // Get distances from player
    var xDist = Math.abs(players[4 * p] - (grenade[0] + GRENADE_SIZE / 2));
    var yDist = Math.abs(players[4 * p + 1] - (grenade[1] + GRENADE_SIZE / 2));
    // Deflect grenade if close enough and player facing grenade
    var deflected = false;
    if (xDist < SNAKE_W && yDist < SNAKE_H) {
      if (yDist < SNAKE_H / 2 && spriteClips[2 * p] === 7) {
        if (grenade[0] < players[4 * p] && spriteClips[2 * p + 1] === 0) {
          // Grenade to the left, and player facing left
          grenade[2] = -1;
          deflected = true;
        }
        else if (grenade[0] > players[4 * p] && spriteClips[2 * p + 1] === 1) {
          // Grenade to the right, and player facing right
          grenade[2] = 1;
          deflected = true;
        }
      }
      else if (xDist < SNAKE_W / 2 && spriteClips[2 * p] === 3) {
        if (grenade[1] < players[4 * p + 1] && spriteClips[2 * p + 1] === 0) {
          // Grenade to the up, and player facing up
          grenade[3] = -1;
          deflected = true;
        }
        else if (grenade[1] > players[4 * p + 1] && spriteClips[2 * p + 1] === 1) {
          // Grenade to the down, and player facing down
          grenade[3] = 1;
          deflected = true;
        }
      }
    }
  }

  if (deflected) {
    // TODO: This conflicts with the punch sound too much, override punch sound?
    // playRicochetSound(p);
  }
  else {
    // Blow up grenade on player
    if (isGrenadeInPlayer(p)) {
      explodeGrenade(p);
    }
  }
}

const START_DELAY = 600;
var startCountdown;

const RESET_DELAY = 1000;
var resetCountdown = 0;

var head = document.getElementById("life-head");
// Prerender life head icon
var headContext = head.getContext("2d");
headContext.fillStyle = "#FFF";
headContext.fillRect(0, 2,14,12);
headContext.fillRect(2, 0,10,16);
headContext.fillStyle = "#000";
headContext.fillRect(2, 4, 2, 8);
headContext.fillRect(4, 2, 6, 2);
headContext.fillRect(4,12, 4, 2);
headContext.fillRect(4, 4, 8, 2);
headContext.fillRect(8, 6, 4, 4);
headContext.fillRect(8,10, 2, 2);
headContext.fillStyle = PALETTE[3];
headContext.fillRect(4, 6, 4, 2);
headContext.fillRect(6,10, 2, 2);
headContext.fillStyle = PALETTE[4];
headContext.fillRect(4, 8, 4, 2);
headContext.fillRect(4,10, 2, 2);
headContext = null;

const MAX_LIVES = 5;
var lives = new Uint8Array([ 5, 5 ]);
var lostPlayer, winner;
const PLAYER_FRAME_MAX = 180;
// x, y, xVel, yVel
var players = new Uint16Array(8);
const SLEEP_DELAY = 1000;
// Milliseconds for player being asleep
var asleep = new Uint16Array(2);
var playersFrames = new Uint16Array([ 0, 0 ]);
var punchCountdown = new Uint16Array([ 0, 0 ]);
// x, y for player 1 and 2
var spriteClips = new Uint8Array(4);
function updatePlayer(p) {
  if (asleep[p] > 0) {
    asleep[p] -= DELTA_TIME;
    playersFrames[p] += DELTA_TIME;
    if (playersFrames[p] >= PLAYER_FRAME_MAX) {
      playersFrames[p] -= PLAYER_FRAME_MAX;
    }
  }

  // Only move player if not asleep
  if (asleep[p] === 0) {
    // Only move player if not punching
    if (!inputs[p].punch) {
      players[4 * p] += players[4 * p + 2];
      if (players[4 * p] < MIN_X[p]) {
        players[4 * p] = MIN_X[p];
      }
      else if (players[4 * p] > MAX_X[p]) {
        players[4 * p] = MAX_X[p];
      }
      players[4 * p + 1] += players[4 * p + 3];
      if (players[4 * p + 1] < MIN_Y) {
        players[4 * p + 1] = MIN_Y;
      }
      else if (players[4 * p + 1] > MAX_Y) {
        players[4 * p + 1] = MAX_Y;
      }
      // Update sprite clip
      playersFrames[p] += DELTA_TIME;
      if (playersFrames[p] >= PLAYER_FRAME_MAX) {
        if (players[4 * p + 2]) {
          // Left/Right
          spriteClips[2 * p] = spriteClips[2 * p] === 5 ? 6 : 5;
        }
        else if (players[4 * p + 3]) {
          // Up/Down
          spriteClips[2 * p] = spriteClips[2 * p] === 1 ? 2 : 1;
        }
        playersFrames[p] -= PLAYER_FRAME_MAX;
      }
    }

    // Update punch countdown
    if (punchCountdown[p]) {
      var countdown = punchCountdown[p] - DELTA_TIME;
      if (countdown < 0) countdown = 0;
      punchCountdown[p] = countdown;

      if (inputs[p].punch && punchCountdown[p] <= PUNCH_DELAY / 2) {
        inputs[p].punch = false;
        // Change sprite clip
        spriteClips[2 * p] = spriteClips[2 * p] === 3 ? 0 : 4;
      }
    }
  }
}
// Handle input
var inputs = [ {}, {} ];
function handlePunch(p) {
  if (punchCountdown[p] === 0 && !inputs[p].punch) {
    inputs[p].punch = true;
    // Reflect grenade if close enough
    punchCountdown[p] = PUNCH_DELAY;
    updateSpriteClip(p, "punch", true);
    // Fire tranquilizer
    if (tranquilizers[3 * p + 2] === 1) {
      tranquilizers[3 * p] = players[4 * p] + SNAKE_W * (p * -1);
      tranquilizers[3 * p + 1] = players[4 * p + 1];
      tranquilizers[3 * p + 2] = 2;
    }
    // Sound effect
    playPunchSound(p);
  }
}
// TODO: update spriteClips more mathematically
function updateSpriteClip(p, action, keydown) {
  // Only update if grenade is live
  if (grenadeState === 0) {
    if (keydown) {
      switch (action) {
        case "up":
          if (players[4 * p + 2] === 0) {
            spriteClips[2 * p] = 1;
            spriteClips[2 * p + 1] = 0;
          }
          break;
        case "down":
          if (players[4 * p + 2] === 0) {
            spriteClips[2 * p] = 1;
            spriteClips[2 * p + 1] = 1;
          }
          break;
        case "left":
          spriteClips[2 * p] = 5;
          spriteClips[2 * p + 1] = 0;
          break;
        case "right":
          spriteClips[2 * p] = 5;
          spriteClips[2 * p + 1] = 1;
          break;
        case "punch":
          spriteClips[2 * p] = spriteClips[2 * p] < 4 ? 3 : 7;
          break;
      }
    }
    else {
      // We have to change the y-position of the spriteclip for certain key releases
      switch (action) {
        case "left":
          if (inputs[p].down) {
            spriteClips[2 * p + 1] = 1;
          }
          if (players[4 * p + 3]) {
            spriteClips[2 * p] = 1;
          }
          else {
            spriteClips[2 * p] = 4;
          }
          break;
        case "right":
          if (inputs[p].up) {
            spriteClips[2 * p + 1] = 0;
          }
          if (players[4 * p + 3]) {
            spriteClips[2 * p] = 1;
          }
          else {
            spriteClips[2 * p] = 4;
          }
          break;
        case "up":
        case "down":
          if (players[4 * p + 2]) {
            spriteClips[2 * p] = 4;
          }
          else {
            spriteClips[2 * p] = 0;
          }
          break;
      }
    }
  }
}
function updatePlayerVel(p, isKeydown) {
  var xVel = 0;
  var yVel = 0;
  if (inputs[p].up) {
    yVel--;
  }
  if (inputs[p].down) {
    yVel++;
  }
  if (inputs[p].left) {
    xVel--;
  }
  if (inputs[p].right) {
    xVel++;
  }
  // Stop player movement if punching
  if (inputs[p].punch) {
    if (players[4 * p + 2]) players[4 * p + 2] = 0;
    if (players[4 * p + 3]) players[4 * p + 3] = 0;
  }
  else {
    players[4 * p + 2] = xVel;
    players[4 * p + 3] = yVel;
  }
}
// Resets the field once a player loses a life
function resetField() {
  inputs[0].up    = false;
  inputs[0].down  = false;
  inputs[0].left  = false;
  inputs[0].up    = false;
  inputs[0].punch = false;

  inputs[1].up    = false;
  inputs[1].down  = false;
  inputs[1].left  = false;
  inputs[1].up    = false;
  inputs[1].punch = false;

  players[0] = MIN_X[0] + TILE_SIZE;
  players[1] = SCREEN_H / 2;
  players[2] = 0;
  players[3] = 0;

  players[4] = MAX_X[1] - TILE_SIZE;
  players[5] = SCREEN_H / 2;
  players[6] = 0;
  players[7] = 0;

  spriteClips[0] = 4;
  spriteClips[1] = 1;
  spriteClips[2] = 4;
  spriteClips[3] = 0;

  asleep[0] = 0;
  asleep[1] = 0;

  grenade[0] = SCREEN_W / 2 - GRENADE_SIZE / 2;
  grenade[1] = SCREEN_H / 2 - GRENADE_SIZE / 2;
  grenade[2] = 2 * (2 * Math.random() >> 0) - 1;
  grenade[3] = 2 * (2 * Math.random() >> 0) - 1;
  grenade[4] = 0;
  grenade[5] = 0;

  grenadeState = 0;
  grenadeSpeeds[0] = 2;
  grenadeSpeeds[1] = 2;

  powerups[2] = 0;
  powerups[3] = POWERUP_DELAY;
  powerups[6] = 0;
  powerups[7] = POWERUP_DELAY;

  tranquilizers[3] = 0;
  tranquilizers[5] = 0;

  powerupMessages[0] = 0;
  powerupMessages[1] = 0;
  powerupMessages[2] = 0;
  powerupMessages[3] = 0;

  startCountdown = START_DELAY;
  // Restart music
  if (scene === "game") {
    music.currentTime = 0;
    music.play();
  }
}
resetField();

function handleKeyDown(e) {
  switch (scene) {
    case "title":
      scene = "game";
      music.currentTime = 0;
      music.play();
      break;
    case "gameover":
      lives[0] = MAX_LIVES;
      lives[1] = MAX_LIVES;
      resetField();
      scene = "game";
      prerenderField();
      music.currentTime = 0;
      music.play();
      break;
  }

  if (!e.altKey && !e.ctrlKey && !e.metaKey) e.preventDefault();
  if (!e.repeat) {
    switch (e.key) {
      // Player 1
      case "w"          : inputs[0].up    = true; updateSpriteClip(0, "up", true); break;
      case "s"          : inputs[0].down  = true; updateSpriteClip(0, "down", true); break;
      case "a"          : inputs[0].left  = true; updateSpriteClip(0, "left", true); break;
      case "d"          : inputs[0].right = true; updateSpriteClip(0, "right", true); break;
      case "Tab": handlePunch(0); break;
      // Player 2
      case "ArrowUp"    : inputs[1].up    = true; updateSpriteClip(1, "up", true); break;
      case "ArrowDown"  : inputs[1].down  = true; updateSpriteClip(1, "down", true); break;
      case "ArrowLeft"  : inputs[1].left  = true; updateSpriteClip(1, "left", true); break;
      case "ArrowRight" : inputs[1].right = true; updateSpriteClip(1, "right", true); break;
      case ".": handlePunch(1); break;
    }
    updatePlayerVel(0, true);
    updatePlayerVel(1, true);
  }
}
function handleKeyUp(e) {
  switch (e.key) {
    // Player 1
    case "w"          : inputs[0].up    = false; updateSpriteClip(0, "up", false); break;
    case "s"          : inputs[0].down  = false; updateSpriteClip(0, "down", false); break;
    case "a"          : inputs[0].left  = false; updateSpriteClip(0, "left", false); break;
    case "d"          : inputs[0].right = false; updateSpriteClip(0, "right", false); break;
    case "Tab": break;
    // Player 2
    case "ArrowUp"    : inputs[1].up    = false; updateSpriteClip(1, "up", false); break;
    case "ArrowDown"  : inputs[1].down  = false; updateSpriteClip(1, "down", false); break;
    case "ArrowLeft"  : inputs[1].left  = false; updateSpriteClip(1, "left", false); break;
    case "ArrowRight" : inputs[1].right = false; updateSpriteClip(1, "right", false); break;
    case ".": break;
  }
  updatePlayerVel(0, false);
  updatePlayerVel(1, false);
}
document.addEventListener("keydown", handleKeyDown);
document.addEventListener("keyup", handleKeyUp);

const DELTA_TIME = 5;
const MAX_ACCUMULATION = 60;
var accumulator = DELTA_TIME;
var lastTimestamp = Date.now();
var frames = 0;

function frameStep(timestamp) {
  var now = Date.now();
  accumulator += now - lastTimestamp;
  // Limit accumulator in case user leaves tab, pauses execution in debugger, or something else
  if (accumulator > MAX_ACCUMULATION) accumulator = DELTA_TIME;
  lastTimestamp = now;

  switch (scene) {
    case "title":
      while (accumulator >= DELTA_TIME) {
        accumulator -= DELTA_TIME;

        if (animateTitle) {
          titleX += 8;
          if (titleX >= SCREEN_W / 2) {
            titleX = SCREEN_W / 2;
            animateTitle = false;
          }
        }
      }
      // Rendering
      context.clearRect(0, 0, SCREEN_W, SCREEN_H);
      context.fillStyle = "#000";
      context.fillRect(0, 0, SCREEN_W, SCREEN_H);
      // Title
      context.fillStyle = PALETTE[3];
      context.strokeStyle = PALETTE[4];
      context.font = "128px Fugaz One";
      context.fillText("Pong", titleX - 8, SCREEN_H / 2 - 112);
      context.strokeText("Pong", titleX - 8, SCREEN_H / 2 - 112);
      context.fillText("Gear", titleX + 8, SCREEN_H / 2);
      context.strokeText("Gear", titleX + 8, SCREEN_H / 2);

      if (!animateTitle) {
        context.font = "32px Gugi";
        context.fillStyle = PALETTE[4];
        context.fillText("Tactical Sports Action", SCREEN_W / 2, SCREEN_H / 2 + 64);

        context.font = "24px monospace";
        context.fillText("Punch the grenade to deflect it; if you", SCREEN_W / 2, SCREEN_H - 160);
        context.fillText("get hit or the grenade enters your goal, you lose a life", SCREEN_W / 2, SCREEN_H - 128);
        if (frames % 45 < 22) {
          context.fillText("Press any key to start", SCREEN_W / 2, SCREEN_H - 64);
        }

        // Controls
        context.fillText("Player 1", 160, SCREEN_H / 2 - 48);
        context.fillText("WASD: move", 160, SCREEN_H / 2);
        context.fillText("Tab: punch", 160, SCREEN_H / 2 + 28);

        context.fillText("Player 2", SCREEN_W - 160, SCREEN_H / 2 - 48);
        context.fillText("Arrow keys: move", SCREEN_W - 160, SCREEN_H / 2);
        context.fillText("Period (.): punch", SCREEN_W - 160, SCREEN_H / 2 + 28);
      }
      break;
    case "game":
      // Update loop
      while (accumulator >= DELTA_TIME) {
        accumulator -= DELTA_TIME;

        if (startCountdown !== 0) {
          startCountdown -= DELTA_TIME;
          if (startCountdown <= 0) {
            startCountdown = 0;
          }
        }
        else if (grenadeState === 0) {
          // Update players
          updatePlayer(0);
          updatePlayer(1);

          // Update grenade
          grenade[0] += grenadeSpeeds[grenade[0] / (SCREEN_W / 2) >> 0] * grenade[2];
          grenade[1] += grenadeSpeeds[grenade[0] / (SCREEN_W / 2) >> 0] * grenade[3];
          // Check whether grenade enters a goal
          if (grenade[0] < goals[0] + GOAL_W && grenade[1] > goals[1] && grenade[1] + GRENADE_SIZE < goals[1] + GOAL_H) {
            // Player 1 goal
            explodeGrenade(0);
          }
          else if (grenade[0] + GRENADE_SIZE > goals[2] && grenade[1] > goals[3] && grenade[1] + GRENADE_SIZE < goals[3] + GOAL_H) {
            // Player 2 goal
            explodeGrenade(1);
          }
          else {
            // Bounce off of walls
            var bounced = false;
            if (grenade[1] < TILE_SIZE) {
              grenade[1] = TILE_SIZE;
              grenade[3] = 1;
              bounced = true;
            }
            else if (grenade[1] > SCREEN_H - (GRENADE_SIZE + TILE_SIZE)) {
              grenade[1] = SCREEN_H - (GRENADE_SIZE + TILE_SIZE);
              grenade[3] = -1;
              bounced = true;
            }
            if (grenade[0] < TILE_SIZE) {
              grenade[0] = TILE_SIZE;
              grenade[2] = 1;
              bounced = true;
            }
            else if (grenade[0] > SCREEN_W - (GRENADE_SIZE + TILE_SIZE)) {
              grenade[0] = SCREEN_W - (GRENADE_SIZE + TILE_SIZE);
              grenade[2] = -1;
              bounced = true;
            }

            if (bounced) {
              playRicochetSound();
            }
          }

          // Handle collisions
          handleGrenadeCollisions(0);
          handleGrenadeCollisions(1);
        }

        if (resetCountdown !== 0) {
          resetCountdown -= DELTA_TIME;
          if (resetCountdown <= 0) {
            resetCountdown === 0;
            // Reduce player's lives and check whether player lost all lives
            if (--lives[lostPlayer] === 0) {
              music.pause();
              scene = "gameover";
              winner = 1 - lostPlayer;
              // Set winning player's spriteclip to running and losing player's spriteclip to standing
              if (lostPlayer === 0) {
                spriteClips[0] = 4;
                spriteClips[2] = 5;
              }
              else {
                spriteClips[0] = 5;
                spriteClips[2] = 4;
              }
              // Player 1 facing right, 2 facing left
              spriteClips[1] = 1;
              spriteClips[3] = 0;
              players[0] = 3 * TILE_SIZE;
              players[1] = SCREEN_H / 2;
              players[4] = SCREEN_W - (3 * TILE_SIZE);
              players[5] = SCREEN_H / 2;
              // Prerender background
              prerenderGameover();
            }
            // Reset grenade and player positions
            resetField();
          }
        }

        // Update grenade animation clip
        if (grenadeState !== 2) {
          grenade[4] += DELTA_TIME;
          if (grenade[4] === DELTA_TIME * 120) {
            grenade[4] = 0;
          }
          if (grenade[4] === DELTA_TIME * 30) {
            grenade[4] = 0;
            grenade[5] += grenadeState === 0 ? 14 : SNAKE_W;
            switch (grenadeState) {
              case 0:
                if (grenade[5] > 42) {
                  // Reset animation frame so it loops
                  grenade[5] = 0;
                }
                break;
              case 1:
                if (grenade[5] === SNAKE_W * 4) {
                  // End explosion animation
                  grenadeState = 2;
                  // Remove firing tranquilizers
                  if (tranquilizers[2] === 2) tranquilizers[2] = 0;
                  if (tranquilizers[5] === 2) tranquilizers[5] = 0;
                  // Start countdown to reset game
                  resetCountdown = RESET_DELAY;
                }
                break;
            }
          }
        }

        if (resetCountdown === 0) {
          // Update powerups
          updatePowerup(0);
          updatePowerup(1);
        }

        // Update tranquilizers
        if (tranquilizers[2] === 2) {
          updateTranquilizer(0);
        }
        if (tranquilizers[5] === 2) {
          updateTranquilizer(1);
        }
      }

      // Rendering
      context.clearRect(0, 0, SCREEN_W, SCREEN_H);
      // Render walls
      context.drawImage(prerender, 0, 0, SCREEN_W, SCREEN_H);

      // Render powerups
      if (powerups[2] === 1) {
        context.drawImage(powerupsCanvas, 0, 0, POWERUP_SIZE, HALF_POWERUP_SIZE, powerups[0] - HALF_POWERUP_SIZE, powerups[1] - HALF_POWERUP_SIZE, POWERUP_SIZE, HALF_POWERUP_SIZE);
      }
      else if (powerups[2] !== 0) {
        context.drawImage(powerupsCanvas, POWERUP_SIZE * (powerups[2] - 1), 0, POWERUP_SIZE, POWERUP_SIZE, powerups[0] - HALF_POWERUP_SIZE, powerups[1] - HALF_POWERUP_SIZE, POWERUP_SIZE, POWERUP_SIZE);
      }
      if (powerups[6] === 1) {
        context.drawImage(powerupsCanvas, 0, HALF_POWERUP_SIZE, POWERUP_SIZE, HALF_POWERUP_SIZE, powerups[4] - HALF_POWERUP_SIZE, powerups[5] - HALF_POWERUP_SIZE, POWERUP_SIZE, HALF_POWERUP_SIZE);
      }
      else if (powerups[6] !== 0) {
        context.drawImage(powerupsCanvas, POWERUP_SIZE * (powerups[6] - 1), 0, POWERUP_SIZE, POWERUP_SIZE, powerups[4] - HALF_POWERUP_SIZE, powerups[5] - HALF_POWERUP_SIZE, POWERUP_SIZE, POWERUP_SIZE);
      }
      // Render tranquilizers
      if (tranquilizers[2] === 1) {
        context.drawImage(powerupsCanvas, 0, 0, POWERUP_SIZE, HALF_POWERUP_SIZE, players[0] + SNAKE_W / 2, players[1] - HALF_POWERUP_SIZE / 2, POWERUP_SIZE, HALF_POWERUP_SIZE);
      }
      else if (tranquilizers[2] === 2) {
        context.fillStyle = "#FFF";
        context.fillRect(tranquilizers[0] - 2, tranquilizers[1] - 2, 4, 4);
      }
      if (tranquilizers[5] === 1) {
        context.drawImage(powerupsCanvas, 0, HALF_POWERUP_SIZE, POWERUP_SIZE, HALF_POWERUP_SIZE, players[4] - (SNAKE_W / 2 + POWERUP_SIZE), players[5] - HALF_POWERUP_SIZE / 2, POWERUP_SIZE, HALF_POWERUP_SIZE);
      }
      else if (tranquilizers[5] === 2) {
        context.fillStyle = "#FFF";
        context.fillRect(tranquilizers[3] - 2, tranquilizers[4] - 2, 4, 4);
      }

      // Render players
      context.drawImage(spritesheet, spriteClips[0] * SNAKE_W, spriteClips[1] * SNAKE_H, SNAKE_W, SNAKE_H, players[0] - SNAKE_W / 2, players[1] - SNAKE_H / 2, SNAKE_W, SNAKE_H);
      if (asleep[0]) {
        context.font = (16 + (asleep[0] % 200 < 100 ? 8 : 0)) + "px monospace";
        context.strokeStyle = "#000";
        context.fillStyle = "#FFF";
        context.strokeText("Z", players[0] + SNAKE_W / 2, players[1] - SNAKE_H / 2);
        context.fillText("Z", players[0] + SNAKE_W / 2, players[1] - SNAKE_H / 2);
      }
      context.drawImage(spritesheet, spriteClips[2] * SNAKE_W, spriteClips[3] * SNAKE_H, SNAKE_W, SNAKE_H, players[4] - SNAKE_W / 2, players[5] - SNAKE_H / 2, SNAKE_W, SNAKE_H);
      if (asleep[1]) {
        context.font = (16 + (asleep[1] % 200 < 100 ? 8 : 0)) + "px monospace";
        context.strokeStyle = "#000";
        context.fillStyle = "#FFF";
        context.strokeText("Z", players[4] + SNAKE_W / 2, players[5] - SNAKE_H / 2);
        context.fillText("Z", players[4] + SNAKE_W / 2, players[5] - SNAKE_H / 2);
      }

      // Render grenade
      if (grenadeState === 0) {
        context.drawImage(grenadeSprites, grenade[5], 0, 14, 14, grenade[0], grenade[1], 14, 14);
      }
      else if (grenadeState === 1) {
        // Explosion
        var width = grenade[5] < 3 * SNAKE_W ? SNAKE_W : 2 * SNAKE_W;
        context.drawImage(spritesheet, grenade[5], 2 * SNAKE_H, width, SNAKE_H, grenade[0] + GRENADE_SIZE / 2 - width / 2, grenade[1] + GRENADE_SIZE / 2 - SNAKE_H / 2, width, SNAKE_H);
      }

      // UI
      context.font = "16px Gugi";
      context.lineWidth = 4;
      context.strokeStyle = "#000";
      context.fillStyle = "#FFF";
      // Powerup messages
      if (powerupMessages[1] % 250 > 125) {
        context.strokeText(POWERUP_MESSAGE_TEXT[powerupMessages[0]], SCREEN_W / 4, SCREEN_H / 2 + 8);
        context.fillText(POWERUP_MESSAGE_TEXT[powerupMessages[0]], SCREEN_W / 4, SCREEN_H / 2 + 8);
      }
      if (powerupMessages[3] % 250 > 125) {
        context.strokeText(POWERUP_MESSAGE_TEXT[powerupMessages[2]], 0.75 * SCREEN_W, SCREEN_H / 2 + 8);
        context.fillText(POWERUP_MESSAGE_TEXT[powerupMessages[2]], 0.75 * SCREEN_W, SCREEN_H / 2 + 8);
      }
      // Lives
      context.strokeText("Player 1: ", 2.25 * TILE_SIZE, 22);
      context.fillText("Player 1: ", 2.25 * TILE_SIZE, 22);
      context.strokeText("Player 2: ", SCREEN_W / 2 + 2.25 * TILE_SIZE, 22);
      context.fillText("Player 2: ", SCREEN_W / 2 + 2.25 * TILE_SIZE, 22);
      // Lives as heads
      for (var i = 0; i < lives[0]; i++) {
        context.drawImage(head, 128 + i * head.width * 1.5, 8);
      }
      for (var i = 0; i < lives[1]; i++) {
        context.drawImage(head, SCREEN_W / 2 + 128 + i * head.width * 1.5, 8);
      }
      break;
    case "gameover":
      while (accumulator >= DELTA_TIME) {
        accumulator -= DELTA_TIME;

        // Animate player
        playersFrames[winner] += DELTA_TIME;
        if (playersFrames[winner] >= 180) {
          playersFrames[winner] -= 180;
          spriteClips[2 * winner] = spriteClips[2 * winner] === 5 ? 6 : 5;
        }
      }
      // Background
      context.drawImage(prerender, 0, 0);
      // Render players
      context.drawImage(spritesheet, spriteClips[0] * SNAKE_W, spriteClips[1] * SNAKE_H, SNAKE_W, SNAKE_H, players[0] - SNAKE_W / 2, players[1] - SNAKE_H / 2, SNAKE_W, SNAKE_H);
      context.drawImage(spritesheet, spriteClips[2] * SNAKE_W, spriteClips[3] * SNAKE_H, SNAKE_W, SNAKE_H, players[4] - SNAKE_W / 2, players[5] - SNAKE_H / 2, SNAKE_W, SNAKE_H);
      break;
  }

  frames++;
  if (frames === 17280) frames = 0; // 144 * 120

  // Pause recursion if the user leaves the tab
  if(!frameStart){var frameStart=timestamp}if(timestamp-frameStart<2000)window.requestAnimationFrame(frameStep);
}
window.requestAnimationFrame(frameStep);
