const PORT = process.env.PORT || 4500;

var express = require('express');
var app = express();
var path = require('path');
var server = require('http').Server(app);
var io = require('socket.io')(server);

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
    "Dull",
    "Brilliant",
    "Distant",
    "Sword",
    "Frivolous",
    "Distraught",
    "Imaginary",
    "Alert",
    "Cautious"
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

/*
Add player to existing game, or if no games, create a new game with the user as player 1
*/
var games = [];
var gamesCount = 0;

io.on("connection", (socket) => {
  console.log("User %s connected", socket.id);
  var name = generatePlayerName();
  var rerolls = REROLL_LIMIT;
  socket.emit("name", name);

  socket.on("reroll name", (data) => {
    if (rerolls > 0) {
      rerolls--;
      name = generatePlayerName();
      socket.emit("new name", { name: name, rerolls: rerolls });
    }
    else {
      socket.emit("reroll limit", "Out of rerolls");
    }
  });

  socket.on("start multi", () => {
    for (var i = 0; i < gamesCount; i++) {
      // Look for a game awaiting a second player
    }
    // Create a new game
  });

  socket.on("disconnect", () => {
    console.log("%s disconnected", name);
  });
});
