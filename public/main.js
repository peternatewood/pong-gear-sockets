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
var debug = true;
var debugInput = document.getElementById("debug");
debugInput.value = "";

const TAU = 2 * Math.PI;
const LOAD_DELAY = 600;
var loadCountdown = LOAD_DELAY;
var scene = "title"; // title, lobby, game, gameover
const LOBBY_OPTIONS = [ "join game", "create game", "vs bot" ];
var lobbyCursor = 0;
var gamesAvailable = false;
var waitingForPlayer = false;

// Socket stuff
var playerNum, playerName, rerolls;
var names = [ "", "" ];
var socket = io();
socket.on("welcome", function(data) {
  debugInput.value = "Welcome " + data.name + "!";
  playerName = data.name;
  rerolls = data.rerolls;
  gamesAvailable = data.gamesAvailable;
  if (!gamesAvailable) {
    lobbyCursor = 1;
  }
});

socket.on("player num", function(num) {
  playerNum = num;
});
socket.on("game created", function(num) {
  debugInput.value = "Created game, waiting for player... ";
  playerNum = num;
});

socket.on("games available", function() {
  gamesAvailable = true;
});
socket.on("no games available", function() {
  gamesAvailable = false;
});

socket.on("new name", function(data) {
  playerName = data.name;
  rerolls = data.rerolls;
});
socket.on("reroll limit", function(msg) {
  debugInput.value = msg;
});

socket.on("change scene", function(s) {
  scene = s;
  switch (scene) {
    case "lobby":
      // Prerender lobby?
      if (titleX < SCREEN_W / 2) {
        titleX = SCREEN_W / 2;
      }
      if (!animateTitle) {
        animateTitle = true;
      }
      lobbyCursor = gamesAvailable ? 0 : 1;
      break;
    case "game":
      music.play();
      prerenderField();
      break;
    case "gameover":
      prerenderGameover();
      break;
  }
});

socket.on("start game", function(playerNames) {
  console.log("start game, %d", playerNum);
  debugInput.value = playerNames.join(" vs ");
  names[0] = playerNames[0];
  names[1] = playerNames[1];
  waitingForPlayer = false;
  prerenderField();
  scene = "game";
});
socket.on("start bot match", function(botName) {
  playerNum = 0;
  console.log("start game, %d", playerNum);
  debugInput.value = playerName + " vs " + botName;
  names[0] = playerName;
  names[1] = botName;
  waitingForPlayer = false;
  prerenderField();
  scene = "game";
});
socket.on("rematch", function(gameData) {
  console.log("rematch, %d", playerNum);
  debugInput.value = names.join(" vs ");
  prerenderField();
  scene = "game";
});

socket.on("game exists", function(msg) {
  debugInput.value = msg;
});

socket.on("update", function(gameData) {
  players         = gameData.players;
  lives           = gameData.lives;
  spriteClips     = gameData.spriteClips;
  asleep          = gameData.asleep;
  grenade         = gameData.grenade;
  grenadeState    = gameData.grenadeState;
  grenadeSpeeds   = gameData.grenadeSpeeds;
  powerups        = gameData.powerups;
  tranquilizers   = gameData.tranquilizers;
  powerupMessages = gameData.powerupMessages;
  startCountdown  = gameData.startCountdown;

  if (gameData.scene === "gameover") {
    scene = "gameover";
    winner = gameData.winner;
    lostPlayer = gameData.lostPlayer;
    prerenderGameover();
  }
});

socket.on("wants rematch", function(num) {
  console.log("Wants rematch!");
  spriteClips[2 * num] = 7;
});
socket.on("opponent disconnected", function() {
  scene = "lobby";
  lobbyCursor = gamesAvailable ? 0 : 1;
  socket.emit("opponent disconnected");
});

var context = document.getElementById('canvas').getContext('2d');
context.lineJoin = "round";
context.lineWidth = 2;
context.textAlign = "center";
const SCREEN_W = context.canvas.width;
const SCREEN_H = context.canvas.height;

var titleX = SCREEN_W / -2;
var titleY = SCREEN_H / 2;
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
  preContext.strokeText(names[winner] + " wins!", SCREEN_W / 2, SCREEN_H / 4);
  preContext.fillText(names[winner] + " wins!", SCREEN_W / 2, SCREEN_H / 4);
  preContext.font = "32px Gugi";
  preContext.strokeText("Remaining Lives: " + lives[winner], SCREEN_W / 2, SCREEN_H / 2);
  preContext.fillText("Remaining Lives: " + lives[winner], SCREEN_W / 2, SCREEN_H / 2);
  preContext.font = "24px monospace";
  preContext.fillStyle = PALETTE[1];
  preContext.fillText("Press spacebar to rematch " + names[(playerNum + 1) % 2], SCREEN_W / 2, SCREEN_H * 0.7);
  preContext.fillText("Press \"r\" to return to the lobby", SCREEN_W / 2, SCREEN_H * 0.8);
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

const KEY_MAP = {
  "r"           : "reroll",
  "ArrowUp"     : "up",
  "ArrowDown"   : "down",
  "ArrowLeft"   : "left",
  "ArrowRight"  : "right",
  " "           : "punch"
};
function handleKeyDown(e) {
  if (!e.altKey && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    if (!e.repeat) {
      var action = KEY_MAP[e.key];
      switch (scene) {
        case "lobby":
          switch (action) {
            case "reroll": socket.emit("reroll name"); break;
            case "up":
              if (lobbyCursor > (gamesAvailable ? 0 : 1)) {
                lobbyCursor--;
              }
              break;
            case "down":
              if (lobbyCursor < 2) {
                lobbyCursor++;
              }
              break;
            case "punch":
              switch (LOBBY_OPTIONS[lobbyCursor]) {
                case "join game":
                  if (gamesAvailable) {
                    socket.emit("join game");
                  }
                  else {
                    // Somehow chose this option when no games available
                    lobbyCursor = 1;
                  }
                  break;
                case "create game":
                  if (!waitingForPlayer) {
                    socket.emit("create game");
                    waitingForPlayer = true;
                  }
                  break;
                case "vs bot":
                  // TODO: Design AI player that isn't too hard or easy
                  if (!waitingForPlayer) {
                    socket.emit("vs bot");
                  }
                  break;
              }
              break;
          }
          break;
        case "gameover":
          if (action === "punch") {
            spriteClips[2 * playerNum] = 7;
          }
        default:
          socket.emit("keydown", { action: action });
      }
    }
  }
}
function handleKeyUp(e) {
  socket.emit("keyup", { action: KEY_MAP[e.key] });
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
      context.font = "bold 128px Fugaz One, Arial";
      context.fillText("Pong", titleX - 8, titleY - 112);
      context.strokeText("Pong", titleX - 8, titleY - 112);
      context.fillText("Gear", titleX + 8, titleY);
      context.strokeText("Gear", titleX + 8, titleY);

      if (!animateTitle) {
        context.font = "32px Gugi";
        context.fillStyle = PALETTE[4];
        context.fillText("Tactical Sports Action", SCREEN_W / 2, SCREEN_H / 2 + 64);

        context.font = "24px monospace";
        if (frames % 45 < 22) {
          context.fillText("Press any key to start", SCREEN_W / 2, SCREEN_H - 112);
        }
      }
      break;
    case "lobby":
      context.clearRect(0, 0, SCREEN_W, SCREEN_H);
      context.fillStyle = "#000";
      context.fillRect(0, 0, SCREEN_W, SCREEN_H);
      // Render title
      while (accumulator >= DELTA_TIME) {
        accumulator -= DELTA_TIME;

        if (animateTitle) {
          if (titleX <= 192) {
            titleX = 192;
          }
          else {
            titleX -= 5;
          }

          if (titleY <= 256) {
            titleY = 256;
          }
          else {
            titleY--;
          }
          // Stop animating title once it's reached its endpoint
          if (titleX === 192 && titleY === 256) {
            animateTitle = false;
          }
        }
      }
      context.font = "32px Gugi";
      context.textAlign = "left";
      context.fillStyle = PALETTE[4];
      context.strokeStyle = PALETTE[4];
      if (waitingForPlayer) {
        context.fillText("Waiting for player...", 480, 256 + 48);
        // TODO: Render spinner or something
      }
      else {
        // Render options: Join Game (if any available), Create Game, and VS Bot
        if (gamesAvailable) {
          context.fillText("Join Game", 480, 256);
        }
        else {
          context.strokeText("Join Game (no games to join)", 480, 256);
        }
        context.fillText("Create Game", 480, 256 + 48);
        context.fillText("VS Bot", 480, 256 + 96);
        // Render options cursor
        context.beginPath();
        context.moveTo(480 - 16, 256 - 12 + lobbyCursor * 48);
        context.lineTo(480 - 40, 256 - 12 - 8 + lobbyCursor * 48);
        context.lineTo(480 - 40, 256 - 12 + 8 + lobbyCursor * 48);
        context.closePath();
        context.stroke();
      }

      context.font = "24px Gugi";
      // Render directions
      context.fillText("Directives: ", SCREEN_W - 480, 32);
      context.fillText("Punch the grenade to deflect it; if you", SCREEN_W - 480, 80);
      context.fillText("get hit or the grenade enters your goal,", SCREEN_W - 480, 112);
      context.fillText("you lose a life.", SCREEN_W - 480, 144);
      // Render current name and remaining rerolls
      context.fillText("Name: " + playerName, 16, SCREEN_H - 112);
      context.fillText("Press \"r\" to change your name.", 16, SCREEN_H - 64);
      context.fillText("Remaining rerolls: " + rerolls, 16, SCREEN_H - 32);
      // Render Controls
      context.fillText("Game Controls:", SCREEN_W - 256, SCREEN_H - 112);
      context.fillText("Arrow keys: move", SCREEN_W - 256, SCREEN_H - 64);
      context.fillText("Spacebar: punch", SCREEN_W - 256, SCREEN_H - 32);

      // Render title
      context.fillStyle = PALETTE[3];
      context.strokeStyle = PALETTE[4];
      context.font = "bold 128px Fugaz One, Arial";
      context.textAlign = "center";
      context.fillText("Pong", titleX - 8, titleY - 112);
      context.strokeText("Pong", titleX - 8, titleY - 112);
      context.fillText("Gear", titleX + 8, titleY);
      context.strokeText("Gear", titleX + 8, titleY);
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
      context.textAlign = "center";
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
      context.textAlign = "right";
      context.strokeText(names[0] + ": ", 160, 22);
      context.fillText(names[0] + ": ", 160, 22);
      context.strokeText(names[1] + ": ", SCREEN_W / 2 + 160, 22);
      context.fillText(names[1] + ": ", SCREEN_W / 2 + 160, 22);
      // Lives as heads
      for (var i = 0; i < lives[0]; i++) {
        context.drawImage(head, 168 + i * head.width * 1.5, 8);
      }
      for (var i = 0; i < lives[1]; i++) {
        context.drawImage(head, SCREEN_W / 2 + 168 + i * head.width * 1.5, 8);
      }
      context.lineWidth = 2;
      break;
    case "gameover":
      while (accumulator >= DELTA_TIME) {
        accumulator -= DELTA_TIME;

        if (spriteClips[2 * winner] !== 7) {
          // Animate player
          playersFrames[winner] += DELTA_TIME;
          if (playersFrames[winner] >= 180) {
            playersFrames[winner] -= 180;
            spriteClips[2 * winner] = spriteClips[2 * winner] === 5 ? 6 : 5;
          }
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
