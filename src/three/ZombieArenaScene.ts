import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type {
  BlookAvatarId,
  LogicPuzzle,
  ZombieBreachEvent,
  ZombieDefenderPublic,
  ZombieGameSnapshot,
  ZombieShotEvent,
  ZombieTier,
  ZombieWrongEvent,
} from '../shared/types.ts';
import {
  generateBossPuzzleSequence,
  generateLogicPuzzle,
  isLogicAnswerMatch,
  pickReplacementPuzzle,
} from '../shared/logicPuzzles.ts';
import { soundEngine } from '../audio/soundEngine.ts';
import { createBlookRig, type BlookRig } from './blookModels.ts';
import { createArenaFloorTexture, createFloorRoughnessTexture } from './proceduralTextures.ts';
import { createZombieRig, type ZombieRig } from './zombieModels.ts';

export interface ActiveZombieSummary {
  id: string;
  puzzle: LogicPuzzle;
  x: number;
  speed: number;
  enraged: boolean;
  isBoss?: boolean;
  bossStep?: number;
  bossTotalSteps?: number;
}

export interface ZombieHudState {
  hp: number;
  maxHp: number;
  score: number;
  wave: number;
  kills: number;
  streak: number;
  bestStreak: number;
  explosiveAmmo: number;
  paused: boolean;
  gameOver: boolean;
  bossRushActive?: boolean;
  targetedZombieId: string | null;
  activeZombies: ActiveZombieSummary[];
  feedbackText: string | null;
  feedbackKind: 'hit' | 'miss' | 'damage' | 'special' | null;
}

interface ActiveZombie {
  id: string;
  puzzle: LogicPuzzle;
  x: number;
  serverX: number;
  z: number;
  speed: number;
  phaseOffset: number;
  enraged: boolean;
  isBoss?: boolean;
  bossStep?: number;
  bossTotalSteps?: number;
  bossPuzzles?: LogicPuzzle[];
  rig: ZombieRig;
  dying: boolean;
  pendingKill: boolean;
}

interface ActiveBullet {
  mesh: THREE.Mesh;
  x: number;
  y: number;
  z: number;
  targetZombieId: string;
  killedIds: string[];
  fallbackX: number;
  fallbackZ: number;
  explosive: boolean;
  bossHitOnly?: boolean;
  bossDefeated?: boolean;
}

interface DefenderUnit {
  id: string;
  avatar: BlookAvatarId;
  name: string;
  isHost: boolean;
  zPos: number;
  rig: BlookRig;
  labelSprite: THREE.Sprite;
  labelTex: THREE.CanvasTexture;
  blasterGroup: THREE.Group;
  muzzleFlashMesh: THREE.Mesh;
  muzzleTimer: number;
  aimY: number;
}

interface Particle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
}

const _vec3 = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();

function createDefenderLabelSprite(
  name: string,
  isLocal: boolean,
  isHost: boolean,
): { sprite: THREE.Sprite; texture: THREE.CanvasTexture } {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = isLocal ? 'rgba(8, 145, 178, 0.94)' : 'rgba(15, 23, 42, 0.88)';
  ctx.beginPath();
  ctx.roundRect(12, 10, 232, 44, 14);
  ctx.fill();

  ctx.strokeStyle = isHost ? '#facc15' : isLocal ? '#67e8f9' : '#475569';
  ctx.lineWidth = 3;
  ctx.stroke();

  const tag = isHost ? `👑 ${name}` : name;
  ctx.font = 'bold 21px "Segoe UI", Tahoma, sans-serif';
  ctx.fillStyle = '#f8fafc';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(tag.slice(0, 18), 128, 32);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.15, 0.54, 1);
  sprite.position.set(0, 2.05, 0);
  return { sprite, texture };
}

export class ZombieArenaScene {
  private container: HTMLElement;
  private onHudChange: (state: ZombieHudState) => void;
  private isSoftwareGl: boolean;
  private multiplayerMode: boolean;
  private localDefenderId: string;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private fog!: THREE.FogExp2;
  private camera: THREE.PerspectiveCamera;
  private raycaster = new THREE.Raycaster();
  private pointerNdc = new THREE.Vector2();

  private frameId = 0;
  private disposed = false;
  private clock = new THREE.Clock();

  private defenders = new Map<string, DefenderUnit>();
  private targetedZombieId: string | null = null;

  private shockwaveMesh!: THREE.Mesh;
  private shockwaveMat!: THREE.MeshBasicMaterial;
  private shockwaveLife = 0;

  private zombies: ActiveZombie[] = [];
  private bullets: ActiveBullet[] = [];
  private particleMesh!: THREE.InstancedMesh;
  private particles: Particle[] = [];

  private baseCameraPos = new THREE.Vector3(1.2, 8.8, 16.2);
  private cameraTarget = new THREE.Vector3(1.2, 1.35, 0);
  private shakeIntensity = 0;
  private hitstopTimer = 0;
  private spawnTimer = 0.8;
  private lastBossWave = 0;
  private bossRushActive = false;

  private hud: ZombieHudState = {
    hp: 100,
    maxHp: 100,
    score: 0,
    wave: 1,
    kills: 0,
    streak: 0,
    bestStreak: 0,
    explosiveAmmo: 1,
    paused: false,
    gameOver: false,
    bossRushActive: false,
    targetedZombieId: null,
    activeZombies: [],
    feedbackText: null,
    feedbackKind: null,
  };

  private disposables: Array<{ dispose: () => void }> = [];
  private bulletGeo: THREE.SphereGeometry;
  private normalBulletMat: THREE.MeshStandardMaterial;
  private bombBulletMat: THREE.MeshStandardMaterial;

  private chassisGeo: THREE.BoxGeometry;
  private barrelGeo: THREE.CylinderGeometry;
  private coilGeo: THREE.TorusGeometry;
  private flashGeo: THREE.SphereGeometry;
  private chassisMat: THREE.MeshStandardMaterial;
  private barrelMat: THREE.MeshStandardMaterial;
  private coilMat: THREE.MeshStandardMaterial;

  constructor(
    container: HTMLElement,
    avatarId: BlookAvatarId,
    onHudChange: (state: ZombieHudState) => void,
    options?: {
      multiplayer?: boolean;
      localDefenderId?: string;
      initialSnapshot?: ZombieGameSnapshot | null;
    },
  ) {
    this.container = container;
    this.onHudChange = onHudChange;
    this.isSoftwareGl = ZombieArenaScene.detectSoftwareGl();
    this.multiplayerMode = Boolean(options?.multiplayer);
    this.localDefenderId = options?.localDefenderId || 'local';

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2),
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(
      container.clientWidth || window.innerWidth,
      container.clientHeight || window.innerHeight,
    );
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x090f1d);
    this.fog = new THREE.FogExp2(0x090f1d, 0.022);
    this.scene.fog = this.fog;

    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(46, w / Math.max(1, h), 0.1, 160);
    this.updateCameraForAspect(w, h);

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = envTex;
    this.disposables.push(envTex);
    pmremGenerator.dispose();

    this.bulletGeo = new THREE.SphereGeometry(0.24, 12, 12);
    this.normalBulletMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x06b6d4,
      emissiveIntensity: 2.0,
      roughness: 0.1,
    });
    this.bombBulletMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xf97316,
      emissiveIntensity: 2.4,
      roughness: 0.1,
    });

    this.chassisGeo = new THREE.BoxGeometry(0.95, 0.28, 0.24);
    this.barrelGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.75, 10);
    this.barrelGeo.rotateZ(Math.PI / 2);
    this.coilGeo = new THREE.TorusGeometry(0.13, 0.04, 8, 14);
    this.coilGeo.rotateY(Math.PI / 2);
    this.flashGeo = new THREE.SphereGeometry(0.28, 10, 10);
    this.chassisMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.35,
      metalness: 0.75,
    });
    this.barrelMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.2,
      metalness: 0.88,
    });
    this.coilMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x06b6d4,
      emissiveIntensity: 1.4,
      roughness: 0.15,
    });

    this.disposables.push(
      this.bulletGeo,
      this.normalBulletMat,
      this.bombBulletMat,
      this.chassisGeo,
      this.barrelGeo,
      this.coilGeo,
      this.flashGeo,
      this.chassisMat,
      this.barrelMat,
      this.coilMat,
    );

    this.setupLighting();
    this.buildDefenseLane();
    this.buildParticlePool();
    this.buildShockwave();

    if (this.multiplayerMode) {
      if (options?.initialSnapshot) {
        this.syncMultiplayerState(options.initialSnapshot);
      } else {
        this.upsertDefender({
          id: this.localDefenderId,
          name: 'You',
          avatar: avatarId,
          isHost: this.localDefenderId === 'host',
          score: 0,
          kills: 0,
          streak: 0,
          bestStreak: 0,
          explosiveAmmo: 1,
          zPos: 0,
        });
      }
    } else {
      this.upsertDefender({
        id: 'local',
        name: 'Player',
        avatar: avatarId,
        isHost: false,
        score: 0,
        kills: 0,
        streak: 0,
        bestStreak: 0,
        explosiveAmmo: 1,
        zPos: 0,
      });
      this.spawnZombie(10.5, -1.6);
      this.spawnZombie(13.8, 1.8);
      this.emitHud();
    }

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('resize', this.handleResize);
    this.startLoop();
  }

  private static detectSoftwareGl(): boolean {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  }

  private handlePointerDown = (e: PointerEvent) => {
    if (this.disposed || this.hud.paused || this.hud.gameOver) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);

    const live = this.zombies.filter((z) => !z.dying && !z.pendingKill);
    for (const z of live) {
      const hits = this.raycaster.intersectObject(z.rig.root, true);
      if (hits.length > 0) {
        this.setTargetZombie(z.id);
        soundEngine.playClick();
        return;
      }
    }
  };

  private setupLighting() {
    const keyLight = new THREE.DirectionalLight(0xffedd5, 2.0);
    keyLight.position.set(10, 22, 14);
    keyLight.castShadow = !this.isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 65;
    keyLight.shadow.camera.left = -20;
    keyLight.shadow.camera.right = 20;
    keyLight.shadow.camera.top = 14;
    keyLight.shadow.camera.bottom = -14;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    this.scene.add(keyLight);

    const hemi = new THREE.HemisphereLight(0x818cf8, 0x0f172a, 0.9);
    this.scene.add(hemi);

    const lanternRim = new THREE.DirectionalLight(0x22d3ee, 0.8);
    lanternRim.position.set(-14, 8, -10);
    this.scene.add(lanternRim);
  }

  private buildDefenseLane() {
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const floorTex = createArenaFloorTexture(maxAniso);
    const roughTex = createFloorRoughnessTexture(maxAniso);
    floorTex.repeat.set(12, 4);
    roughTex.repeat.set(12, 4);
    this.disposables.push(floorTex, roughTex);

    const groundGeo = new THREE.PlaneGeometry(76, 48);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.94,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.y = -0.04;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const laneGeo = new THREE.BoxGeometry(34, 0.14, 9.6);
    const laneMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughnessMap: roughTex,
      roughness: 0.78,
      metalness: 0.1,
    });
    const lane = new THREE.Mesh(laneGeo, laneMat);
    lane.position.set(2, -0.07, 0);
    lane.receiveShadow = true;
    this.scene.add(lane);

    const curbGeo = new THREE.BoxGeometry(34, 0.28, 0.4);
    const curbMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.65,
      metalness: 0.25,
    });
    [-4.9, 4.9].forEach((z) => {
      const curb = new THREE.Mesh(curbGeo, curbMat);
      curb.position.set(2, 0.1, z);
      curb.receiveShadow = true;
      this.scene.add(curb);
    });

    const postGeo = new THREE.CylinderGeometry(0.18, 0.22, 1.35, 8);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.85 });
    const railGeo = new THREE.BoxGeometry(0.18, 0.22, 9.2);
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x0891b2,
      emissiveIntensity: 0.65,
      roughness: 0.25,
      metalness: 0.75,
    });

    for (let zi = -4; zi <= 4; zi += 2) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(-8.4, 0.67, zi);
      post.castShadow = !this.isSoftwareGl;
      this.scene.add(post);
    }
    const railTop = new THREE.Mesh(railGeo, railMat);
    railTop.position.set(-8.4, 0.95, 0);
    const railBot = new THREE.Mesh(railGeo, postMat);
    railBot.position.set(-8.4, 0.45, 0);
    this.scene.add(railTop, railBot);

    const treeCount = 34;
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 1.4, 6);
    trunkGeo.translate(0, 0.7, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.92 });
    const leavesGeo = new THREE.ConeGeometry(1.1, 2.8, 6);
    leavesGeo.translate(0, 2.5, 0);
    const leavesMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.78,
      flatShading: true,
    });
    const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
    const leavesInst = new THREE.InstancedMesh(leavesGeo, leavesMat, treeCount);
    leavesInst.castShadow = !this.isSoftwareGl;

    const dummy = new THREE.Object3D();
    const treeColors = [0x0f766e, 0x115e59, 0x1e3a8a, 0x312e81];
    for (let i = 0; i < treeCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = -11 + Math.floor(i / 2) * 1.9 + (i % 3) * 0.4;
      const z = side * (6.8 + (i % 4) * 1.6);
      const s = 0.85 + (i % 5) * 0.12;
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, i * 0.9, 0);
      dummy.scale.set(s, s * 1.08, s);
      dummy.updateMatrix();
      trunkInst.setMatrixAt(i, dummy.matrix);
      leavesInst.setMatrixAt(i, dummy.matrix);
      _color.setHex(treeColors[i % treeColors.length]);
      leavesInst.setColorAt(i, _color);
    }
    trunkInst.instanceMatrix.needsUpdate = true;
    leavesInst.instanceMatrix.needsUpdate = true;
    if (leavesInst.instanceColor) leavesInst.instanceColor.needsUpdate = true;
    trunkInst.computeBoundingSphere();
    leavesInst.computeBoundingSphere();
    this.scene.add(trunkInst, leavesInst);

    this.disposables.push(
      groundGeo,
      groundMat,
      laneGeo,
      laneMat,
      curbGeo,
      curbMat,
      postGeo,
      postMat,
      railGeo,
      railMat,
      trunkGeo,
      trunkMat,
      leavesGeo,
      leavesMat,
    );
  }

  private upsertDefender(d: ZombieDefenderPublic) {
    const existing = this.defenders.get(d.id);
    if (existing) {
      if (existing.avatar !== d.avatar) {
        this.removeDefender(d.id);
      } else {
        existing.zPos = d.zPos;
        existing.rig.root.position.set(-10.3, 0, d.zPos);
        existing.blasterGroup.position.set(-9.75, 0.72, d.zPos + 0.48);
        return;
      }
    }

    const isLocal = d.id === this.localDefenderId;
    const rig = createBlookRig(d.avatar, {
      isLocal,
      castShadow: !this.isSoftwareGl,
    });
    rig.root.position.set(-10.3, 0, d.zPos);
    rig.root.rotation.y = Math.PI / 2;

    const { sprite: labelSprite, texture: labelTex } = createDefenderLabelSprite(
      d.name,
      isLocal,
      d.isHost,
    );
    if (this.multiplayerMode) {
      rig.root.add(labelSprite);
    }
    this.scene.add(rig.root);

    const blasterGroup = new THREE.Group();
    blasterGroup.position.set(-9.75, 0.72, d.zPos + 0.48);

    const flashMat = new THREE.MeshBasicMaterial({
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0,
    });

    const chassis = new THREE.Mesh(this.chassisGeo, this.chassisMat);
    const barrel = new THREE.Mesh(this.barrelGeo, this.barrelMat);
    barrel.position.x = 0.62;
    const coil = new THREE.Mesh(this.coilGeo, this.coilMat);
    coil.position.x = 0.46;
    const muzzleFlashMesh = new THREE.Mesh(this.flashGeo, flashMat);
    muzzleFlashMesh.position.x = 1.05;

    blasterGroup.add(chassis, barrel, coil, muzzleFlashMesh);
    this.scene.add(blasterGroup);

    this.defenders.set(d.id, {
      id: d.id,
      avatar: d.avatar,
      name: d.name,
      isHost: d.isHost,
      zPos: d.zPos,
      rig,
      labelSprite,
      labelTex,
      blasterGroup,
      muzzleFlashMesh,
      muzzleTimer: 0,
      aimY: 0,
    });
  }

  private removeDefender(id: string) {
    const unit = this.defenders.get(id);
    if (!unit) return;
    this.scene.remove(unit.rig.root);
    this.scene.remove(unit.blasterGroup);
    unit.rig.dispose();
    unit.labelTex.dispose();
    (unit.labelSprite.material as THREE.SpriteMaterial).dispose();
    (unit.muzzleFlashMesh.material as THREE.MeshBasicMaterial).dispose();
    this.defenders.delete(id);
  }

  private buildParticlePool() {
    const count = 140;
    const geo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.3,
      emissive: 0x222222,
    });
    this.particleMesh = new THREE.InstancedMesh(geo, mat, count);
    this.particleMesh.frustumCulled = false;

    const palette = [0x38bdf8, 0x4ade80, 0xfacc15, 0xf97316, 0xef4444];
    for (let i = 0; i < count; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: -20,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1,
      });
      _color.setHex(palette[i % palette.length]);
      this.particleMesh.setColorAt(i, _color);
      _mat4.makeScale(0, 0, 0);
      this.particleMesh.setMatrixAt(i, _mat4);
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    this.scene.add(this.particleMesh);
    this.disposables.push(geo, mat);
  }

  private buildShockwave() {
    const geo = new THREE.RingGeometry(0.4, 0.85, 32);
    geo.rotateX(-Math.PI / 2);
    this.shockwaveMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.shockwaveMesh = new THREE.Mesh(geo, this.shockwaveMat);
    this.shockwaveMesh.position.y = 0.08;
    this.scene.add(this.shockwaveMesh);
    this.disposables.push(geo, this.shockwaveMat);
  }

  private spawnBurst(x: number, y: number, z: number, count = 22) {
    let spawned = 0;
    for (let i = 0; i < this.particles.length && spawned < count; i++) {
      const p = this.particles[i];
      if (p.active) continue;
      p.active = true;
      p.x = x;
      p.y = y;
      p.z = z;
      const angle = Math.random() * Math.PI * 2;
      const spd = 2.5 + Math.random() * 6.5;
      p.vx = Math.cos(angle) * spd;
      p.vy = 2.8 + Math.random() * 5.8;
      p.vz = Math.sin(angle) * spd;
      p.life = 0;
      p.maxLife = 0.55 + Math.random() * 0.45;
      spawned++;
    }
  }

  private pickTierForWave(wave: number): ZombieTier {
    const r = Math.random();
    if (wave <= 1) return 'easy';
    if (wave === 2) return r < 0.6 ? 'easy' : 'medium';
    if (r < 0.42) return 'easy';
    if (r < 0.78) return 'medium';
    return 'hard';
  }

  private spawnZombie(startX = 14.5, customZ?: number, enragedOverride = false, speedOverride?: number) {
    const tier = this.pickTierForWave(this.hud.wave);
    const puzzle = generateLogicPuzzle(tier);
    const z = customZ ?? (Math.random() - 0.5) * 6.4;

    const baseSpeed =
      speedOverride ??
      (tier === 'easy'
        ? 1.05 + this.hud.wave * 0.09
        : tier === 'medium'
          ? 0.9 + this.hud.wave * 0.08
          : 0.75 + this.hud.wave * 0.07);

    const rig = createZombieRig(tier, puzzle.prompt, !this.isSoftwareGl, enragedOverride);
    rig.root.position.set(startX, 0, z);
    this.scene.add(rig.root);

    this.zombies.push({
      id: puzzle.id,
      puzzle,
      x: startX,
      serverX: startX,
      z,
      speed: speedOverride ?? Math.min(2.3, baseSpeed),
      phaseOffset: Math.random() * Math.PI * 2,
      enraged: enragedOverride,
      rig,
      dying: false,
      pendingKill: false,
    });
  }

  private spawnBoss() {
    const bossPuzzles = generateBossPuzzleSequence();
    const bossId = `boss-${Date.now()}`;
    this.lastBossWave = this.hud.wave;

    const rig = createZombieRig(
      bossPuzzles[0].tier,
      bossPuzzles[0].prompt,
      !this.isSoftwareGl,
      false,
      { isBoss: true, bossStep: 0, bossTotalSteps: bossPuzzles.length },
    );
    rig.root.position.set(15.2, 0, 0);
    this.scene.add(rig.root);

    this.zombies.push({
      id: bossId,
      puzzle: bossPuzzles[0],
      x: 15.2,
      serverX: 15.2,
      z: 0,
      speed: 0.42,
      phaseOffset: 0,
      enraged: false,
      isBoss: true,
      bossStep: 0,
      bossTotalSteps: bossPuzzles.length,
      bossPuzzles,
      rig,
      dying: false,
      pendingKill: false,
    });

    this.targetedZombieId = bossId;
    this.shakeIntensity = 0.35;
    soundEngine.playBossWarning();
    this.hud.feedbackText = '👹 BOSS ZOMBIE ปรากฏตัว! ตอบคำถาม 5 ข้อให้ทันก่อนบอสพุ่งชนฐาน!';
    this.hud.feedbackKind = 'damage';
    this.emitHud();
  }

  public setTargetZombie(zombieId: string | null) {
    this.targetedZombieId = zombieId;
    this.emitHud();
  }

  private syncTargetHighlights(liveSorted: ActiveZombie[]) {
    if (liveSorted.length === 0) {
      this.targetedZombieId = null;
      return;
    }
    const stillValid = liveSorted.some((z) => z.id === this.targetedZombieId);
    if (!stillValid) {
      this.targetedZombieId = liveSorted[0].id;
    }
    for (const z of liveSorted) {
      z.rig.setTargeted(z.id === this.targetedZombieId);
    }

    const target = liveSorted.find((z) => z.id === this.targetedZombieId);
    const localDef =
      this.defenders.get(this.localDefenderId) || this.defenders.get('local');
    if (target && localDef) {
      localDef.aimY = Math.atan2(-(target.z - localDef.zPos), target.x - -9.75);
    }
  }

  public syncMultiplayerState(snapshot: ZombieGameSnapshot) {
    if (!this.multiplayerMode || this.disposed) return;

    this.hud.hp = snapshot.hp;
    this.hud.maxHp = snapshot.maxHp;
    this.hud.wave = snapshot.wave;
    this.hud.kills = snapshot.kills;
    this.hud.paused = snapshot.paused;
    this.hud.gameOver = snapshot.gameOver;
    this.hud.bossRushActive = Boolean(snapshot.bossRushActive);

    const me = snapshot.defenders.find((d) => d.id === this.localDefenderId);
    if (me) {
      this.hud.score = me.score;
      this.hud.streak = me.streak;
      this.hud.bestStreak = me.bestStreak;
      this.hud.explosiveAmmo = me.explosiveAmmo;
    } else {
      this.hud.score = snapshot.teamScore;
    }

    const activeDefenderIds = new Set(snapshot.defenders.map((d) => d.id));
    for (const id of Array.from(this.defenders.keys())) {
      if (!activeDefenderIds.has(id)) {
        this.removeDefender(id);
      }
    }
    for (const d of snapshot.defenders) {
      this.upsertDefender(d);
    }

    const serverZombieMap = new Map(snapshot.zombies.map((z) => [z.id, z]));
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const localZ = this.zombies[i];
      const serverZ = serverZombieMap.get(localZ.id);
      if (!serverZ) {
        if (!localZ.pendingKill && !localZ.dying) {
          this.scene.remove(localZ.rig.root);
          localZ.rig.dispose();
          this.zombies.splice(i, 1);
        }
      } else {
        localZ.serverX = serverZ.x;
        localZ.speed = serverZ.speed;
        const nextEnraged = Boolean(serverZ.enraged);
        const nextBossStep = serverZ.bossStep ?? 0;
        if (
          localZ.puzzle.prompt !== serverZ.puzzle.prompt ||
          localZ.enraged !== nextEnraged ||
          localZ.bossStep !== nextBossStep
        ) {
          localZ.puzzle = serverZ.puzzle;
          localZ.enraged = nextEnraged;
          localZ.bossStep = nextBossStep;
          localZ.bossTotalSteps = serverZ.bossTotalSteps;
          localZ.rig.updateLabel(
            serverZ.puzzle.tier,
            serverZ.puzzle.prompt,
            nextEnraged,
            serverZ.isBoss
              ? {
                  isBoss: true,
                  bossStep: nextBossStep,
                  bossTotalSteps: serverZ.bossTotalSteps ?? 5,
                }
              : undefined,
          );
        }
      }
    }

    const existingIds = new Set(this.zombies.map((z) => z.id));
    for (const sz of snapshot.zombies) {
      if (!existingIds.has(sz.id)) {
        const enraged = Boolean(sz.enraged);
        const isBoss = Boolean(sz.isBoss);
        const rig = createZombieRig(
          sz.puzzle.tier,
          sz.puzzle.prompt,
          !this.isSoftwareGl,
          enraged,
          isBoss
            ? {
                isBoss: true,
                bossStep: sz.bossStep ?? 0,
                bossTotalSteps: sz.bossTotalSteps ?? 5,
              }
            : undefined,
        );
        rig.root.position.set(sz.x, 0, sz.z);
        this.scene.add(rig.root);
        this.zombies.push({
          id: sz.id,
          puzzle: sz.puzzle,
          x: sz.x,
          serverX: sz.x,
          z: sz.z,
          speed: sz.speed,
          phaseOffset: sz.phaseOffset,
          enraged,
          isBoss,
          bossStep: sz.bossStep,
          bossTotalSteps: sz.bossTotalSteps,
          rig,
          dying: false,
          pendingKill: false,
        });

        if (isBoss) {
          this.targetedZombieId = sz.id;
          this.shakeIntensity = 0.35;
          soundEngine.playBossWarning();
          this.hud.feedbackText =
            '👹 BOSS ZOMBIE ปรากฏตัว! ช่วยกันตอบคำถาม 5 ข้อให้ทันก่อนบอสพุ่งชนฐาน!';
          this.hud.feedbackKind = 'damage';
        }
      }
    }

    this.emitHud();
  }

  public handleRemoteShot(shot: ZombieShotEvent) {
    if (!this.multiplayerMode || this.disposed) return;

    const shooter = this.defenders.get(shot.shooterId) || Array.from(this.defenders.values())[0];
    const originX = -8.8;
    const originZ = (shooter ? shooter.zPos : shot.shooterZ) + 0.48;

    if (shooter) {
      shooter.aimY = Math.atan2(-(shot.targetZ - shooter.zPos), shot.targetX - -9.75);
      shooter.muzzleTimer = 0.1;
    }

    const killedSet = new Set(shot.killedIds);
    for (const z of this.zombies) {
      if (killedSet.has(z.id)) {
        z.pendingKill = true;
      }
    }

    const bulletMesh = new THREE.Mesh(
      this.bulletGeo,
      shot.explosive ? this.bombBulletMat : this.normalBulletMat,
    );
    bulletMesh.position.set(originX, 0.85, originZ);
    if (shot.explosive) bulletMesh.scale.setScalar(1.65);
    this.scene.add(bulletMesh);

    this.bullets.push({
      mesh: bulletMesh,
      x: originX,
      y: 0.85,
      z: originZ,
      targetZombieId: shot.targetZombieId,
      killedIds: shot.killedIds,
      fallbackX: shot.targetX,
      fallbackZ: shot.targetZ,
      explosive: shot.explosive,
      bossHitOnly: shot.bossHitOnly,
      bossDefeated: shot.bossDefeated,
    });

    soundEngine.playLaser();

    if (shot.bossDefeated) {
      this.hud.feedbackText = `🏆 ${shot.shooterName} ปราบ BOSS ZOMBIE สำเร็จ! (+${shot.pointsEarned} คะแนน & ระเบิด +1)`;
      this.hud.feedbackKind = 'special';
    } else if (shot.bossHitOnly) {
      const rem = Math.max(1, 5 - (shot.newBossStep ?? 1));
      this.hud.feedbackText = `⚔️ ยิงโดนบอส! เหลืออีก ${rem} คำถาม (+${shot.pointsEarned})`;
      this.hud.feedbackKind = 'special';
    } else if (shot.shooterId === this.localDefenderId) {
      if (shot.explosive) {
        this.hud.feedbackText = `คุณยิงกระสุนระเบิด! กำจัด ${shot.killedIds.length} ตัว (+${shot.pointsEarned})`;
        this.hud.feedbackKind = 'special';
      } else if (shot.streakBonusAmmo) {
        this.hud.feedbackText = `Streak! ได้รับกระสุนระเบิด +1 (+${shot.pointsEarned})`;
        this.hud.feedbackKind = 'special';
      } else {
        this.hud.feedbackText = `กำจัดซอมบี้สำเร็จ +${shot.pointsEarned} คะแนน!`;
        this.hud.feedbackKind = 'hit';
      }
    } else {
      this.hud.feedbackText = `${shot.shooterName} ยิงกำจัดซอมบี้ (+${shot.pointsEarned})`;
      this.hud.feedbackKind = shot.explosive ? 'special' : 'hit';
    }
    this.emitHud();
  }

  public handleRemoteWrong(wrong: ZombieWrongEvent) {
    if (!this.multiplayerMode || this.disposed) return;
    soundEngine.playWrong();
    this.shakeIntensity = 0.22;
    this.hud.feedbackText =
      wrong.shooterId === this.localDefenderId
        ? 'ตอบผิด! ซอมบี้ตัวนั้นวิ่งเร็วขึ้นและเปลี่ยนโจทย์ใหม่!'
        : `${wrong.shooterName} ตอบผิด! ซอมบี้วิ่งเร็วขึ้นและเปลี่ยนโจทย์ใหม่!`;
    this.hud.feedbackKind = 'damage';
    this.emitHud();
  }

  public handleRemoteBreach(breach: ZombieBreachEvent) {
    if (!this.multiplayerMode || this.disposed) return;
    this.hud.hp = breach.hpRemaining;
    if (breach.isBoss) {
      this.bossRushActive = true;
      this.hud.bossRushActive = true;
      this.hud.feedbackText =
        '⚠️ บอสพุ่งชนฐาน! HP เหลือวิกฤต — ฝูงซอมบี้ที่เหลือกำลังวิ่งกรูเข้ามา!';
      this.shakeIntensity = 0.95;
      soundEngine.playExplosion();
      soundEngine.playDamage();
      this.shockwaveMesh.position.set(breach.x, 0.1, breach.z);
      this.shockwaveMesh.scale.setScalar(1);
      this.shockwaveLife = 0.55;
      this.spawnBurst(breach.x, 1.2, breach.z, 36);
    } else {
      this.hud.feedbackText = `ซอมบี้บุกถึงฐาน! -${breach.damage} HP`;
      this.shakeIntensity = 0.55;
      soundEngine.playDamage();
      this.spawnBurst(breach.x, 1.0, breach.z, 18);
    }
    this.hud.feedbackKind = 'damage';
    this.hitstopTimer = 0.04;
    this.emitHud();
  }

  public setPaused(paused: boolean) {
    this.hud.paused = paused;
    this.emitHud();
  }

  public restart() {
    if (this.multiplayerMode) return;
    for (const z of this.zombies) {
      this.scene.remove(z.rig.root);
      z.rig.dispose();
    }
    this.zombies = [];

    for (const b of this.bullets) {
      this.scene.remove(b.mesh);
    }
    this.bullets = [];
    this.targetedZombieId = null;
    this.lastBossWave = 0;
    this.bossRushActive = false;

    this.hud = {
      hp: 100,
      maxHp: 100,
      score: 0,
      wave: 1,
      kills: 0,
      streak: 0,
      bestStreak: 0,
      explosiveAmmo: 1,
      paused: false,
      gameOver: false,
      bossRushActive: false,
      targetedZombieId: null,
      activeZombies: [],
      feedbackText: null,
      feedbackKind: null,
    };

    this.spawnTimer = 0.9;
    this.spawnZombie(10.5, -1.6);
    this.spawnZombie(13.8, 1.8);
    this.emitHud();
  }

  /**
   * Fires at the targeted zombie using the selected multiple-choice option.
   * On wrong choice: speeds up that zombie and swaps its overhead puzzle!
   */
  public submitChoice(
    targetZombieId: string | null,
    choice: string,
    forceExplosive = false,
  ): boolean {
    if (this.multiplayerMode) return false;
    if (this.hud.paused || this.hud.gameOver) return false;

    const liveZombies = this.zombies
      .filter((z) => !z.dying && !z.pendingKill)
      .sort((a, b) => a.x - b.x);

    if (liveZombies.length === 0) return false;

    const target =
      (targetZombieId && liveZombies.find((z) => z.id === targetZombieId)) ||
      (this.targetedZombieId && liveZombies.find((z) => z.id === this.targetedZombieId)) ||
      liveZombies[0];

    const isDirectBomb = forceExplosive && !choice.trim();
    if (isDirectBomb && this.hud.explosiveAmmo <= 0) return false;

    const isCorrect = isDirectBomb || isLogicAnswerMatch(choice, target.puzzle);

    if (!isCorrect) {
      this.hud.streak = 0;
      target.speed = Math.min(
        target.isBoss ? 4.8 : 3.9,
        target.speed * (target.isBoss ? 1.28 : 1.42) + 0.35,
      );
      target.enraged = true;
      const swapped = pickReplacementPuzzle(target.puzzle);
      target.puzzle = swapped;
      if (target.isBoss && target.bossPuzzles && target.bossStep !== undefined) {
        target.bossPuzzles[target.bossStep] = swapped;
      }
      target.rig.updateLabel(
        target.puzzle.tier,
        target.puzzle.prompt,
        true,
        target.isBoss
          ? {
              isBoss: true,
              bossStep: target.bossStep ?? 0,
              bossTotalSteps: target.bossTotalSteps ?? 5,
            }
          : undefined,
      );

      this.shakeIntensity = 0.22;
      soundEngine.playWrong();
      this.hud.feedbackText = target.isBoss
        ? 'ตอบผิด! บอสคำรามและเร่งความเร็วเข้าใส่ + เปลี่ยนโจทย์ใหม่!'
        : 'ตอบผิด! ซอมบี้ตัวนั้นวิ่งเร็วขึ้นและเปลี่ยนโจทย์ใหม่!';
      this.hud.feedbackKind = 'damage';
      this.emitHud();
      return false;
    }

    const useBomb = forceExplosive && this.hud.explosiveAmmo > 0;
    if (useBomb) {
      this.hud.explosiveAmmo -= 1;
    }

    const defender = this.defenders.get('local');
    if (defender) {
      defender.aimY = Math.atan2(-target.z, target.x - -9.75);
      defender.muzzleTimer = 0.1;
    }

    // Handle 5-question Boss combat in Solo mode
    if (target.isBoss) {
      const totalSteps = target.bossTotalSteps ?? 5;
      const stepAdvance = useBomb ? 2 : 1;
      const nextStep = (target.bossStep ?? 0) + stepAdvance;
      const bossHitOnly = nextStep < totalSteps;

      if (bossHitOnly) {
        target.bossStep = nextStep;
        target.puzzle = target.bossPuzzles?.[nextStep] || pickReplacementPuzzle(target.puzzle);
        target.x = Math.min(13.8, target.x + 0.85);
        target.speed = Math.max(0.45, target.speed - 0.14);
        target.rig.updateLabel(target.puzzle.tier, target.puzzle.prompt, target.enraged, {
          isBoss: true,
          bossStep: nextStep,
          bossTotalSteps: totalSteps,
        });

        this.hud.score += 180;
        if (!useBomb) {
          this.hud.streak += 1;
          this.hud.bestStreak = Math.max(this.hud.bestStreak, this.hud.streak);
          if (this.hud.streak > 0 && this.hud.streak % 5 === 0) {
            this.hud.explosiveAmmo += 1;
          }
        }
        this.hud.feedbackText = `⚔️ ยิงโดนบอส! เหลืออีก ${totalSteps - nextStep} คำถาม!`;
        this.hud.feedbackKind = 'special';
      } else {
        target.pendingKill = true;
      }

      const bulletMesh = new THREE.Mesh(
        this.bulletGeo,
        useBomb ? this.bombBulletMat : this.normalBulletMat,
      );
      bulletMesh.position.set(-8.8, 0.85, 0.48);
      if (useBomb) bulletMesh.scale.setScalar(1.65);
      this.scene.add(bulletMesh);

      this.bullets.push({
        mesh: bulletMesh,
        x: -8.8,
        y: 0.85,
        z: 0.48,
        targetZombieId: target.id,
        killedIds: bossHitOnly ? [] : [target.id],
        fallbackX: target.x,
        fallbackZ: target.z,
        explosive: useBomb,
        bossHitOnly,
        bossDefeated: !bossHitOnly,
      });

      soundEngine.playLaser();
      this.emitHud();
      return true;
    }

    target.pendingKill = true;

    const bulletMesh = new THREE.Mesh(
      this.bulletGeo,
      useBomb ? this.bombBulletMat : this.normalBulletMat,
    );
    bulletMesh.position.set(-8.8, 0.85, 0.48);
    if (useBomb) bulletMesh.scale.setScalar(1.65);
    this.scene.add(bulletMesh);

    this.bullets.push({
      mesh: bulletMesh,
      x: -8.8,
      y: 0.85,
      z: 0.48,
      targetZombieId: target.id,
      killedIds: [target.id],
      fallbackX: target.x,
      fallbackZ: target.z,
      explosive: useBomb,
    });

    soundEngine.playLaser();
    this.emitHud();
    return true;
  }

  private eliminateZombie(zombie: ActiveZombie, isExplosiveKill = false) {
    if (zombie.dying) return;
    zombie.dying = true;

    if (!this.multiplayerMode) {
      const pts = zombie.isBoss
        ? 1200
        : zombie.puzzle.tier === 'easy'
          ? 100
          : zombie.puzzle.tier === 'medium'
            ? 220
            : 400;
      this.hud.score += pts;
      this.hud.kills += 1;

      if (zombie.isBoss) {
        this.hud.explosiveAmmo += 1;
        this.hud.feedbackText = '🏆 ปราบ BOSS ZOMBIE สำเร็จ! +1,200 คะแนน & กระสุนระเบิด +1';
        this.hud.feedbackKind = 'special';
      } else if (!isExplosiveKill) {
        this.hud.streak += 1;
        this.hud.bestStreak = Math.max(this.hud.bestStreak, this.hud.streak);
        if (this.hud.streak > 0 && this.hud.streak % 5 === 0) {
          this.hud.explosiveAmmo += 1;
          this.hud.feedbackText = `Streak x${this.hud.streak}! ได้รับกระสุนระเบิด +1`;
          this.hud.feedbackKind = 'special';
        } else {
          this.hud.feedbackText = `กำจัดซอมบี้สำเร็จ +${pts} คะแนน!`;
          this.hud.feedbackKind = 'hit';
        }
      }

      const nextWave = 1 + Math.floor(this.hud.kills / 4);
      if (nextWave > this.hud.wave) {
        this.hud.wave = nextWave;
      }
    }

    this.spawnBurst(zombie.x, 1.1, zombie.z, zombie.isBoss ? 44 : isExplosiveKill ? 28 : 20);
    this.scene.remove(zombie.rig.root);
    zombie.rig.dispose();
  }

  private emitHud() {
    const liveSorted = this.zombies
      .filter((z) => !z.dying && !z.pendingKill)
      .sort((a, b) => a.x - b.x);

    this.syncTargetHighlights(liveSorted);

    this.onHudChange({
      ...this.hud,
      targetedZombieId: this.targetedZombieId,
      activeZombies: liveSorted.map((z) => ({
        id: z.id,
        puzzle: z.puzzle,
        x: z.x,
        speed: z.speed,
        enraged: z.enraged,
        isBoss: z.isBoss,
        bossStep: z.bossStep,
        bossTotalSteps: z.bossTotalSteps,
      })),
    });
  }

  private updateCameraForAspect(w: number, h: number) {
    const safeW = Math.max(1, w);
    const safeH = Math.max(1, h);
    const aspect = safeW / safeH;
    this.camera.aspect = aspect;

    // Landscape keeps exact classic framing; portrait widens vFOV & pulls camera back
    // while lowering target.y so defenders (x=-10.3) and zombies sit clearly between top & bottom HUDs.
    const portraitT = THREE.MathUtils.clamp((1.15 - aspect) / (1.15 - 0.45), 0, 1);
    const targetFov = THREE.MathUtils.lerp(46, 62, portraitT);
    this.camera.fov = targetFov;
    this.camera.updateProjectionMatrix();

    const halfVRad = THREE.MathUtils.degToRad(targetFov * 0.5);
    const desiredHalfWidth = THREE.MathUtils.lerp(13.2, 11.4, portraitT);
    const requiredDist = desiredHalfWidth / (Math.max(0.38, aspect) * Math.tan(halfVRad));
    const extraZ = Math.max(0, requiredDist - 18.4);

    const camX = THREE.MathUtils.lerp(1.2, 0.3, portraitT);
    const camY = 8.8 + extraZ * 0.32;
    const camZ = 16.2 + extraZ * 0.94;
    const targetY = THREE.MathUtils.lerp(1.35, -1.65, portraitT);

    this.baseCameraPos.set(camX, camY, camZ);
    this.cameraTarget.set(camX, targetY, 0);

    if (this.fog) {
      const actualDist = this.baseCameraPos.distanceTo(this.cameraTarget);
      this.fog.density = 0.022 * Math.min(1, 18.4 / Math.max(18.4, actualDist));
    }

    this.camera.position.copy(this.baseCameraPos);
    this.camera.lookAt(this.cameraTarget);
  }

  private handleResize = () => {
    if (this.disposed) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.updateCameraForAspect(w, h);
    this.renderer.setSize(w, h);
  };

  private startLoop() {
    const afterDraw = (cb: () => void) => {
      const gl = this.renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    };

    const tick = () => {
      if (this.disposed) return;
      const rawDt = Math.min(this.clock.getDelta(), 0.05);
      const elapsed = this.clock.getElapsedTime();

      this.update(rawDt, elapsed);
      this.renderer.render(this.scene, this.camera);

      if (this.isSoftwareGl) {
        afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      afterDraw(tick);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  private update(rawDt: number, elapsed: number) {
    if (this.hud.paused || this.hud.gameOver) return;

    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - rawDt);
      return;
    }

    const dt = rawDt;

    let defIdx = 0;
    for (const def of this.defenders.values()) {
      const bob = Math.sin(elapsed * 3.5 + defIdx * 0.9) * 0.04;
      def.rig.bodyPivot.position.y = Math.max(0, bob);
      def.blasterGroup.rotation.y = THREE.MathUtils.damp(
        def.blasterGroup.rotation.y,
        def.aimY,
        14,
        dt,
      );
      if (def.muzzleTimer > 0) {
        def.muzzleTimer -= dt;
        (def.muzzleFlashMesh.material as THREE.MeshBasicMaterial).opacity = Math.max(
          0,
          def.muzzleTimer * 10,
        );
      }
      defIdx++;
    }

    if (!this.multiplayerMode) {
      const hasBossAlive = this.zombies.some((z) => z.isBoss && !z.dying && !z.pendingKill);
      if (
        !this.bossRushActive &&
        this.hud.wave >= 3 &&
        this.hud.wave % 3 === 0 &&
        this.lastBossWave < this.hud.wave &&
        !hasBossAlive
      ) {
        this.spawnBoss();
      }

      if (!this.bossRushActive) {
        this.spawnTimer -= dt;
        const maxActive = Math.min(6, 2 + Math.floor(this.hud.wave * 0.7));
        if (
          this.spawnTimer <= 0 &&
          this.zombies.filter((z) => !z.dying && !z.pendingKill).length < maxActive
        ) {
          this.spawnZombie(14.5);
          this.spawnTimer = Math.max(1.85, 3.6 - this.hud.wave * 0.28);
          this.emitHud();
        }
      }
    }

    let hudDirty = false;
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i];
      if (z.dying) {
        this.zombies.splice(i, 1);
        continue;
      }

      if (this.multiplayerMode) {
        if (!z.pendingKill) {
          z.x -= z.speed * dt;
          z.x = THREE.MathUtils.damp(z.x, z.serverX, 10, dt);
        }
      } else if (!z.pendingKill) {
        if (z.isBoss) {
          const accel = z.enraged ? 0.24 : 0.16;
          z.speed = Math.min(4.8, z.speed + accel * dt);
          if (z.x <= -4.2) {
            z.speed = Math.max(z.speed, 6.4);
          }
        }
        z.x -= z.speed * dt;
      }

      const walkRate = z.isBoss ? 4.2 + z.speed * 1.45 : z.enraged ? 8.8 : 5.2;
      const walkCycle = elapsed * walkRate + z.phaseOffset;
      z.rig.root.position.set(z.x, 0, z.z);
      z.rig.bodyGroup.position.y = Math.abs(Math.sin(walkCycle)) * (z.isBoss ? 0.12 : 0.08);
      z.rig.leftLeg.rotation.z = Math.sin(walkCycle) * 0.42;
      z.rig.rightLeg.rotation.z = -Math.sin(walkCycle) * 0.42;
      z.rig.leftArm.rotation.z = Math.sin(walkCycle * 0.5) * 0.14;
      z.rig.rightArm.rotation.z = -Math.sin(walkCycle * 0.5) * 0.14;

      if (!this.multiplayerMode && z.x <= -8.1) {
        if (z.isBoss) {
          const nearDeadHp = this.hud.hp > 6 ? 5 : 1;
          this.hud.hp = nearDeadHp;
          this.hud.streak = 0;
          this.bossRushActive = true;
          this.hud.bossRushActive = true;
          this.hud.feedbackText =
            '⚠️ บอสพุ่งชนฐาน! HP เหลือวิกฤต — ฝูงซอมบี้ที่เหลือกำลังวิ่งกรูเข้ามา!';
          this.hud.feedbackKind = 'damage';
          this.shakeIntensity = 0.95;
          this.hitstopTimer = 0.05;
          soundEngine.playExplosion();
          soundEngine.playDamage();
          this.shockwaveMesh.position.set(z.x, 0.1, z.z);
          this.shockwaveMesh.scale.setScalar(1);
          this.shockwaveLife = 0.55;
          this.spawnBurst(z.x, 1.2, z.z, 36);

          this.scene.remove(z.rig.root);
          z.rig.dispose();
          this.zombies.splice(i, 1);

          // Stampede remaining zombies toward the base to finish the game
          for (const rem of this.zombies) {
            rem.enraged = true;
            rem.speed = Math.max(rem.speed, 6.8 + Math.random() * 1.4);
            rem.rig.updateLabel(rem.puzzle.tier, rem.puzzle.prompt, true);
          }
          let extraIdx = 0;
          while (this.zombies.length < 3) {
            this.spawnZombie(2.5 + extraIdx * 2.2, (extraIdx - 1) * 2.1, true, 7.4 + extraIdx * 0.4);
            extraIdx++;
          }
          hudDirty = true;
          continue;
        }

        const dmg = this.bossRushActive
          ? Math.max(this.hud.hp, 20)
          : z.puzzle.tier === 'hard'
            ? 30
            : z.puzzle.tier === 'medium'
              ? 20
              : 15;
        this.hud.hp = Math.max(0, this.hud.hp - dmg);
        this.hud.streak = 0;
        this.hud.feedbackText = this.bossRushActive
          ? 'ซอมบี้บุกขย้ำฐานจนพัง!'
          : `ซอมบี้บุกถึงฐาน! -${dmg} HP`;
        this.hud.feedbackKind = 'damage';
        this.shakeIntensity = 0.55;
        this.hitstopTimer = 0.04;
        soundEngine.playDamage();
        this.spawnBurst(z.x, 1.0, z.z, 18);

        this.scene.remove(z.rig.root);
        z.rig.dispose();
        this.zombies.splice(i, 1);

        if (this.hud.hp <= 0) {
          this.hud.gameOver = true;
        }
        hudDirty = true;
      }
    }

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      const target = this.zombies.find((z) => z.id === b.targetZombieId && !z.dying);
      const tx = target ? target.x : b.fallbackX;
      const tz = target ? target.z : b.fallbackZ;
      const ty = target?.isBoss ? 1.45 : 1.1;

      const dx = tx - b.x;
      const dy = ty - b.y;
      const dz = tz - b.z;
      const dist = Math.hypot(dx, dy, dz);
      const step = 38 * dt;

      if (dist <= step + 0.45) {
        if (b.bossHitOnly) {
          soundEngine.playBossHit();
          this.shakeIntensity = 0.28;
          this.hitstopTimer = 0.03;
          this.spawnBurst(tx, ty, tz, 18);
          if (b.explosive) {
            this.shockwaveMesh.position.set(tx, 0.1, tz);
            this.shockwaveMesh.scale.setScalar(1);
            this.shockwaveLife = 0.42;
            const minions = this.multiplayerMode
              ? this.zombies.filter((z) => !z.dying && b.killedIds.includes(z.id))
              : this.zombies.filter(
                  (z) => !z.dying && !z.isBoss && Math.hypot(z.x - tx, z.z - tz) <= 7.5,
                );
            minions.forEach((v) => this.eliminateZombie(v, true));
          }
        } else if (b.explosive) {
          soundEngine.playExplosion();
          this.shakeIntensity = 0.65;
          this.hitstopTimer = 0.05;
          this.shockwaveMesh.position.set(tx, 0.1, tz);
          this.shockwaveMesh.scale.setScalar(1);
          this.shockwaveLife = 0.45;

          const blastVictims = this.multiplayerMode
            ? this.zombies.filter((z) => !z.dying && b.killedIds.includes(z.id))
            : this.zombies.filter(
                (z) =>
                  !z.dying &&
                  (!z.isBoss || z.id === b.targetZombieId) &&
                  Math.hypot(z.x - tx, z.z - tz) <= 7.5,
              );
          if (blastVictims.length > 0) {
            blastVictims.forEach((v, idx) => this.eliminateZombie(v, idx > 0));
            if (!this.multiplayerMode && !b.bossDefeated) {
              this.hud.feedbackText = `กระสุนระเบิด! กำจัดซอมบี้ ${blastVictims.length} ตัวพร้อมกัน!`;
              this.hud.feedbackKind = 'special';
            }
          } else {
            this.spawnBurst(tx, 1.1, tz, 28);
          }
        } else if (target) {
          if (b.bossDefeated) {
            soundEngine.playExplosion();
            this.shakeIntensity = 0.65;
            this.shockwaveMesh.position.set(tx, 0.1, tz);
            this.shockwaveMesh.scale.setScalar(1);
            this.shockwaveLife = 0.5;
          } else {
            soundEngine.playCorrect();
            this.shakeIntensity = 0.2;
          }
          this.hitstopTimer = 0.03;
          this.eliminateZombie(target, false);
        } else if (this.multiplayerMode) {
          soundEngine.playCorrect();
          this.spawnBurst(tx, 1.1, tz, 20);
        }

        this.scene.remove(b.mesh);
        this.bullets.splice(i, 1);
        hudDirty = true;
      } else {
        b.x += (dx / dist) * step;
        b.y += (dy / dist) * step;
        b.z += (dz / dist) * step;
        b.mesh.position.set(b.x, b.y, b.z);
      }
    }

    if (hudDirty) {
      this.emitHud();
    }

    if (this.shockwaveLife > 0) {
      this.shockwaveLife = Math.max(0, this.shockwaveLife - dt);
      const progress = 1 - this.shockwaveLife / 0.45;
      this.shockwaveMesh.scale.setScalar(1 + progress * 9.5);
      this.shockwaveMat.opacity = (1 - progress) * 0.85;
    }

    let pDirty = false;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      pDirty = true;
      p.life += dt;
      if (p.life >= p.maxLife || p.y < 0) {
        p.active = false;
        _mat4.makeScale(0, 0, 0);
        this.particleMesh.setMatrixAt(i, _mat4);
        continue;
      }
      p.vy -= 14 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      _vec3.set(p.x, p.y, p.z);
      _euler.set(p.life * 6, p.life * 5, 0);
      _quat.setFromEuler(_euler);
      const s = 1 - p.life / p.maxLife;
      _scale.set(s, s, s);
      _mat4.compose(_vec3, _quat, _scale);
      this.particleMesh.setMatrixAt(i, _mat4);
    }
    if (pDirty) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
    }

    if (this.shakeIntensity > 0.005) {
      this.shakeIntensity = THREE.MathUtils.damp(this.shakeIntensity, 0, 12, dt);
      this.camera.position.set(
        this.baseCameraPos.x + (Math.random() - 0.5) * this.shakeIntensity,
        this.baseCameraPos.y + (Math.random() - 0.5) * this.shakeIntensity,
        this.baseCameraPos.z,
      );
    } else {
      this.camera.position.copy(this.baseCameraPos);
    }
    this.camera.lookAt(this.cameraTarget);
  }

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('resize', this.handleResize);

    for (const z of this.zombies) {
      z.rig.dispose();
    }
    this.zombies = [];

    for (const id of Array.from(this.defenders.keys())) {
      this.removeDefender(id);
    }

    this.disposables.forEach((d) => d.dispose());
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
