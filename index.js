const PORT = process.env.PORT || 4500;

var express = require('express');
var app = express();
var path = require('path');
var server = require('http').Server(app);
var io = require('socket.io')(server);

var Game = require("./src/game.js");

server.listen(PORT, () => {
  console.log('Server listening at port %d', PORT);
});

// Generate random player names
function generatePlayerName() {
  const LENGTH = 32;
  const DESCRIPTORS = [
    "Solid",
    "Liquid",
    "Venom",
    "Revolver",
    "Sniper",
    "Psycho",
    "Gray",
    "Mad",
    "Vivacious",
    "Silent",
    "Mimic",
    "Sting",
    "Launch",
    "Grand",
    "Stubborn",
    "Perspective",
    "March",
    "Vulcan",
    "Decoy",
    "Poison",
    "Diminuitive",
    "Harsh",
    "Majestic",
    "Rampant",
    "Brilliant",
    "Distant",
    "Sword",
    "Frivolous",
    "Distraught",
    "Imaginary",
    "Alert",
    "Caution"
  ];
  const ANIMALS = [
    "Snake",
    "Ocelot",
    "Wolf",
    "Mantis",
    "Fox",
    "Octopus",
    "Pangolin",
    "Vole",
    "Orangutan",
    "Alligator",
    "Chameleon",
    "Raven",
    "Hawk",
    "Scorpion",
    "Rhinoceros",
    "Sloth",
    "Rabbit",
    "Walrus",
    "Panther",
    "Elephant",
    "Tortoise",
    "Frog",
    "Dog",
    "Aardvark",
    "Spider",
    "Squid",
    "Mongoose",
    "Cobra",
    "Crab",
    "Rat",
    "Horse",
    "Goat"
  ];
  return DESCRIPTORS[Math.random() * LENGTH >> 0] + " " + ANIMALS[Math.random() * LENGTH >> 0];
}
// Limit how many times a user can reroll their name
const REROLL_LIMIT = 5;

// Routing
app.use(express.static(path.join(__dirname, 'public')));

app.get("/", (request, response) => {
  response.sendFile(path.join(__dirname, 'public/index.html'));
});

// Add player to existing game, or if no games, create a new game with the user as the first player (player 0)
var waitingGames = [];
var games = [];

function playSound(room, sound, p) {
  io.to(room).emit("play sound", sound, p);
}

// Run update loop for all games
var intervalID = setInterval(() => {
  for (var i = 0; i < games.length; i++) {
    if (games[i].scene === "game") {
      games[i].update();
      io.to(games[i].room).emit("update", games[i].getData());
    }
  }
}, 10);

io.on("connection", (socket) => {
  var name = generatePlayerName();
  console.log("User %s connected: %s", socket.id, name);
  var scene = "title"; // title, lobby, game
  var rerolls = REROLL_LIMIT;
  var game, gameIndex, playerNum, room;

  socket.emit("welcome", { name: name, rerolls: rerolls, gamesAvailable: waitingGames.length > 0 });

  function handleKeyDown(data) {
    switch (scene) {
      case "title":
        scene = "lobby";
        socket.emit("change scene", scene);
        break;
      case "lobby":
      case "game":
        if (game) {
          switch (game.scene) {
            case "game": game.handleKeyDown(playerNum, data.action); break;
            case "gameover":
              // Rematch or return to lobby
              switch (data.action) {
                case "punch":
                  // Flag this player as wanting rematch, and only reset if both players are willing, or the other player is a bot
                  // Game.setWantsRematch(game, playerNum);
                  game.setWantsRematch(playerNum);
                  socket.broadcast.to(room).emit("wants rematch", playerNum);
                  if ((game.wantsRematch[0] || game.bots[0]) && (game.wantsRematch[1] || game.bots[1])) {
                    // Game.reset(game);
                    // io.to(room).emit("rematch", Game.getData(game));
                    game.reset();
                    io.to(room).emit("rematch", game.getData());
                  }
                  break;
                case "reroll":
                  // Return player to lobby instead of rematching
                  io.to(room).emit("change scene", "lobby");
                  games.splice(gameIndex, 1);
                  console.log("Game count %d", games.length);
                  if (games.length === 0) {
                    io.emit("no games available");
                  }
                  game = null;
                  break;
              }
              break;
          }
        }
        break;
    }
  }

  function handleKeyUp(data) {
    switch (scene) {
      case "lobby":
      case "game":
        if (game) {
          game.handleKeyUp(playerNum, data.action);
        }
        break;
    }
  }

  socket.on("keydown", handleKeyDown);
  socket.on("keyup", handleKeyUp);

  socket.on("reroll name", () => {
    if (rerolls > 0) {
      rerolls--;
      name = generatePlayerName();
      socket.emit("new name", { name: name, rerolls: rerolls });
    }
    else {
      socket.emit("reroll limit", "Out of rerolls");
    }
  });

  socket.on("create game", () => {
    console.log("create game");
    // Don't allow the client to create a new game if there already is one
    if (!game) {
      // Create a new game
      playerNum = 0;
      room = (Date.now()).toString();
      game = new Game(name, room, 0, playSound);
      console.log("New game waiting in room %d", game.room);
      socket.join(room);
      waitingGames.push(game);
      gameIndex = waitingGames.length - 1;

      socket.emit("game created", playerNum);
      io.emit("games available");
    }
    else {
      socket.emit("game exists", "Game already exists!");
    }
  });

  socket.on("join game", () => {
    // Look for a game awaiting a second player
    for (var i = 0; i < waitingGames.length; i++) {
      if (waitingGames[i]) {
        playerNum = 1;
        game = waitingGames.splice(i, 1)[0];
        game.addPlayer(name);
        games.push(game);
        gameIndex = i;
        // Update all clients if this was the only waiting game
        if (waitingGames.length === 0) {
          io.emit("no games available");
        }
        // Join game's room so both players receive updates
        room = game.room;
        socket.join(room);
        console.log("New game between %s and %s", game.names[0], game.names[1]);
        // Send player number to client
        socket.emit("player num", playerNum);
        // Tell each client to start the game, and include the opponent's name
        io.to(room).emit("start game", game.names);
        break;
      }
    }
  });

  socket.on("vs bot", () => {
    playerNum = 0;
    room = (Date.now()).toString();
    socket.join(room);
    game = new Game(name, room, 1, playSound);
    console.log("New bot match in room %d", room);
    gameIndex = games.length - 1;
    var botName = generatePlayerName();
    game.addPlayer(botName);
    games.push(game);
    socket.emit("start bot match", botName);
  });

  socket.on("opponent disconnected", () => {
    // Client reports that opponent disconnected
    // TODO: See whether we can communicate directly from the back-end socket to this one
    //   so we don't have to rely on the client reporting the disconnect
    game = null;
    scene = "lobby";
  });

  socket.on("disconnect", () => {
    console.log("%s disconnected", name);
    // Report disconnect to opponent
    io.to(room).emit("opponent disconnected");
    // Remove game from active games
    games.splice(gameIndex, 1);
    console.log("Game count %d", games.length);
  });
});
