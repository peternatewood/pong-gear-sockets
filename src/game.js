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

TODOS:
+ Only update spriteClips clientside
+ Improve update rate
*/
function Game(io, name, roomNum) {
  // Provide access to io so we can broadcast changes to the players
  // this.io = io;
  this.room = roomNum;
  this.names = [ name, "" ];
  this.wantsRematch = [ false, false ];

  this.loadCountdown = Game.LOAD_DELAY;
  this.scene = "lobby"; // lobby, game, gameover ("title" scene has no game associated with it)

  this.titleX = Game.SCREEN_W / -2;
  this.animateTitle = true;

  // No more than one powerup active at a time on each side of the field
  // x, y, type, countdown
  // Types: 0 = none, 1 = tranq, 2 = slow, 3 = fast
  this.powerups = new Uint16Array(8);
  // type, countdown
  this.powerupMessages = new Uint16Array(4);
  // x, y, state
  // State: 0 => inactive, 1 => active, 2 => firing
  this.tranquilizers = new Uint16Array(6);

  // Upper left corners
  this.goals = new Uint16Array([
    0, 7 * Game.TILE_SIZE,
    Game.SCREEN_W - Game.TILE_SIZE, 7 * Game.TILE_SIZE
  ]);

  // x, y, xVel, yVel, frame counter, animation frame
  this.grenade = new Uint16Array(6);
  // Speed on player 1 and 2's sides separately
  this.grenadeSpeeds = new Uint8Array(2);
  this.grenadeState = 0;

  this.startCountdown;

  this.resetCountdown = 0;

  this.lives = new Uint8Array([ 5, 5 ]);
  this.lostPlayer;
  this.winner;
  // x, y, xVel, yVel
  this.players = new Uint16Array(8);
  // Milliseconds for player being asleep
  this.asleep = new Uint16Array(2);
  this.playersFrames = new Uint16Array([ 0, 0 ]);
  this.punchCountdown = new Uint16Array([ 0, 0 ]);
  // x, y for player 1 and 2
  this.spriteClips = new Uint8Array(4);

  this.inputs = [ {}, {} ];

  Game.resetField(this); // Set initial values

  return this;
}
Game.DELTA_TIME = 5;
Game.TAU = 2 * Math.PI;
Game.LOAD_DELAY = 600;
Game.SCREEN_W = 1024;
Game.SCREEN_H = 640;
Game.SNAKE_W = 288 / 8;
Game.SNAKE_H = 192 / 3;
Game.TILE_SIZE = 32;
Game.MIN_X = new Uint16Array([
  Game.TILE_SIZE + Game.SNAKE_W / 2, // Player 1
  Game.SCREEN_W / 2 + Game.TILE_SIZE + Game.SNAKE_W / 2 // Player 2
]);
Game.MAX_X = new Uint16Array([
  Game.SCREEN_W / 2 - Game.TILE_SIZE - Game.SNAKE_W / 2, // Player 1
  Game.SCREEN_W - Game.SNAKE_W / 2 - Game.TILE_SIZE // Player 2
]);
Game.MIN_Y = Game.TILE_SIZE + Game.SNAKE_H / 2;
Game.MAX_Y = Game.SCREEN_H - Game.TILE_SIZE - Game.SNAKE_H / 2;
Game.PUNCH_DELAY = 480;

Game.SPAWN_CHANCE = 0.25;
Game.POWERUP_DELAY = 3000;
Game.POWERUP_RADIUS = 12;
Game.POWERUP_SIZE = 32;
Game.HALF_POWERUP_SIZE = Game.POWERUP_SIZE / 2;
Game.MESSAGE_DELAY = 1000;
// Game.POWERUP_MESSAGE_TEXT = [ "", "Tranquilizer!", "Slow Grenade!", "Fast Grenade!" ];
Game.GOAL_W = Game.TILE_SIZE;
Game.GOAL_H = 6 * Game.TILE_SIZE;
Game.GRENADE_SIZE = 12;
Game.START_DELAY = 600;
Game.RESET_DELAY = 1000;
Game.MAX_LIVES = 5;
Game.PLAYER_FRAME_MAX = 180;
Game.SLEEP_DELAY = 1000;

Game.addPlayer = (g, name) => {
  g.names[1] = name;
  // g.io.to(g.room).emit("game ready", g.names);
  g.scene = "game";
  // g.io.to(g.room).emit("game ready", );
}
Game.setWantsRematch = (g, p) => {
  g.wantsRematch[p] = true;
}
Game.updatePowerup = (g, p) => {
  // Set ranges for spawning
  const MIN_X = 2 * Game.TILE_SIZE;
  const MAX_X = Game.SCREEN_W / 2 - 2 * Game.TILE_SIZE;
  const MIN_Y = 2 * Game.TILE_SIZE;
  const MAX_Y = Game.SCREEN_H - 2 * Game.TILE_SIZE;

  if (g.powerups[4 * p + 3] === 0) {
    if (g.grenadeSpeeds[p] !== 2) {
      // If grenade speed powerup was active, deactivate it and reset the powerup spawn delay
      g.grenadeSpeeds[p] = 2;
      g.powerups[4 * p + 3] = Game.POWERUP_DELAY;
    }
    else if (g.powerups[4 * p + 2] === 0) {
      // Decide whether to generate a powerup or not
      if (Math.random() < Game.SPAWN_CHANCE) {
        g.powerups[4 * p] = (p * Game.SCREEN_W / 2) + MIN_X + Math.random() * (MAX_X - MIN_X) >> 0;
        g.powerups[4 * p + 1] = MIN_Y + Math.random() * (MAX_Y - MIN_Y) >> 0;
        g.powerups[4 * p + 2] = (Math.random() * 3 >> 0) + 1; // Get number from 1 to 3 inclusive
        g.powerups[4 * p + 3] = Game.POWERUP_DELAY / 2;
      }
      else {
        g.powerups[4 * p + 3] = Game.POWERUP_DELAY;
      }
    }
    else {
      // Powerup expired
      g.powerups[4 * p + 2] = 0;
      g.powerups[4 * p + 3] = Game.POWERUP_DELAY;
    }
  }

  g.powerups[4 * p + 3] -= Game.DELTA_TIME;
  if (g.powerupMessages[2 * p + 1] !== 0) {
    g.powerupMessages[2 * p + 1] -= Game.DELTA_TIME;
  }

  // Check for player collision
  if (g.powerups[4 * p + 2] !== 0) {
    // Rectangular collision detection
    if (g.players[4 * p] - Game.SNAKE_W / 2 < g.powerups[4 * p] + Game.HALF_POWERUP_SIZE && g.players[4 * p] + Game.SNAKE_W / 2 > g.powerups[4 * p] - Game.HALF_POWERUP_SIZE && g.players[4 * p + 1] - Game.SNAKE_H / 2 < g.powerups[4 * p + 1] + Game.HALF_POWERUP_SIZE && g.players[4 * p + 1] + Game.SNAKE_H / 2 > g.powerups[4 * p + 1] - Game.HALF_POWERUP_SIZE) {
      // Activate effect
      if (g.powerups[4 * p + 2] === 1) {
        // Tranquilizer
        g.tranquilizers[3 * p + 2] = 1;
        g.powerupMessages[2 * p] = 1;
        g.powerupMessages[2 * p + 1] = Game.MESSAGE_DELAY;
      }
      else {
        // Speed modifier
        g.grenadeSpeeds[p] = g.powerups[4 * p + 2] === 3 ? 3 : 1;
        // Flash powerup message
        g.powerupMessages[2 * p] = g.powerups[4 * p + 2];
        g.powerupMessages[2 * p + 1] = Game.MESSAGE_DELAY;
      }
      // Destroy powerup
      g.powerups[4 * p + 2] = 0;
      g.powerups[4 * p + 3] = Game.POWERUP_DELAY;
    }
  }
};
Game.updateTranquilizer = (g, p) => {
  g.tranquilizers[3 * p] += p === 0 ? 2 : -2;
  var otherP = p === 0 ? 1 : 0;
  // Handle collisions
  if (g.tranquilizers[3 * p] >= Game.SCREEN_W - Game.TILE_SIZE || g.tranquilizers[3 * p] < Game.TILE_SIZE) {
    // Hit the wall
    g.tranquilizers[3 * p + 2] = 0;
  }
  else if (g.tranquilizers[3 * p] > g.players[4 * otherP] - SNAKE_W / 2 && g.tranquilizers[3 * p] < g.players[4 * otherP] + SNAKE_W / 2 && g.tranquilizers[3 * p + 1] > g.players[4 * otherP + 1] - Game.SNAKE_H / 2 && g.tranquilizers[3 * p + 1] < g.players[4 * otherP + 1] + Game.SNAKE_H / 2) {
    // The tranquilizer's center is inside the player's hitbox
    g.asleep[otherP] = Game.SLEEP_DELAY;
    g.tranquilizers[3 * p + 2] = 0;
  }
};
Game.isGrenadeInPlayer = (g, p) => {
  return g.players[4 * p] - Game.SNAKE_W / 2 < g.grenade[0] + Game.GRENADE_SIZE && g.players[4 * p] + Game.SNAKE_W / 2 > g.grenade[0] && g.players[4 * p + 1] - Game.SNAKE_H / 2 < g.grenade[1] + Game.GRENADE_SIZE && g.players[4 * p + 1] + Game.SNAKE_H / 2 > g.grenade[1];
};
Game.explodeGrenade = (g, p) => {
  // Schedule player to lose life
  g.lostPlayer = p;
  // Start Grenade explosion animation
  g.grenadeState = 1;
  g.grenade[4] = 0;
  g.grenade[5] = 0;
  // Set players' sprites to stand
  g.spriteClips[0] = g.spriteClips[0] > 3 ? 4 : 0;
  g.spriteClips[2] = g.spriteClips[2] > 3 ? 4 : 0;
}
Game.handleGrenadeCollisions = (g, p) => {
  if (g.inputs[p].punch) {
    // Get distances from player
    var xDist = Math.abs(g.players[4 * p] - (g.grenade[0] + Game.GRENADE_SIZE / 2));
    var yDist = Math.abs(g.players[4 * p + 1] - (g.grenade[1] + Game.GRENADE_SIZE / 2));
    // Deflect Grenade if close enough and player facing grenade
    var deflected = false;
    if (xDist < Game.SNAKE_W && yDist < Game.SNAKE_H) {
      if (yDist < Game.SNAKE_H / 2 && g.spriteClips[2 * p] === 7) {
        if (g.grenade[0] < g.players[4 * p] && g.spriteClips[2 * p + 1] === 0) {
          // Grenade to the left, and player facing left
          g.grenade[2] = -1;
          deflected = true;
        }
        else if (g.grenade[0] > g.players[4 * p] && g.spriteClips[2 * p + 1] === 1) {
          // Grenade to the right, and player facing right
          g.grenade[2] = 1;
          deflected = true;
        }
      }
      else if (xDist < Game.SNAKE_W / 2 && g.spriteClips[2 * p] === 3) {
        if (g.grenade[1] < g.players[4 * p + 1] && g.spriteClips[2 * p + 1] === 0) {
          // Grenade to the up, and player facing up
          g.grenade[3] = -1;
          deflected = true;
        }
        else if (g.grenade[1] > g.players[4 * p + 1] && g.spriteClips[2 * p + 1] === 1) {
          // Grenade to the down, and player facing down
          g.grenade[3] = 1;
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
    if (Game.isGrenadeInPlayer(g, p)) {
      Game.explodeGrenade(g, p);
    }
  }
};
Game.updatePlayer = (g, p) => {
  if (g.asleep[p] > 0) {
    g.asleep[p] -= Game.DELTA_TIME;
    g.playersFrames[p] += Game.DELTA_TIME;
    if (g.playersFrames[p] >= Game.PLAYER_FRAME_MAX) {
      g.playersFrames[p] -= Game.PLAYER_FRAME_MAX;
    }
  }

  // Only move player if not asleep
  if (g.asleep[p] === 0) {
    // Only move player if not punching
    if (!g.inputs[p].punch) {
      g.players[4 * p] += g.players[4 * p + 2];
      if (g.players[4 * p] < Game.MIN_X[p]) {
        g.players[4 * p] = Game.MIN_X[p];
      }
      else if (g.players[4 * p] > Game.MAX_X[p]) {
        g.players[4 * p] = Game.MAX_X[p];
      }
      g.players[4 * p + 1] += g.players[4 * p + 3];
      if (g.players[4 * p + 1] < Game.MIN_Y) {
        g.players[4 * p + 1] = Game.MIN_Y;
      }
      else if (g.players[4 * p + 1] > Game.MAX_Y) {
        g.players[4 * p + 1] = Game.MAX_Y;
      }
      // Update sprite clip
      g.playersFrames[p] += Game.DELTA_TIME;
      if (g.playersFrames[p] >= Game.PLAYER_FRAME_MAX) {
        if (g.players[4 * p + 2]) {
          // Left/Right
          g.spriteClips[2 * p] = g.spriteClips[2 * p] === 5 ? 6 : 5;
        }
        else if (g.players[4 * p + 3]) {
          // Up/Down
          g.spriteClips[2 * p] = g.spriteClips[2 * p] === 1 ? 2 : 1;
        }
        g.playersFrames[p] -= Game.PLAYER_FRAME_MAX;
      }
    }

    // Update punch countdown
    if (g.punchCountdown[p]) {
      var countdown = g.punchCountdown[p] - Game.DELTA_TIME;
      if (countdown < 0) countdown = 0;
      g.punchCountdown[p] = countdown;

      if (g.inputs[p].punch && g.punchCountdown[p] <= Game.PUNCH_DELAY / 2) {
        g.inputs[p].punch = false;
        // Change sprite clip
        g.spriteClips[2 * p] = g.spriteClips[2 * p] === 3 ? 0 : 4;
      }
    }
  }

  // g.io.to(g.room).emit("update player", { p: p, players: g.players });
};
// Handle input
Game.handlePunch = (g, p) => {
  if (g.punchCountdown[p] === 0 && !g.inputs[p].punch) {
    g.inputs[p].punch = true;
    // Reflect grenade if close enough
    g.punchCountdown[p] = Game.PUNCH_DELAY;
    Game.updateSpriteClip(g, p, "punch", true);
    // Fire tranquilizer
    if (g.tranquilizers[3 * p + 2] === 1) {
      g.tranquilizers[3 * p] = g.players[4 * p] + g.SNAKE_W * (p * -1);
      g.tranquilizers[3 * p + 1] = g.players[4 * p + 1];
      g.tranquilizers[3 * p + 2] = 2;
    }
  }
};
// TODO: update spriteClips on client-side
Game.updateSpriteClip = (g, p, action, keydown) => {
  // Only update if grenade is live
  if (g.grenadeState === 0) {
    if (keydown) {
      switch (action) {
        case "up":
          if (g.players[4 * p + 2] === 0) {
            g.spriteClips[2 * p] = 1;
            g.spriteClips[2 * p + 1] = 0;
          }
          break;
        case "down":
          if (g.players[4 * p + 2] === 0) {
            g.spriteClips[2 * p] = 1;
            g.spriteClips[2 * p + 1] = 1;
          }
          break;
        case "left":
          g.spriteClips[2 * p] = 5;
          g.spriteClips[2 * p + 1] = 0;
          break;
        case "right":
          g.spriteClips[2 * p] = 5;
          g.spriteClips[2 * p + 1] = 1;
          break;
        case "punch":
          g.spriteClips[2 * p] = g.spriteClips[2 * p] < 4 ? 3 : 7;
          break;
      }
    }
    else {
      // We have to change the y-position of the spriteclip for certain key releases
      switch (action) {
        case "left":
          if (g.inputs[p].down) {
            g.spriteClips[2 * p + 1] = 1;
          }
          if (g.players[4 * p + 3]) {
            g.spriteClips[2 * p] = 1;
          }
          else {
            g.spriteClips[2 * p] = 4;
          }
          break;
        case "right":
          if (g.inputs[p].up) {
            g.spriteClips[2 * p + 1] = 0;
          }
          if (g.players[4 * p + 3]) {
            g.spriteClips[2 * p] = 1;
          }
          else {
            g.spriteClips[2 * p] = 4;
          }
          break;
        case "up":
        case "down":
          if (g.players[4 * p + 2]) {
            g.spriteClips[2 * p] = 4;
          }
          else {
            g.spriteClips[2 * p] = 0;
          }
          break;
      }
    }
  }
};
Game.updatePlayerVel = (g, p, isKeydown) => {
  var xVel = 0;
  var yVel = 0;
  if (g.inputs[p].up) {
    yVel--;
  }
  if (g.inputs[p].down) {
    yVel++;
  }
  if (g.inputs[p].left) {
    xVel--;
  }
  if (g.inputs[p].right) {
    xVel++;
  }
  // Stop player movement if punching
  if (g.inputs[p].punch) {
    if (g.players[4 * p + 2]) g.players[4 * p + 2] = 0;
    if (g.players[4 * p + 3]) g.players[4 * p + 3] = 0;
  }
  else {
    g.players[4 * p + 2] = xVel;
    g.players[4 * p + 3] = yVel;
  }
}
// Resets the field once a player loses a life
Game.resetField = (g) => {
  g.inputs[0].up    = false;
  g.inputs[0].down  = false;
  g.inputs[0].left  = false;
  g.inputs[0].up    = false;
  g.inputs[0].punch = false;

  g.inputs[1].up    = false;
  g.inputs[1].down  = false;
  g.inputs[1].left  = false;
  g.inputs[1].up    = false;
  g.inputs[1].punch = false;

  g.players[0] = Game.MIN_X[0] + Game.TILE_SIZE;
  g.players[1] = Game.SCREEN_H / 2;
  g.players[2] = 0;
  g.players[3] = 0;

  g.players[4] = Game.MAX_X[1] - Game.TILE_SIZE;
  g.players[5] = Game.SCREEN_H / 2;
  g.players[6] = 0;
  g.players[7] = 0;
  // Do we need this server side?
  g.spriteClips[0] = 4;
  g.spriteClips[1] = 1;
  g.spriteClips[2] = 4;
  g.spriteClips[3] = 0;

  g.asleep[0] = 0;
  g.asleep[1] = 0;

  g.grenade[0] = Game.SCREEN_W / 2 - Game.GRENADE_SIZE / 2;
  g.grenade[1] = Game.SCREEN_H / 2 - Game.GRENADE_SIZE / 2;
  g.grenade[2] = 2 * (2 * Math.random() >> 0) - 1;
  g.grenade[3] = 2 * (2 * Math.random() >> 0) - 1;
  g.grenade[4] = 0;
  g.grenade[5] = 0;

  g.grenadeState = 0;
  g.grenadeSpeeds[0] = 2;
  g.grenadeSpeeds[1] = 2;

  g.powerups[2] = 0;
  g.powerups[3] = Game.POWERUP_DELAY;
  g.powerups[6] = 0;
  g.powerups[7] = Game.POWERUP_DELAY;

  g.tranquilizers[3] = 0;
  g.tranquilizers[5] = 0;

  g.powerupMessages[0] = 0;
  g.powerupMessages[1] = 0;
  g.powerupMessages[2] = 0;
  g.powerupMessages[3] = 0;

  g.startCountdown = Game.START_DELAY;
  // // Restart music
  // if (g.scene === "game") {
  //   music.currentTime = 0;
  //   music.play();
  // }
}
// Rather than using bind to keep the Game instance context, we pass the game as a parameter
Game.handleKeyDown = (g, p, action) => {
  // Ready flag?
  if (false) {
    switch (g.scene) {
      case "lobby":
        break;
      case "gameover":
        g.lives[0] = Game.MAX_LIVES;
        g.lives[1] = Game.MAX_LIVES;
        Game.resetField(g);
        g.scene = "game";
        break;
    }
  }

  switch (action) {
    case "up"   : g.inputs[p].up    = true; Game.updateSpriteClip(g, p, "up", true); break;
    case "down" : g.inputs[p].down  = true; Game.updateSpriteClip(g, p, "down", true); break;
    case "left" : g.inputs[p].left  = true; Game.updateSpriteClip(g, p, "left", true); break;
    case "right": g.inputs[p].right = true; Game.updateSpriteClip(g, p, "right", true); break;
    // case "up"   : g.inputs[p].up    = true; break;
    // case "down" : g.inputs[p].down  = true; break;
    // case "left" : g.inputs[p].left  = true; break;
    // case "right": g.inputs[p].right = true; break;
    case "punch": Game.handlePunch(g, p); break;
  }

  if (g.scene === "game") {
    Game.updatePlayerVel(g, p, true);
  }
}
Game.handleKeyUp = (g, p, action) => {
  switch (action) {
    case "up"   : g.inputs[p].up    = false; Game.updateSpriteClip(g, p, "up", false); break;
    case "down" : g.inputs[p].down  = false; Game.updateSpriteClip(g, p, "down", false); break;
    case "left" : g.inputs[p].left  = false; Game.updateSpriteClip(g, p, "left", false); break;
    case "right": g.inputs[p].right = false; Game.updateSpriteClip(g, p, "right", false); break;
    // case "up"   : g.inputs[p].up    = false; break;
    // case "down" : g.inputs[p].down  = false; break;
    // case "left" : g.inputs[p].left  = false; break;
    // case "right": g.inputs[p].right = false; break;
    case "punch": break;
  }
  if (g.scene === "game") {
    Game.updatePlayerVel(g, p, false);
  }
}
Game.update = (g) => {
  switch (g.scene) {
    case "title":
      break;
    case "game":
      if (g.startCountdown !== 0) {
        g.startCountdown -= Game.DELTA_TIME;
        if (g.startCountdown <= 0) {
          g.startCountdown = 0;
        }
      }
      else if (g.grenadeState === 0) {
        // Update players
        Game.updatePlayer(g, 0);
        Game.updatePlayer(g, 1);

        // Update grenade
        g.grenade[0] += g.grenadeSpeeds[g.grenade[0] / (Game.SCREEN_W / 2) >> 0] * g.grenade[2];
        g.grenade[1] += g.grenadeSpeeds[g.grenade[0] / (Game.SCREEN_W / 2) >> 0] * g.grenade[3];
        // Check whether grenade enters a goal
        if (g.grenade[0] < g.goals[0] + Game.GOAL_W && g.grenade[1] > g.goals[1] && g.grenade[1] + Game.GRENADE_SIZE < g.goals[1] + Game.GOAL_H) {
          // Player 1 goal
          Game.explodeGrenade(g, 0);
        }
        else if (g.grenade[0] + Game.GRENADE_SIZE > g.goals[2] && g.grenade[1] > g.goals[3] && g.grenade[1] + Game.GRENADE_SIZE < g.goals[3] + Game.GOAL_H) {
          // Player 2 goal
          Game.explodeGrenade(g, 1);
        }
        else {
          // Bounce off of walls
          var bounced = false;
          if (g.grenade[1] < Game.TILE_SIZE) {
            g.grenade[1] = Game.TILE_SIZE;
            g.grenade[3] = 1;
            bounced = true;
          }
          else if (g.grenade[1] > Game.SCREEN_H - (Game.GRENADE_SIZE + Game.TILE_SIZE)) {
            g.grenade[1] = Game.SCREEN_H - (Game.GRENADE_SIZE + Game.TILE_SIZE);
            g.grenade[3] = -1;
            bounced = true;
          }
          if (g.grenade[0] < Game.TILE_SIZE) {
            g.grenade[0] = Game.TILE_SIZE;
            g.grenade[2] = 1;
            bounced = true;
          }
          else if (g.grenade[0] > Game.SCREEN_W - (Game.GRENADE_SIZE + Game.TILE_SIZE)) {
            g.grenade[0] = Game.SCREEN_W - (Game.GRENADE_SIZE + Game.TILE_SIZE);
            g.grenade[2] = -1;
            bounced = true;
          }

          if (bounced) {
            // playRicochetSound();
          }
        }

        // Handle collisions
        Game.handleGrenadeCollisions(g, 0);
        Game.handleGrenadeCollisions(g, 1);
      }

      if (g.resetCountdown !== 0) {
        g.resetCountdown -= Game.DELTA_TIME;
        if (g.resetCountdown <= 0) {
          g.resetCountdown === 0;
          // Reduce player's lives and check whether player lost all lives
          if (--g.lives[g.lostPlayer] === 0) {
            // music.pause();
            g.scene = "gameover";
            g.winner = 1 - g.lostPlayer;
            // Set winning player's spriteclip to running and losing player's spriteclip to standing
            if (g.lostPlayer === 0) {
              g.spriteClips[0] = 4;
              g.spriteClips[2] = 5;
            }
            else {
              g.spriteClips[0] = 5;
              g.spriteClips[2] = 4;
            }
            // Player 1 facing right, 2 facing left
            g.spriteClips[1] = 1;
            g.spriteClips[3] = 0;
            g.players[0] = 3 * Game.TILE_SIZE;
            g.players[1] = Game.SCREEN_H / 2;
            g.players[4] = Game.SCREEN_W - (3 * Game.TILE_SIZE);
            g.players[5] = Game.SCREEN_H / 2;
            // Prerender background
            // Game.prerenderGameover(g);
          }
          // Reset grenade and player positions
          Game.resetField(g);
        }
      }

      // Update grenade animation clip
      if (g.grenadeState !== 2) {
        g.grenade[4] += Game.DELTA_TIME;
        if (g.grenade[4] === Game.DELTA_TIME * 120) {
          g.grenade[4] = 0;
        }
        if (g.grenade[4] === Game.DELTA_TIME * 30) {
          g.grenade[4] = 0;
          g.grenade[5] += g.grenadeState === 0 ? 14 : Game.SNAKE_W;
          switch (g.grenadeState) {
            case 0:
              if (g.grenade[5] > 42) {
                // Reset animation frame so it loops
                g.grenade[5] = 0;
              }
              break;
            case 1:
              if (g.grenade[5] === Game.SNAKE_W * 4) {
                // End explosion animation
                g.grenadeState = 2;
                // Remove firing tranquilizers
                if (g.tranquilizers[2] === 2) g.tranquilizers[2] = 0;
                if (g.tranquilizers[5] === 2) g.tranquilizers[5] = 0;
                // Start countdown to reset game
                g.resetCountdown = Game.RESET_DELAY;
              }
              break;
          }
        }
      }

      if (g.resetCountdown === 0) {
        // Update powerups
        Game.updatePowerup(g, 0);
        Game.updatePowerup(g, 1);
      }

      // Update tranquilizers
      if (g.tranquilizers[2] === 2) {
        Game.updateTranquilizer(g, 0);
      }
      if (g.tranquilizers[5] === 2) {
        Game.updateTranquilizer(g, 1);
      }
      break;
    case "gameover":
      break;
  }
}
Game.reset = (g) => {
  Game.resetField(g);

  g.scene = "game";
  g.wantsRematch[0] = false;
  g.wantsRematch[1] = false;
  g.lives[0] = 5;
  g.lives[1] = 5;
}
Game.getData = (g) => {
  return {
    players         : g.players,
    spriteClips     : g.spriteClips,
    lives           : g.lives,
    asleep          : g.asleep,
    grenade         : g.grenade,
    grenadeState    : g.grenadeState,
    grenadeSpeeds   : g.grenadeSpeeds,
    powerups        : g.powerups,
    tranquilizers   : g.tranquilizers,
    powerupMessages : g.powerupMessages,
    startCountdown  : g.startCountdown,
    scene           : g.scene,
    winner          : g.winner,
    lostPlayer      : g.lostPlayer
  };
}

exports.game = Game;
