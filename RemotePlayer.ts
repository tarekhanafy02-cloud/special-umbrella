import * as THREE from 'three';
import { SkeletonUtils } from 'three/examples/jsm/utils/SkeletonUtils';
import { World } from '../world/World';

/**
 * A visual-only stand-in for another player's character.
 * No physics and no input: it just mirrors the state received from the server.
 */
export class RemotePlayer
{
	public id: number;
	public root: THREE.Group = new THREE.Group();
	public lastUpdate: number = 0;

	private world: World;
	private mixer: THREE.AnimationMixer;
	private animations: THREE.AnimationClip[];
	private currentAction: THREE.AnimationAction;
	private currentClipName: string;
	private nameSprite: THREE.Sprite;

	private targetPosition: THREE.Vector3 = new THREE.Vector3();
	private targetQuaternion: THREE.Quaternion = new THREE.Quaternion();
	private hasState: boolean = false;

	constructor(world: World, gltf: any, id: number, name: string, hue: number)
	{
		this.world = world;
		this.id = id;
		this.animations = gltf.animations;

		// Same hierarchy the real Character uses: capsule center at root, model offset below it
		const modelContainer = new THREE.Group();
		modelContainer.position.y = -0.57;
		const model = SkeletonUtils.clone(gltf.scene) as THREE.Object3D;
		modelContainer.add(model);
		this.root.add(modelContainer);

		// Give every player their own tint, with their own material copies
		const tint = new THREE.Color().setHSL(hue / 360, 0.55, 0.75);
		model.traverse((child: any) =>
		{
			if (child.isMesh)
			{
				child.castShadow = true;
				child.receiveShadow = true;
				child.frustumCulled = false;
				if (child.material)
				{
					child.material = child.material.clone();
					if (child.material.color) child.material.color.multiply(tint);
					world.sky.csm.setupMaterial(child.material);
				}
			}
		});

		this.mixer = new THREE.AnimationMixer(model);

		this.nameSprite = this.createNameSprite(name);
		this.nameSprite.position.y = 1.2;
		this.root.add(this.nameSprite);

		this.root.visible = false;
		world.graphicsWorld.add(this.root);
	}

	public setName(name: string): void
	{
		this.root.remove(this.nameSprite);
		this.disposeSprite(this.nameSprite);
		this.nameSprite = this.createNameSprite(name);
		this.nameSprite.position.y = 1.2;
		this.root.add(this.nameSprite);
	}

	public setState(s: number[], animation: string): void
	{
		this.targetPosition.set(s[0], s[1], s[2]);
		this.targetQuaternion.set(s[3], s[4], s[5], s[6]);
		this.lastUpdate = performance.now();

		if (!this.hasState)
		{
			// First packet: snap into place instead of flying in from the origin
			this.root.position.copy(this.targetPosition);
			this.root.quaternion.copy(this.targetQuaternion);
			this.hasState = true;
		}

		this.playAnimation(animation);
	}

	public update(dt: number): void
	{
		if (!this.hasState) return;

		const stale = performance.now() - this.lastUpdate > 3000;
		this.root.visible = !stale;
		if (stale) return;

		// Frame-rate independent smoothing between network updates
		const k = 1 - Math.exp(-dt * 18);
		if (this.root.position.distanceToSquared(this.targetPosition) > 25)
		{
			this.root.position.copy(this.targetPosition); // teleport / respawn
		}
		else
		{
			this.root.position.lerp(this.targetPosition, k);
		}
		this.root.quaternion.slerp(this.targetQuaternion, k);

		this.mixer.update(dt);
	}

	public dispose(): void
	{
		this.world.graphicsWorld.remove(this.root);
		this.mixer.stopAllAction();
		this.disposeSprite(this.nameSprite);
		this.root.traverse((child: any) =>
		{
			if (child.isMesh && child.material) child.material.dispose();
		});
	}

	private playAnimation(clipName: string): void
	{
		if (clipName === this.currentClipName) return;

		const clip = THREE.AnimationClip.findByName(this.animations, clipName);
		if (!clip) return;

		const next = this.mixer.clipAction(clip);
		next.reset().setEffectiveWeight(1).fadeIn(0.15).play();
		if (this.currentAction) this.currentAction.fadeOut(0.15);

		this.currentAction = next;
		this.currentClipName = clipName;
	}

	private createNameSprite(name: string): THREE.Sprite
	{
		const canvas = document.createElement('canvas');
		canvas.width = 256;
		canvas.height = 64;
		const ctx = canvas.getContext('2d');
		ctx.font = 'bold 32px sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.lineWidth = 6;
		ctx.strokeStyle = 'rgba(0,0,0,0.7)';
		ctx.strokeText(name, 128, 32);
		ctx.fillStyle = '#ffffff';
		ctx.fillText(name, 128, 32);

		const texture = new THREE.CanvasTexture(canvas);
		const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
		const sprite = new THREE.Sprite(material);
		sprite.scale.set(1.6, 0.4, 1);
		sprite.renderOrder = 999;
		return sprite;
	}

	private disposeSprite(sprite: THREE.Sprite): void
	{
		const mat = sprite.material as THREE.SpriteMaterial;
		if (mat.map) mat.map.dispose();
		mat.dispose();
	}
}
