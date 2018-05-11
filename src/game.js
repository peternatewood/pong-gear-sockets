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
+ Improve update rate: maybe still use delta timing, but setInterval on 20ms or something?
  - Simulate game on both client- and server-side with some way to regularly sync?
+ Allow user to back out of waiting for a player to join their game

BUGS:
+ If client creates a game and refreshes, the game remains in the waiting queue
+ Sometimes, p:0 (player 1) ends up running left and down after Game::resetField
+ Tranquilizer doesn't fire dart
*/
class Game {
  constructor(name, roomNum, numberOfBots, playSoundCallback) {
    this.room = roomNum;
    this.names = [ name, "" ];
    this.wantsRematch = [ false, false ];
    this.bots = [ numberOfBots > 1, numberOfBots > 0 ]; // 1 bot means, second player is a bot, 2 bots means both are;

    this.botTarget = new Uint16Array(4); // x, y coordinates where the bot(s) will try to move
    this.botReliableHits = Game.BOT_HITS;

    this.lastTimestamp = Date.now();
    this.accumulator = Game.DELTA_TIME;
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
    this.grenade = new Int16Array(6);
    // Speed on player 1 and 2's sides separately
    this.grenadeSpeeds = new Uint8Array(2);
    this.grenadeState = 0;

    this.startCountdown;

    this.resetCountdown = 0;

    this.lives = new Uint8Array([ 5, 5 ]);
    this.lostPlayer;
    this.winner;
    // x, y, xVel, yVel
    this.players = new Int16Array(8);
    // Milliseconds for player being asleep
    this.asleep = new Uint16Array(2);
    this.playersFrames = new Uint16Array([ 0, 0 ]);
    this.punchCountdown = new Uint16Array([ 0, 0 ]);
    // x, y for player 1 and 2
    this.spriteClips = new Uint8Array(4);

    this.inputs = [ {}, {} ];

    this.playSound = playSoundCallback;
  }
  addPlayer(name) {
    this.names[1] = name;
    this.scene = "game";
    this.accumulator = Game.DELTA_TIME;
    this.lastTimestamp = Date.now();
    this.resetField();
  }
  setWantsRematch(p) {
    this.wantsRematch[p] = true;
  }

  updatePowerup(p) {
    // Set ranges for spawning
    const MIN_X = 2 * Game.TILE_SIZE;
    const MAX_X = Game.SCREEN_W / 2 - 2 * Game.TILE_SIZE;
    const MIN_Y = 2 * Game.TILE_SIZE;
    const MAX_Y = Game.SCREEN_H - 2 * Game.TILE_SIZE;

    if (this.powerups[4 * p + 3] === 0) {
      if (this.grenadeSpeeds[p] !== 2) {
        // If grenade speed powerup was active, deactivate it and reset the powerup spawn delay
        this.grenadeSpeeds[p] = 2;
        this.powerups[4 * p + 3] = Game.POWERUP_DELAY;
      }
      else if (this.powerups[4 * p + 2] === 0) {
        // Decide whether to generate a powerup or not
        if (Math.random() < Game.SPAWN_CHANCE) {
          this.powerups[4 * p] = (p * Game.SCREEN_W / 2) + MIN_X + Math.random() * (MAX_X - MIN_X) >> 0;
          this.powerups[4 * p + 1] = MIN_Y + Math.random() * (MAX_Y - MIN_Y) >> 0;
          this.powerups[4 * p + 2] = (Math.random() * 3 >> 0) + 1; // Get number from 1 to 3 inclusive
          this.powerups[4 * p + 3] = Game.POWERUP_DELAY / 2;
        }
        else {
          this.powerups[4 * p + 3] = Game.POWERUP_DELAY;
        }
      }
      else {
        // Powerup expired
        this.powerups[4 * p + 2] = 0;
        this.powerups[4 * p + 3] = Game.POWERUP_DELAY;
      }
    }

    this.powerups[4 * p + 3] -= Game.DELTA_TIME;
    if (this.powerupMessages[2 * p + 1] !== 0) {
      this.powerupMessages[2 * p + 1] -= Game.DELTA_TIME;
    }

    // Check for player collision
    if (this.powerups[4 * p + 2] !== 0) {
      // Rectangular collision detection
      if (this.players[4 * p] - Game.SNAKE_W / 2 < this.powerups[4 * p] + Game.HALF_POWERUP_SIZE && this.players[4 * p] + Game.SNAKE_W / 2 > this.powerups[4 * p] - Game.HALF_POWERUP_SIZE && this.players[4 * p + 1] - Game.SNAKE_H / 2 < this.powerups[4 * p + 1] + Game.HALF_POWERUP_SIZE && this.players[4 * p + 1] + Game.SNAKE_H / 2 > this.powerups[4 * p + 1] - Game.HALF_POWERUP_SIZE) {
        // Activate effect
        if (this.powerups[4 * p + 2] === 1) {
          // Tranquilizer
          this.tranquilizers[3 * p + 2] = 1;
          this.powerupMessages[2 * p] = 1;
          this.powerupMessages[2 * p + 1] = Game.MESSAGE_DELAY;
        }
        else {
          // Speed modifier
          this.grenadeSpeeds[p] = this.powerups[4 * p + 2] === 3 ? 3 : 1;
          // Flash powerup message
          this.powerupMessages[2 * p] = this.powerups[4 * p + 2];
          this.powerupMessages[2 * p + 1] = Game.MESSAGE_DELAY;
        }
        // Destroy powerup
        this.powerups[4 * p + 2] = 0;
        this.powerups[4 * p + 3] = Game.POWERUP_DELAY;
      }
    }
  }

  updateTranquilizer(p) {
    this.tranquilizers[3 * p] += p === 0 ? 2 : -2;
    var otherP = 1 - p;
    // Handle collisions
    if (this.tranquilizers[3 * p] >= Game.SCREEN_W - Game.TILE_SIZE || this.tranquilizers[3 * p] < Game.TILE_SIZE) {
      // Hit the wall
      this.tranquilizers[3 * p + 2] = 0;
    }
    else if (this.tranquilizers[3 * p] > this.players[4 * otherP] - Game.SNAKE_W / 2 && this.tranquilizers[3 * p] < this.players[4 * otherP] + Game.SNAKE_W / 2 && this.tranquilizers[3 * p + 1] > this.players[4 * otherP + 1] - Game.SNAKE_H / 2 && this.tranquilizers[3 * p + 1] < this.players[4 * otherP + 1] + Game.SNAKE_H / 2) {
      // The tranquilizer's center is inside the player's hitbox
      this.asleep[otherP] = Game.SLEEP_DELAY;
      this.tranquilizers[3 * p + 2] = 0;
    }
  }

  handleGrenadeWallCollisions(grenade) {
    if (grenade[1] < Game.TILE_SIZE) {
      grenade[1] = Game.TILE_SIZE;
      grenade[3] = 1;
    }
    else if (grenade[1] > Game.SCREEN_H - (Game.GRENADE_SIZE + Game.TILE_SIZE)) {
      grenade[1] = Game.SCREEN_H - (Game.GRENADE_SIZE + Game.TILE_SIZE);
      grenade[3] = -1;
    }
    if (grenade[0] < Game.TILE_SIZE) {
      grenade[0] = Game.TILE_SIZE;
      grenade[2] = 1;
    }
    else if (grenade[0] > Game.SCREEN_W - (Game.GRENADE_SIZE + Game.TILE_SIZE)) {
      grenade[0] = Game.SCREEN_W - (Game.GRENADE_SIZE + Game.TILE_SIZE);
      grenade[2] = -1;
    }
  }
  isGrenadeInPlayer(grenade, p) {
    return this.players[4 * p] - 0.4 * Game.SNAKE_W < grenade[0] + Game.GRENADE_SIZE && this.players[4 * p] + 0.4 * Game.SNAKE_W > grenade[0] && this.players[4 * p + 1] - 0.4 * Game.SNAKE_H < grenade[1] + Game.GRENADE_SIZE && this.players[4 * p + 1] + 0.4 * Game.SNAKE_H > grenade[1];
  }
  isGrenadeInPunchRange(grenade, p) {
    // Get distances from player
    var xDist = Math.abs(this.players[4 * p] - (grenade[0] + Game.GRENADE_SIZE / 2));
    var yDist = Math.abs(this.players[4 * p + 1] - (grenade[1] + Game.GRENADE_SIZE / 2));

    return xDist < 0.75 * Game.SNAKE_W && yDist < 0.75 * Game.SNAKE_H;
  }
  // Return which goal the grenade is in, or 2 if not in a goal
  isGrenadeInGoal(grenade) {
    if (grenade[0] < this.goals[0] + Game.GOAL_W && grenade[1] > this.goals[1] && grenade[1] + Game.GRENADE_SIZE < this.goals[1] + Game.GOAL_H) {
      // Player 1 goal
      return 0;
    }
    else if (grenade[0] + Game.GRENADE_SIZE > this.goals[2] && grenade[1] > this.goals[3] && grenade[1] + Game.GRENADE_SIZE < this.goals[3] + Game.GOAL_H) {
      // Player 2 goal
      return 1;
    }
    return 2;
  }
  explodeGrenade(p) {
    // Schedule player to lose life
    this.lostPlayer = p;
    // Start Grenade explosion animation
    this.grenadeState = 1;
    this.grenade[4] = 0;
    this.grenade[5] = 0;
    // Set players' sprites to stand
    this.spriteClips[0] = this.spriteClips[0] > 3 ? 4 : 0;
    this.spriteClips[2] = this.spriteClips[2] > 3 ? 4 : 0;

    this.playSound(this.room, "pause");
    this.playSound(this.room, "explosion", p);
  }
  handleGrenadeCollisions(p) {
    if (this.inputs[p].punch) {
      // Get distances from player
      var xDist = Math.abs(this.players[4 * p] - (this.grenade[0] + Game.GRENADE_SIZE / 2));
      var yDist = Math.abs(this.players[4 * p + 1] - (this.grenade[1] + Game.GRENADE_SIZE / 2));
      // Deflect Grenade if close enough and player facing grenade
      var deflected = false;
      // if (xDist < Game.SNAKE_W && yDist < Game.SNAKE_H) {
      if (this.isGrenadeInPunchRange(this.grenade, p)) {
        if (yDist < Game.SNAKE_H / 2 && this.spriteClips[2 * p] === 7) {
          if (this.grenade[0] < this.players[4 * p] && this.spriteClips[2 * p + 1] === 0) {
            // Grenade to the left, and player facing left
            this.grenade[2] = -1;
            deflected = true;
          }
          else if (this.grenade[0] > this.players[4 * p] && this.spriteClips[2 * p + 1] === 1) {
            // Grenade to the right, and player facing right
            this.grenade[2] = 1;
            deflected = true;
          }
        }
        else if (xDist < Game.SNAKE_W / 2 && this.spriteClips[2 * p] === 3) {
          if (this.grenade[1] < this.players[4 * p + 1] && this.spriteClips[2 * p + 1] === 0) {
            // Grenade to the up, and player facing up
            this.grenade[3] = -1;
            deflected = true;
          }
          else if (this.grenade[1] > this.players[4 * p + 1] && this.spriteClips[2 * p + 1] === 1) {
            // Grenade to the down, and player facing down
            this.grenade[3] = 1;
            deflected = true;
          }
        }
      }
    }

    if (deflected) {
      // TODO: This conflicts with the punch sound too much, override punch sound?
      // playRicochetSound(p);
      this.grenade[0] += this.grenade[2];
      this.grenade[1] += this.grenade[3];
    }
    else {
      // Blow up grenade on player
      if (this.isGrenadeInPlayer(this.grenade, p)) {
        this.explodeGrenade(p);
      }
    }
  }

  updatePlayer(p) {
    if (this.asleep[p] > 0) {
      this.asleep[p] -= Game.DELTA_TIME;
      this.playersFrames[p] += Game.DELTA_TIME;
      if (this.playersFrames[p] >= Game.PLAYER_FRAME_MAX) {
        this.playersFrames[p] -= Game.PLAYER_FRAME_MAX;
      }
    }

    // Only move player if not asleep
    if (this.asleep[p] === 0) {
      // Only move player if not punching
      if (!this.inputs[p].punch) {
        this.players[4 * p] += this.players[4 * p + 2];
        if (this.players[4 * p] < Game.MIN_X[p]) {
          this.players[4 * p] = Game.MIN_X[p];
        }
        else if (this.players[4 * p] > Game.MAX_X[p]) {
          this.players[4 * p] = Game.MAX_X[p];
        }
        this.players[4 * p + 1] += this.players[4 * p + 3];
        if (this.players[4 * p + 1] < Game.MIN_Y) {
          this.players[4 * p + 1] = Game.MIN_Y;
        }
        else if (this.players[4 * p + 1] > Game.MAX_Y) {
          this.players[4 * p + 1] = Game.MAX_Y;
        }
        // Update sprite clip
        this.playersFrames[p] += Game.DELTA_TIME;
        if (this.playersFrames[p] >= Game.PLAYER_FRAME_MAX) {
          if (this.players[4 * p + 2]) {
            // Left/Right
            this.spriteClips[2 * p] = this.spriteClips[2 * p] === 5 ? 6 : 5;
          }
          else if (this.players[4 * p + 3]) {
            // Up/Down
            this.spriteClips[2 * p] = this.spriteClips[2 * p] === 1 ? 2 : 1;
          }
          this.playersFrames[p] -= Game.PLAYER_FRAME_MAX;
        }
      }

      // Update punch countdown
      if (this.punchCountdown[p]) {
        var countdown = this.punchCountdown[p] - Game.DELTA_TIME;
        if (countdown < 0) countdown = 0;
        this.punchCountdown[p] = countdown;

        if (this.inputs[p].punch && this.punchCountdown[p] <= Game.PUNCH_DELAY / 2) {
          this.inputs[p].punch = false;
          // Change sprite clip
          this.spriteClips[2 * p] = this.spriteClips[2 * p] === 3 ? 0 : 4;
        }
      }
    }
  }
/*
Bot Behavior
+ Bot is always second player (index 1)
+ Bot calculates target position to move to
  Position should be within a range to avoid stainding right next to a wall ricochet point
+ If grenade approaching goal, bot turns to face it
  Otherwise, bot tries to avoid grenade
*/
  setBotTarget(p) {
    // Range of coordinates where the botTarget can be
    var minX = Game.SCREEN_W / 2 + 2 * Game.TILE_SIZE;

    const MAX_ITERATIONS = 1000;

    var simGrenade = new Int16Array([ this.grenade[0], this.grenade[1], this.grenade[2], this.grenade[3] ]);
    var hitGoal = false;
    // Simulate grenade movement toward bot's goal
    while ((p === 0 && simGrenade[2] < 0) || (p === 1 && simGrenade[2] > 0)) {
      simGrenade[0] += simGrenade[2];
      simGrenade[1] += simGrenade[3];

      var goalNum = this.isGrenadeInGoal(simGrenade);
      if (goalNum < 2) {
        // Grenade hits bot's goal
        hitGoal = goalNum === p;
        break;
      }

      this.handleGrenadeWallCollisions(simGrenade);
    }

    if (hitGoal) {
      // Move ahead of the goal so the bot punches horizontally
      if (p === 0) {
        this.botTarget[2 * p] = ((simGrenade[0] + Game.GRENADE_SIZE / 2) - simGrenade[2] * Game.SNAKE_W) - Game.SNAKE_W / 2;
        this.botTarget[2 * p + 1] = (simGrenade[1] + Game.GRENADE_SIZE / 2) - simGrenade[3] * Game.SNAKE_W;
      }
      else {
        this.botTarget[2 * p] = ((simGrenade[0] + Game.GRENADE_SIZE / 2) - simGrenade[2] * Game.SNAKE_W) + Game.SNAKE_W / 2;
        this.botTarget[2 * p + 1] = (simGrenade[1] + Game.GRENADE_SIZE / 2) - simGrenade[3] * Game.SNAKE_W;
      }
    }
    else {
      // Avoid grenade
      // Simulate grenade movement away from bot's goal; if it hits bot, set target away, otherwise don't move
      simGrenade = new Int16Array([ this.grenade[0], this.grenade[1], this.grenade[2], this.grenade[3] ]);
      while (simGrenade[0] > minX) {
        simGrenade[0] += simGrenade[2];
        simGrenade[1] += simGrenade[3];

        if (this.isGrenadeInPlayer(simGrenade, p)) {
          if (p === 0) {
            this.botTarget[2 * p] = 0.25 * Game.SCREEN_W;
          }
          else {
            this.botTarget[2 * p] = 0.75 * Game.SCREEN_W;
          }
          this.botTarget[2 * p + 1] = Game.SCREEN_H / 2 + (Game.SCREEN_H / 2 - simGrenade[1]) + Game.GRENADE_SIZE / 2;
          break;
        }
        this.handleGrenadeWallCollisions(simGrenade);
      }
    }

    // Update sprite clip and velocity
    if (this.botTarget[2 * p + 1] !== this.players[4 * p + 1]) {
      this.spriteClips[2 * p] = 1;
      if (this.botTarget[2 * p + 1] > this.players[4 * p + 1]) {
        this.spriteClips[2 * p + 1] = 1;
        this.players[4 * p + 3] = 1;
      }
      else if (this.botTarget[2 * p + 1] < this.players[4 * p + 1]) {
        this.spriteClips[2 * p + 1] = 0;
        this.players[4 * p + 3] = -1;
      }
    }
    if (this.botTarget[2 * p] !== this.players[4 * p]) {
      this.spriteClips[2 * p] = 5;
      if (this.botTarget[2 * p] > this.players[4 * p]) {
        this.spriteClips[2 * p + 1] = 1;
        this.players[4 * p + 2] = 1;
      }
      else if (this.botTarget[2 * p] < this.players[4 * p]) {
        this.spriteClips[2 * p + 1] = 0;
        this.players[4 * p + 2] = -1;
      }
    }
  }

  updateBot(p) {
    // Only try to punch if not already punching
    if (!this.inputs[p].punch) {
      // Get distances between bot and grenade
      var left   = this.grenade[0] + this.grenade[2];
      var right  = (this.grenade[0] + this.grenade[2]) + Game.GRENADE_SIZE;
      var top    = this.grenade[1] + this.grenade[3];
      var bottom = (this.grenade[1] + this.grenade[3]) + Game.GRENADE_SIZE;
      // Intercept and punch grenade
      if (this.isGrenadeInPunchRange([ left, top ], p)) {
        // After the number of reliable hits, the bot may miss
        if (this.botReliableHits > 0 || Math.random() < Game.BOT_HIT_CHANCE) {
          // var xDist = Math.abs(this.players[4 * p] - (left + Game.GRENADE_SIZE / 2));
          var yDist = Math.abs(this.players[4 * p + 1] - (top + Game.GRENADE_SIZE / 2));

          if (yDist < Game.SNAKE_H / 2) {
            // Aim left/right
            this.spriteClips[2 * p] = 7;
            this.spriteClips[2 * p + 1] = this.grenade[0] < this.players[4 * p] ? 0 : 1;
          }
          else {
            // Aim up/down
            this.spriteClips[2 * p] = 3;
            this.spriteClips[2 * p + 1] = this.grenade[1] < this.players[4 * p + 1] ? 0 : 1;
          }
          this.handlePunch(p);
        }
        else {
          // Set punch countdown so bot doesn't try to punch again the next frame
          this.punchCountdown[p] = Game.PUNCH_DELAY;
        }

        if (this.botReliableHits > 0) {
          this.botReliableHits--;
        }
      }
    }

    // Stop if target reached
    if (this.players[4 * p + 2] && this.players[4 * p] === this.botTarget[2 * p]) {
      if (this.players[7] === 0) {
        this.spriteClips[2 * p] = 4;
      }
      this.players[4 * p + 2] = 0;
    }
    if (this.players[4 * p + 3] && this.players[4 * p + 1] === this.botTarget[2 * p + 1]) {
      if (this.players[4 * p + 2] === 0) {
        this.spriteClips[2 * p] = 0;
      }
      this.players[4 * p + 3] = 0;
    }
  }

  handlePunch(p) {
    if (this.punchCountdown[p] === 0 && !this.inputs[p].punch) {
      this.inputs[p].punch = true;
      // Reflect grenade if close enough
      this.punchCountdown[p] = Game.PUNCH_DELAY;
      this.updateSpriteClip(p, "punch", true);
      // Fire tranquilizer
      if (this.tranquilizers[3 * p + 2] === 1) {
        this.tranquilizers[3 * p] = this.players[4 * p] + this.SNAKE_W * (p * -1);
        this.tranquilizers[3 * p + 1] = this.players[4 * p + 1];
        this.tranquilizers[3 * p + 2] = 2;
      }

      this.playSound(this.room, "punch", p);
    }
  }
  // TODO: update spriteClips client-side instead. The game will have to track player's facing direction a different way
  updateSpriteClip(p, action, keydown) {
    // Only update if grenade is live
    if (this.grenadeState === 0) {
      if (this.inputs[p].punch) {
        if (action === "punch" && keydown) {
          this.spriteClips[2 * p] = this.spriteClips[2 * p] < 4 ? 3 : 7;
        }
      }
      else if (keydown) {
        switch (action) {
          case "up":
            if (this.players[4 * p + 2] === 0) {
              this.spriteClips[2 * p] = 1;
              this.spriteClips[2 * p + 1] = 0;
            }
            break;
          case "down":
            if (this.players[4 * p + 2] === 0) {
              this.spriteClips[2 * p] = 1;
              this.spriteClips[2 * p + 1] = 1;
            }
            break;
          case "left":
            this.spriteClips[2 * p] = 5;
            this.spriteClips[2 * p + 1] = 0;
            break;
          case "right":
            this.spriteClips[2 * p] = 5;
            this.spriteClips[2 * p + 1] = 1;
            break;
          case "punch":
            break;
        }
      }
      else {
        // We have to change the y-position of the spriteclip for certain key releases
        switch (action) {
          case "left":
            if (this.inputs[p].down) {
              this.spriteClips[2 * p + 1] = 1;
            }
            if (this.players[4 * p + 3]) {
              this.spriteClips[2 * p] = 1;
            }
            else {
              this.spriteClips[2 * p] = 4;
            }
            break;
          case "right":
            if (this.inputs[p].up) {
              this.spriteClips[2 * p + 1] = 0;
            }
            if (this.players[4 * p + 3]) {
              this.spriteClips[2 * p] = 1;
            }
            else {
              this.spriteClips[2 * p] = 4;
            }
            break;
          case "up":
          case "down":
            if (this.players[4 * p + 2]) {
              this.spriteClips[2 * p] = 4;
            }
            else {
              this.spriteClips[2 * p] = 0;
            }
            break;
        }
      }
    }
  }

  updatePlayerVel(p, isKeydown) {
    var xVel = 0;
    var yVel = 0;
    if (this.inputs[p].up) {
      yVel--;
    }
    if (this.inputs[p].down) {
      yVel++;
    }
    if (this.inputs[p].left) {
      xVel--;
    }
    if (this.inputs[p].right) {
      xVel++;
    }
    // Stop player movement if punching
    if (this.inputs[p].punch) {
      if (this.players[4 * p + 2]) this.players[4 * p + 2] = 0;
      if (this.players[4 * p + 3]) this.players[4 * p + 3] = 0;
    }
    else {
      this.players[4 * p + 2] = xVel;
      this.players[4 * p + 3] = yVel;
    }
  }
  // Resets the field once a player loses a life
  resetField() {
    this.inputs[0].up    = false;
    this.inputs[0].down  = false;
    this.inputs[0].left  = false;
    this.inputs[0].up    = false;
    this.inputs[0].punch = false;

    this.inputs[1].up    = false;
    this.inputs[1].down  = false;
    this.inputs[1].left  = false;
    this.inputs[1].up    = false;
    this.inputs[1].punch = false;

    this.players[0] = Game.MIN_X[0] + Game.TILE_SIZE;
    this.players[1] = Game.SCREEN_H / 2;
    this.players[2] = 0;
    this.players[3] = 0;

    this.players[4] = Game.MAX_X[1] - Game.TILE_SIZE;
    this.players[5] = Game.SCREEN_H / 2;
    this.players[6] = 0;
    this.players[7] = 0;
    // Do we need this server side?
    this.spriteClips[0] = 4;
    this.spriteClips[1] = 1;
    this.spriteClips[2] = 4;
    this.spriteClips[3] = 0;

    this.asleep[0] = 0;
    this.asleep[1] = 0;

    this.botTarget[0] = this.players[0];
    this.botTarget[1] = this.players[1];
    this.botTarget[2] = this.players[4];
    this.botTarget[3] = this.players[5];

    if (this.bots[0]) {
      this.setBotTarget(0);
    }
    if (this.bots[1]) {
      this.setBotTarget(1);
    }

    this.botReliableHits = Game.BOT_HITS;

    this.grenade[0] = Game.SCREEN_W / 2 - Game.GRENADE_SIZE / 2;
    this.grenade[1] = Game.SCREEN_H / 2 - Game.GRENADE_SIZE / 2;
    this.grenade[2] = 2 * (2 * Math.random() >> 0) - 1;
    this.grenade[3] = 2 * (2 * Math.random() >> 0) - 1;
    this.grenade[4] = 0;
    this.grenade[5] = 0;

    this.grenadeState = 0;
    this.grenadeSpeeds[0] = 2;
    this.grenadeSpeeds[1] = 2;

    this.powerups[2] = 0;
    this.powerups[3] = Game.POWERUP_DELAY;
    this.powerups[6] = 0;
    this.powerups[7] = Game.POWERUP_DELAY;

    this.tranquilizers[3] = 0;
    this.tranquilizers[5] = 0;

    this.powerupMessages[0] = 0;
    this.powerupMessages[1] = 0;
    this.powerupMessages[2] = 0;
    this.powerupMessages[3] = 0;

    this.startCountdown = Game.START_DELAY;
    // // Restart music
    if (this.scene === "game") {
      this.playSound(this.room, "play");
    }
  }
  // Handle input
  handleKeyDown(p, action) {
    // Ready flag?
    if (false) {
      switch (this.scene) {
        case "lobby":
          break;
        case "gameover":
          this.lives[0] = Game.MAX_LIVES;
          this.lives[1] = Game.MAX_LIVES;
          this.resetField();
          this.scene = "game";
          break;
      }
    }

    switch (action) {
      case "up"   : this.inputs[p].up    = true; this.updateSpriteClip(p, "up", true); break;
      case "down" : this.inputs[p].down  = true; this.updateSpriteClip(p, "down", true); break;
      case "left" : this.inputs[p].left  = true; this.updateSpriteClip(p, "left", true); break;
      case "right": this.inputs[p].right = true; this.updateSpriteClip(p, "right", true); break;
      // case "up"   : this.inputs[p].up    = true; break;
      // case "down" : this.inputs[p].down  = true; break;
      // case "left" : this.inputs[p].left  = true; break;
      // case "right": this.inputs[p].right = true; break;
      case "punch": this.handlePunch(p); break;
    }

    if (this.scene === "game") {
      this.updatePlayerVel(p, true);
    }
  }
  handleKeyUp(p, action) {
    switch (action) {
      case "up"   : this.inputs[p].up    = false; this.updateSpriteClip(p, "up", false); break;
      case "down" : this.inputs[p].down  = false; this.updateSpriteClip(p, "down", false); break;
      case "left" : this.inputs[p].left  = false; this.updateSpriteClip(p, "left", false); break;
      case "right": this.inputs[p].right = false; this.updateSpriteClip(p, "right", false); break;
      // case "up"   : this.inputs[p].up    = false; break;
      // case "down" : this.inputs[p].down  = false; break;
      // case "left" : this.inputs[p].left  = false; break;
      // case "right": this.inputs[p].right = false; break;
      case "punch": break;
    }
    if (this.scene === "game") {
      this.updatePlayerVel(p, false);
    }
  }

  update() {
    switch (this.scene) {
      case "title":
        break;
      case "game":
        var now = Date.now();
        this.accumulator += now - this.lastTimestamp;
        this.lastTimestamp = now;

        while (this.accumulator >= Game.DELTA_TIME) {
          this.accumulator -= Game.DELTA_TIME;

          if (this.startCountdown !== 0) {
            this.startCountdown -= Game.DELTA_TIME;
            if (this.startCountdown <= 0) {
              this.startCountdown = 0;
            }
          }
          else if (this.grenadeState === 0) {
            // Update bot logic if a bot match
            if (this.bots[0]) {
              this.updateBot(0);
            }
            if (this.bots[1]) {
              this.updateBot(1);
            }

            // Update players
            this.updatePlayer(0);
            this.updatePlayer(1);

            // Update grenade
            this.grenade[0] += this.grenadeSpeeds[this.grenade[0] / (Game.SCREEN_W / 2) >> 0] * this.grenade[2];
            this.grenade[1] += this.grenadeSpeeds[this.grenade[0] / (Game.SCREEN_W / 2) >> 0] * this.grenade[3];
            // Check whether grenade enters a goal
            var goal = this.isGrenadeInGoal(this.grenade);

            if (goal < 2) {
              this.explodeGrenade(goal);
            }
            else {
              // Bounce off of walls
              var bounced = false;
              if (this.grenade[1] < Game.TILE_SIZE) {
                this.grenade[1] = Game.TILE_SIZE;
                this.grenade[3] = 1;
                bounced = true;
              }
              else if (this.grenade[1] > Game.SCREEN_H - (Game.GRENADE_SIZE + Game.TILE_SIZE)) {
                this.grenade[1] = Game.SCREEN_H - (Game.GRENADE_SIZE + Game.TILE_SIZE);
                this.grenade[3] = -1;
                bounced = true;
              }
              if (this.grenade[0] < Game.TILE_SIZE) {
                this.grenade[0] = Game.TILE_SIZE;
                this.grenade[2] = 1;
                bounced = true;
              }
              else if (this.grenade[0] > Game.SCREEN_W - (Game.GRENADE_SIZE + Game.TILE_SIZE)) {
                this.grenade[0] = Game.SCREEN_W - (Game.GRENADE_SIZE + Game.TILE_SIZE);
                this.grenade[2] = -1;
                bounced = true;
              }

              if (bounced) {
                // playRicochetSound();
                this.playSound(this.room, "ricochet");
                if (this.bots[0]) {
                  this.setBotTarget(0);
                }
                if (this.bots[1]) {
                  this.setBotTarget(1);
                }
              }
            }

            // Handle collisions
            this.handleGrenadeCollisions(0);
            this.handleGrenadeCollisions(1);
          }

          if (this.resetCountdown !== 0) {
            this.resetCountdown -= Game.DELTA_TIME;
            if (this.resetCountdown <= 0) {
              this.resetCountdown === 0;
              // Reduce player's lives and check whether player lost all lives
              if (--this.lives[this.lostPlayer] === 0) {
                // music.pause();
                this.playSound(this.room, "pause");
                this.scene = "gameover";
                this.winner = 1 - this.lostPlayer;
                // Set winning player's spriteclip to running and losing player's spriteclip to standing
                if (this.lostPlayer === 0) {
                  this.spriteClips[0] = 4;
                  this.spriteClips[2] = 5;
                }
                else {
                  this.spriteClips[0] = 5;
                  this.spriteClips[2] = 4;
                }
                // Player 1 facing right, 2 facing left
                this.spriteClips[1] = 1;
                this.spriteClips[3] = 0;
                this.players[0] = 3 * Game.TILE_SIZE;
                this.players[1] = Game.SCREEN_H / 2;
                this.players[4] = Game.SCREEN_W - (3 * Game.TILE_SIZE);
                this.players[5] = Game.SCREEN_H / 2;
              }
              // Reset grenade and player positions
              this.resetField();
            }
          }

          // Update grenade animation clip
          if (this.grenadeState !== 2) {
            this.grenade[4] += Game.DELTA_TIME;
            if (this.grenade[4] === Game.DELTA_TIME * 120) {
              this.grenade[4] = 0;
            }
            if (this.grenade[4] === Game.DELTA_TIME * 30) {
              this.grenade[4] = 0;
              this.grenade[5] += this.grenadeState === 0 ? 14 : Game.SNAKE_W;
              switch (this.grenadeState) {
                case 0:
                  if (this.grenade[5] > 42) {
                    // Reset animation frame so it loops
                    this.grenade[5] = 0;
                  }
                  break;
                case 1:
                  if (this.grenade[5] === Game.SNAKE_W * 4) {
                    // End explosion animation
                    this.grenadeState = 2;
                    // Remove firing tranquilizers
                    if (this.tranquilizers[2] === 2) this.tranquilizers[2] = 0;
                    if (this.tranquilizers[5] === 2) this.tranquilizers[5] = 0;
                    // Start countdown to reset game
                    this.resetCountdown = Game.RESET_DELAY;
                  }
                  break;
              }
            }
          }

          if (this.resetCountdown === 0) {
            // Update powerups
            this.updatePowerup(0);
            this.updatePowerup(1);
          }

          // Update tranquilizers
          if (this.tranquilizers[2] === 2) {
            this.updateTranquilizer(0);
          }
          if (this.tranquilizers[5] === 2) {
            this.updateTranquilizer(1);
          }
        }
        break;
      case "gameover":
        break;
    }
  }

  reset() {
    this.resetField();

    this.scene = "game";
    this.accumulator = Game.DELTA_TIME;
    this.lastTimestamp = Date.now();
    this.wantsRematch[0] = false;
    this.wantsRematch[1] = false;
    this.lives[0] = 5;
    this.lives[1] = 5;
  }

  getData() {
    return {
      players         : this.players,
      spriteClips     : this.spriteClips,
      lives           : this.lives,
      asleep          : this.asleep,
      grenade         : this.grenade,
      grenadeState    : this.grenadeState,
      grenadeSpeeds   : this.grenadeSpeeds,
      powerups        : this.powerups,
      tranquilizers   : this.tranquilizers,
      powerupMessages : this.powerupMessages,
      startCountdown  : this.startCountdown,
      scene           : this.scene,
      winner          : this.winner,
      lostPlayer      : this.lostPlayer
    };
  }
}
// Constants
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
// Number of times the bot will always punch
Game.BOT_HITS = 5;
Game.BOT_HIT_CHANCE = 0.95;

Game.SPAWN_CHANCE = 0.25;
Game.POWERUP_DELAY = 5000;
Game.POWERUP_RADIUS = 12;
Game.POWERUP_SIZE = 32;
Game.HALF_POWERUP_SIZE = Game.POWERUP_SIZE / 2;
Game.MESSAGE_DELAY = 1000;
Game.GOAL_W = Game.TILE_SIZE;
Game.GOAL_H = 6 * Game.TILE_SIZE;
Game.GRENADE_SIZE = 12;
Game.START_DELAY = 600;
Game.RESET_DELAY = 1000;
Game.MAX_LIVES = 5;
Game.PLAYER_FRAME_MAX = 180;
Game.SLEEP_DELAY = 1000;

// Export Game class
module.exports = Game;
