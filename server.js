var http = require('http');
var url = require('url');
var fs = require('fs');
var ws = require('ws');
var crypto = require('crypto');

var map_width = 40;
var map_height = 40;

var server = http.createServer(function (req, res) {
	var path = url.parse(req.url).pathname;
	//Routing
	switch (path) {
		case '/':
			fs.readFile(__dirname + '/index.html', function (error, data) {
				if (error) {
					res.writeHead(404);
					res.write("<h1>Oops! This page doesn't seem to exist! 404</h1>");
					res.end();
				} else {
					res.writeHead(200, { 'Content-Type': 'text/html' });
					res.write(data, 'utf8');
					res.end();
				}
			});
			break;
		case '/play':
			var name = url.parse(req.url, true).query.name;
			var game = url.parse(req.url, true).query.game;
			if(!name || !game) {
				res.writeHead(302, { Location: '/' }); //Send em home
				res.end();
				break;
			}
			//Serve the page.
			fs.readFile(__dirname + path + '.html', function (error, data) {
				if (error) {
					res.writeHead(404);
					res.write("<h1>Oops! This page doesn't seem to exist! 404</h1>");
					res.end();
				} else {
					res.writeHead(200, { 'Content-Type': 'text/html' });
					res.write(data, 'utf8');
					res.end();
				}
			});
			break;
		case '/client.js':
			fs.readFile(__dirname + path, function (error, data) {
				if (error) {
					res.writeHead(404);
					res.write("<h1>Oops! This page doesn't seem to exist! 404</h1>");
					res.end();
				} else {
					res.writeHead(200, { 'Content-Type': 'text/js' });
					res.write(data, 'utf8');
					res.end();
				}
			});
			break;
		case '/style.css':
			fs.readFile(__dirname + path, function (error, data) {
				if (error) {
					res.writeHead(404);
					res.write("<h1>Oops! This page doesn't seem to exist! 404</h1>");
					res.end();
				} else {
					res.writeHead(200, { 'Content-Type': 'text/css' });
					res.write(data, 'utf8');
					res.end();
				}
			});
			break;
		case '/snakes.png':
			fs.readFile(__dirname + path, function (error, data) {
				if (error) {
					res.writeHead(404);
					res.write("<h1>Oops! This page doesn't seem to exist! 404</h1>");
					res.end();
				} else {
					res.writeHead(200, { 'Content-Type': 'text/png' });
					res.write(data, 'utf8');
					res.end();
				}
			});
			break;
		default:
			res.writeHead(404);
			res.write("<h1>Oops! This page doesn't seem to exist! 404</h1>");
			res.end();
			break;
	}
});
var port = process.env.PORT || 8080;
server.listen(port, function () {
	console.log('Listening on port ' + port + '...');
});

var connections = {};
var games = {};

var io = new ws.WebSocketServer({ server: server });

io.on('connection', function (socket, req) {
	socket.id = crypto.randomBytes(16).toString("hex");

	var listeners = {};
	function addSocketListener(type, callback) {
		listeners[type] = callback;
	}
	socket.addEventListener('message', function(event) {
		try {
			var [type, ...args] = JSON.parse(event.data);
		} catch(err) {
			console.error(err);
			return;
		}
		if(type !== 'join' && !connections[socket.id]) {
			return;
		}
		if(listeners[type]) { try {
			listeners[type].apply(socket, args);
		} catch(err) {
			console.error(err);
		} }
	});
	socket.sendMessage = function() {
		this.send(JSON.stringify(Array.prototype.slice.call(arguments)));
	}

	addSocketListener('join', function(connecting_as_name, connecting_to_game) {
		connections[socket.id] = {
			socket,
			name: connecting_as_name,
			game: connecting_to_game,
		};
		if (typeof games[connecting_to_game] === 'undefined') {
			games[connecting_to_game] = {
				players: [],
				map: {},
				status: 'pregame',
			};
		}
		games[connecting_to_game].players.push({
			id: socket.id,
			snake: [],
			alive: false,
			moving: 'N',
			turning: 'N',
		});
		socket.sendMessage('loadmap', games[connecting_to_game].map);
		var playerlist = games[connecting_to_game].players.map(function({ id }) { return connections[id].name; });
		games[connecting_to_game].players.map(function({ id }) {
			connections[id].socket.sendMessage('playerlist', playerlist);
		});
	});
	addSocketListener('startgame', function () {
		var game = games[connections[socket.id].game];
		if (game.status === 'pregame' && game.players.length > 1) {
			var startpos = [
				['1,20','2,20'],
				['38,20','37,20'],
				['20,38','20, 37'],
				['20,1','20,2'],
			];
			var startdir = ['E', 'W', 'N', 'S'];
			game.map = {};
			game.players.map(function(player, i) {
				player.snake = startpos[i].slice();
				player.alive = true;
				player.moving = player.turning = startdir[i];
				game.map[player.snake[0]] = directionalIcon(i, null, player.snake[0], player.snake[1]);
				game.map[player.snake[1]] = directionalIcon(i, player.snake[0], player.snake[1], null);
			});
			game.status = 'ingame';
			game.players.map(function({ id }) {
				connections[id].socket.sendMessage('loadmap', game.map);
			});
		}
	});
	addSocketListener('turn', function (dir) {
		var game = games[connections[socket.id].game];
		if (game.status === 'ingame') {
			game.players.map(function(player) {
				if (player.id === socket.id) {
					player.turning = dir;
				}
			});
		}
	});
	socket.addEventListener('close',function() {
		if (connections[socket.id]) {
			cleanupMissingPlayers(connections[socket.id].game);
		}
	});
});

function cleanupMissingPlayers(game_name) {
	var game = games[game_name];
	if (game.status === 'pregame') {
		var i = game.players.length - 1;
		for (; i >= 0; i--)
		{
			if(connections[game.players[i].id].socket.readyState != ws.OPEN) {
				delete connections[game.players[i].id];
				game.players.splice(i, 1);
			}
		}
		var playerlist = game.players.map(function({ id }) { return connections[id].name; });
		game.players.map(function({ id }) {
			connections[id].socket.sendMessage('playerlist', playerlist);
		});
	}
	if (game.players.every(function({ id }) {
		return connections[id].socket.readyState != ws.OPEN;
	})) {
		delete games[game_name];
		game.players.map(function({ id }) {
			delete connections[id];
		});
	}
}

function dir2pos(from, dir) {
	var coords = from.split(',').map(Number);
	switch(dir) {
	case 'N':
		coords[1]--;
		break;
	case 'E':
		coords[0]++;
		break;
	case 'S':
		coords[1]++;
		break;
	case 'W':
		coords[0]--;
		break;
	}
	return coords.join(',');
}

function isBlocked(pos, map) {
	var coords = pos.split(',').map(Number);
	if(coords[0] < 0 || coords[0] >= map_width || coords[1] < 0 || coords[1] >= map_height) return true;
	if(typeof map[pos] !== "undefined") return true;
	return false;
}

function pos2dir(from, to) {
	if(from === null || to === null) return null;
	var coords_1 = from.split(',').map(Number);
	var coords_2 = to.split(',').map(Number);
	var x = coords_2[0] - coords_1[0];
	var y = coords_2[1] - coords_1[1];
	if(y < 0) return 'N';
	if(x > 0) return 'E';
	if(y > 0) return 'S';
	if(x < 0) return 'W';
}

function directionalIcon(player, prev, tile, next) {
	var a = pos2dir(prev, tile);
	var b = pos2dir(tile, next);
	var rotation = ['W','N','E','S'].indexOf(a);
	var heading = ['W','N','E','S'].indexOf(b);
	var type;
	if(rotation === -1) {
		type = 4;
		rotation = heading;
	} else if(heading === -1) {
		type = 0;
	} else {
		if(heading === rotation) type = 1;
		else if(heading - rotation === 1 || heading - rotation === -3) type = 2;
		else if(heading - rotation === 3 || heading - rotation === -1) type = 3;
		else type = 4;
	}
	return [type, player, rotation].join('');
}

setInterval(function() {
	Object.values(games).map(function(game) {
		if(game.status === 'ingame') {
			var messages = [];
			var alive_players = 0;
			game.players.map(function(player, i) {
				if(player.alive) {
					var from = player.snake[player.snake.length-1];
					var to = dir2pos(from, player.turning);
					if(isBlocked(to, game.map)) {
						to = dir2pos(from, player.moving);
					} else {
						player.moving = player.turning;
					}
					if(isBlocked(to, game.map)) {
						// Hit a barrier, lose some size
						var tail = player.snake.shift();
						delete game.map[tail];
						messages.push({ action: 'clear', tile: tail });
						if(player.snake.length > 1) {
							game.map[player.snake[0]] = directionalIcon(i, null, player.snake[0], player.snake[1]);
							messages.push({ action: 'add', tile: player.snake[0], icon: game.map[player.snake[0]] });
						} else {
							// Player is dead
							var head = player.snake.pop();
							delete game.map[head];
							messages.push({ action: 'clear', tile: head });
							player.alive = false;
						}
					} else {
						player.snake.push(to);
						var heading = player.snake.slice(-3);
						game.map[from] = directionalIcon(i, heading[0], heading[1], heading[2]);
						messages.push({ action: 'add', tile: from, icon: game.map[from] });
						game.map[to] = directionalIcon(i, heading[1], heading[2], null);
						messages.push({ action: 'add', tile: to, icon: game.map[to] });
					}
					alive_players++;
				}
			});
			if(alive_players <= 1) {
				var winner = game.players.find(player=>player.alive);
				if(winner) {
					messages.push({ action: 'winner', name: connections[winner.id].name });
				} else {
					messages.push({ action: 'draw_game' });
				}
				game.status = 'pregame';
			}
			game.players.map(function({ id }) {
				connections[id].socket.sendMessage('map_update', messages);
			});
		}
	});
}, 200);
