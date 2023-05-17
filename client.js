// Load parameters from URL
var urlParams = new URLSearchParams(window.location.search);
var player_name = urlParams.get("name");
var game_name = urlParams.get("game");
if(!player_name || !game_name) window.location = '/';

var listeners = {};
function addSocketListener(type, callback)
{
	listeners[type] = callback;
}
var socket;
function connectSocket(reconnecting)
{
	var protocol = (window.location.protocol === 'https:') ? 'wss:' : 'ws:';
	socket = new WebSocket(protocol+'//'+window.location.host+'/');
	socket.addEventListener('open', function()
	{
		socket.sendMessage('join', player_name, game_name);
	});
	socket.addEventListener('close',function()
	{
		document.getElementById('game_map').style.opacity = 0.5;;
	});
	socket.addEventListener('message', function(event)
	{
		var [type, ...args] = JSON.parse(event.data);
		if(listeners[type]) {
			listeners[type].apply(socket, args);
		}
	});
	socket.sendMessage = function()
	{
		this.send(JSON.stringify(Array.prototype.slice.call(arguments)));
	}
}
connectSocket();
addSocketListener('playerlist', function(playerlist)
{
	var userlist = document.getElementById('userlist');
	userlist.innerHTML = '';
	playerlist.map(function(name) {
		var ul = document.createElement('ul');
		ul.innerText = name;
		userlist.appendChild(ul);
	});
});
addSocketListener('loadmap', function(map)
{
	var canvas = document.getElementById('game_map');
	var context = canvas.getContext('2d');
	context.clearRect(0, 0, canvas.width, canvas.height);
	Object.entries(map).map(function([key, value]) {
		placeIconAtCoords(key, value);
	});
	win_screen.style.display = 'hidden';
});
addSocketListener('map_update', function(commands)
{
	commands.map(function(command) {
		switch(command.action) {
		case 'clear':
			placeIconAtCoords(command.tile, null);
			break;
		case 'add':
			placeIconAtCoords(command.tile, command.icon);
			break;
		case 'winner':
			var win_screen = document.getElementById('win_screen');
			win_screen.innerText = command.name + ' has won the game!';
			win_screen.style.display = 'block';
			break;
		case 'draw_game':
			var win_screen = document.getElementById('win_screen');
			win_screen.innerText = 'Draw game';
			win_screen.style.display = 'block';
			break;
		}
	});
});
document.addEventListener('keydown', function(e) {
	switch(e.key) {
	case "ArrowUp":
        socket.sendMessage('turn', 'N');
		break;
	case "ArrowRight":
        socket.sendMessage('turn', 'E');
		break;
	case "ArrowDown":
        socket.sendMessage('turn', 'S');
		break;
	case "ArrowLeft":
        socket.sendMessage('turn', 'W');
		break;
	case "Enter":
        socket.sendMessage('startgame');
		break;
    }
});

var imgSnakes = new Image();
imgSnakes.src = 'snakes.png';
function placeIconAtCoords(tile, icon) {
	var canvas = document.getElementById('game_map');
	var context = canvas.getContext('2d');
	var coords = tile.split(',').map(Number);
	context.clearRect(coords[0]*16, coords[1]*16, 16, 16);
	if(icon) {
		[type, player, rotation] = icon.split('').map(Number);
		context.translate(coords[0]*16+8, coords[1]*16+8);
		context.rotate(rotation*Math.PI/2);
		context.drawImage(imgSnakes, type*16, player*16, 16, 16, -8, -8, 16, 16);
		context.rotate(-rotation*Math.PI/2);
		context.translate(-(coords[0]*16+8), -(coords[1]*16+8));
	}
}