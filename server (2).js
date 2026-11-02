// Minimal Sketchbook multiplayer relay.
// Every client sends its own state; the server forwards it to everyone else.
// Run with: npm run server   (PORT env var overrides the default 8081)
const WebSocket = require('ws');

const PORT = process.env.PORT || 8081;
const wss = new WebSocket.Server({ port: PORT });

let nextId = 1;
const clients = new Map(); // id -> { ws, name, color, state }

function send(ws, msg)
{
	if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(msg, exceptId)
{
	const data = JSON.stringify(msg);
	clients.forEach((c, id) =>
	{
		if (id !== exceptId && c.ws.readyState === WebSocket.OPEN) c.ws.send(data);
	});
}

wss.on('connection', (ws) =>
{
	const id = nextId++;
	const hue = Math.floor(Math.random() * 360);
	const client = { ws, name: 'Player ' + id, hue, state: null };
	clients.set(id, client);

	// Tell the newcomer who they are and who is already here
	const others = [];
	clients.forEach((c, cid) =>
	{
		if (cid !== id) others.push({ id: cid, name: c.name, hue: c.hue, state: c.state });
	});
	send(ws, { type: 'welcome', id, name: client.name, hue, players: others });

	// Tell everyone else about the newcomer
	broadcast({ type: 'join', id, name: client.name, hue }, id);

	ws.on('message', (raw) =>
	{
		let msg;
		try { msg = JSON.parse(raw); } catch (e) { return; }
		if (!msg || typeof msg !== 'object') return;

		if (msg.type === 'state' && Array.isArray(msg.s) && msg.s.length === 7 && msg.s.every(Number.isFinite))
		{
			client.state = { s: msg.s, a: String(msg.a || 'idle').slice(0, 64) };
			broadcast({ type: 'state', id, s: client.state.s, a: client.state.a }, id);
		}
		else if (msg.type === 'name' && typeof msg.name === 'string')
		{
			client.name = msg.name.slice(0, 20) || client.name;
			broadcast({ type: 'name', id, name: client.name }, id);
		}
	});

	ws.on('close', () =>
	{
		clients.delete(id);
		broadcast({ type: 'leave', id });
	});

	ws.on('error', () => {});
});

console.log('Sketchbook multiplayer server listening on ws://localhost:' + PORT);
