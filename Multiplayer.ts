import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { World } from '../world/World';
import { Character } from '../characters/Character';
import { IUpdatable } from '../interfaces/IUpdatable';
import { RemotePlayer } from './RemotePlayer';

/**
 * Presence-only multiplayer. Each client reports where its own character is and what it is
 * doing, and draws everyone else as non-interactive ghosts. Gameplay itself is untouched.
 *
 * Server address: ?server=ws://host:port in the page URL, or window.SKETCHBOOK_SERVER,
 * otherwise ws(s)://<page hostname>:8081.
 */
export class Multiplayer implements IUpdatable
{
	public updateOrder: number = 10;

	private world: World;
	private socket: WebSocket;
	private players: { [id: number]: RemotePlayer } = {};
	private pending: any[] = [];
	private characterGltf: any;
	private sendTimer: number = 0;
	private sendInterval: number = 1 / 20;
	private retryDelay: number = 2000;
	private warned: boolean = false;

	private tmpPos: THREE.Vector3 = new THREE.Vector3();
	private tmpQuat: THREE.Quaternion = new THREE.Quaternion();

	constructor(world: World, characterModelPath: string = 'build/assets/boxman.glb')
	{
		this.world = world;

		new GLTFLoader().load(characterModelPath, (gltf) =>
		{
			this.characterGltf = gltf;
			// Handle anything that arrived while the model was loading
			const queued = this.pending;
			this.pending = [];
			queued.forEach((msg) => this.handleMessage(msg));
		}, undefined, (error) => console.error('Multiplayer: could not load character model', error));

		this.connect();
	}

	public update(timeStep: number, unscaledTimeStep: number): void
	{
		// Ghosts follow real time, so they don't slow down when the local player uses slow motion
		const dt = Math.min(unscaledTimeStep, 0.1);
		for (const id in this.players) this.players[id].update(dt);

		this.sendTimer += dt;
		if (this.sendTimer >= this.sendInterval)
		{
			this.sendTimer = 0;
			this.sendLocalState();
		}
	}

	private getServerUrl(): string
	{
		const param = new URLSearchParams(window.location.search).get('server');
		if (param) return param;
		if ((window as any).SKETCHBOOK_SERVER) return (window as any).SKETCHBOOK_SERVER;
		const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
		return protocol + '://' + (window.location.hostname || 'localhost') + ':8081';
	}

	private connect(): void
	{
		let socket: WebSocket;
		try
		{
			socket = new WebSocket(this.getServerUrl());
		}
		catch (e)
		{
			this.scheduleReconnect();
			return;
		}
		this.socket = socket;

		socket.onopen = () =>
		{
			this.retryDelay = 2000;
			this.warned = false;
		};
		socket.onmessage = (event) =>
		{
			let msg;
			try { msg = JSON.parse(event.data); } catch (e) { return; }
			if (this.characterGltf) this.handleMessage(msg);
			else this.pending.push(msg);
		};
		socket.onclose = () =>
		{
			this.clearPlayers();
			this.scheduleReconnect();
		};
		socket.onerror = () =>
		{
			if (!this.warned)
			{
				console.info('Multiplayer: server not reachable at ' + this.getServerUrl() + ' (will keep retrying). Start it with "npm run server".');
				this.warned = true;
			}
		};
	}

	private scheduleReconnect(): void
	{
		setTimeout(() => this.connect(), this.retryDelay);
		this.retryDelay = Math.min(this.retryDelay * 1.5, 15000);
	}

	private handleMessage(msg: any): void
	{
		switch (msg.type)
		{
			case 'welcome':
				this.clearPlayers();
				msg.players.forEach((p: any) =>
				{
					this.addPlayer(p.id, p.name, p.hue);
					if (p.state) this.players[p.id].setState(p.state.s, p.state.a);
				});
				break;
			case 'join':
				this.addPlayer(msg.id, msg.name, msg.hue);
				break;
			case 'state':
				if (!this.players[msg.id]) this.addPlayer(msg.id, 'Player ' + msg.id, 200);
				this.players[msg.id].setState(msg.s, msg.a);
				break;
			case 'name':
				if (this.players[msg.id]) this.players[msg.id].setName(msg.name);
				break;
			case 'leave':
				this.removePlayer(msg.id);
				break;
		}
	}

	private addPlayer(id: number, name: string, hue: number): void
	{
		if (this.players[id]) return;
		this.players[id] = new RemotePlayer(this.world, this.characterGltf, id, name, hue);
	}

	private removePlayer(id: number): void
	{
		if (!this.players[id]) return;
		this.players[id].dispose();
		delete this.players[id];
	}

	private clearPlayers(): void
	{
		for (const id in this.players) this.removePlayer(Number(id));
	}

	private sendLocalState(): void
	{
		if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;

		const receiver = this.world.inputManager.inputReceiver;
		if (!(receiver instanceof Character)) return;

		// World-space values so a character sitting inside a vehicle is reported correctly too
		receiver.getWorldPosition(this.tmpPos);
		receiver.getWorldQuaternion(this.tmpQuat);

		const r = (n: number) => Math.round(n * 1000) / 1000;
		this.socket.send(JSON.stringify({
			type: 'state',
			s: [r(this.tmpPos.x), r(this.tmpPos.y), r(this.tmpPos.z), r(this.tmpQuat.x), r(this.tmpQuat.y), r(this.tmpQuat.z), r(this.tmpQuat.w)],
			a: receiver.currentAnimation || 'idle'
		}));
	}
}
