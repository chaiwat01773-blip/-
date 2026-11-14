import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ANSWER_PADS, type BlookAvatarId, type GamePhase, type PlayerPublicState } from '../shared/types.ts';
import { soundEngine } from '../audio/soundEngine.ts';
import { createBlookRig, type BlookRig } from './blookModels.ts';
import {
  createArenaFloorTexture,
  createFloorRoughnessTexture,
  createPadEmblemTexture,
} from './proceduralTextures.ts';

export type CameraPreset = 'arena' | 'follow' | 'stage' | 'podium';

export interface ArenaSceneCallbacks {
  onLocalMove: (x: number, z: number, rotY: number, vy: number) => void;
  onPadSelect: (optionIndex: 0 | 1 | 2 | 3) => void;
  onContextLost?: () => void;
}

interface PlayerEntity {
  id: string;
  avatar: BlookAvatarId;
  name: string;
  rig: BlookRig;
  x: number;
  y: number;
  z: number;
  rotY: number;
  vy: number;
  targetX: number;
  targetZ: number;
  targetRotY: number;
  targetVy: number;
  squash: number;
  answeredCurrent: boolean;
}

interface ConfettiParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  life: number;
  maxLife: number;
}

// Pre-allocated scratch math helpers (zero GC inside animation loop)
const _vec3 = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();

export class ArenaScene {
  private container: HTMLElement;
  private callbacks: ArenaSceneCallbacks;
  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;

  private frameId = 0;
  private disposed = false;
  private clock = new THREE.Clock();

  private keysHeld = new Set<string>();
  private jumpBufferTimer = 0;
  private coyoteTimer = 0;
  private lastMoveEmit = 0;

  private playersMap = new Map<string, PlayerEntity>();
  private previewRigs: BlookRig[] = [];
  private previewGroup = new THREE.Group();

  private localPlayerId: string | null = null;
  private inRoom = false;
  private phase: GamePhase = 'lobby';
  private correctIndex: number | null = null;
  private cameraPreset: CameraPreset = 'arena';
  private userInteractingCamera = false;
  private transitionGoalPos = new THREE.Vector3(0, 15, 22);
  private transitionGoalTarget = new THREE.Vector3(0, 1, 0);
  private transitionActive = false;

  // Interactive pads & stage elements
  private padGroups: Array<{
    group: THREE.Group;
    ringMat: THREE.MeshStandardMaterial;
    totem: THREE.Mesh;
    hitMesh: THREE.Mesh;
    index: 0 | 1 | 2 | 3;
  }> = [];
  private podiumGroup = new THREE.Group();
  private podiumTargetY = -4.0;
  private centerRing!: THREE.Mesh;
  private cloudsGroup = new THREE.Group();

  // Raycaster for 3D pad clicking
  private raycaster = new THREE.Raycaster();
  private pointerNdc = new THREE.Vector2();
  private pointerDownPos = { x: 0, y: 0 };

  // Confetti pool
  private confettiMesh!: THREE.InstancedMesh;
  private confettiPool: ConfettiParticle[] = [];

  private disposables: Array<{ dispose: () => void }> = [];

  constructor(container: HTMLElement, callbacks: ArenaSceneCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = ArenaScene.detectSoftwareGl();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2),
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);

    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b1628);
    this.scene.fog = new THREE.FogExp2(0x0b1628, 0.0135);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 180);
    this.camera.position.set(0, 14, 21);

    // Mandatory studio environment map via PMREMGenerator
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = envTex;
    this.disposables.push(envTex);
    pmremGenerator.dispose();

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.06;
    this.controls.maxPolarAngle = Math.PI * 0.46;
    this.controls.minPolarAngle = 0.2;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 42;
    this.controls.target.set(0, 0.8, 0);
    this.controls.addEventListener('start', () => {
      this.userInteractingCamera = true;
      this.transitionActive = false;
    });
    this.controls.addEventListener('end', () => {
      this.userInteractingCamera = false;
    });

    this.setupLighting();
    this.buildEnvironment();
    this.buildAnswerPads();
    this.buildPodium();
    this.buildConfettiPool();
    this.buildPreviewShowcase();

    this.raycaster.layers.set(1);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
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

  private setupLighting() {
    // Warm directional key light vs cool HemisphereLight fill
    const keyLight = new THREE.DirectionalLight(0xffedd5, 2.2);
    keyLight.position.set(16, 26, 14);
    keyLight.castShadow = !this.isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 70;
    const d = 20;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    this.scene.add(keyLight);

    const hemiLight = new THREE.HemisphereLight(0x7dd3fc, 0x0f172a, 0.88);
    this.scene.add(hemiLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.75);
    rimLight.position.set(-16, 12, -18);
    this.scene.add(rimLight);
  }

  private buildEnvironment() {
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const floorTex = createArenaFloorTexture(maxAniso);
    const roughTex = createFloorRoughnessTexture(maxAniso);
    this.disposables.push(floorTex, roughTex);

    // Main Sky-Island Courtyard
    const islandTopGeo = new THREE.CylinderGeometry(16.5, 15.8, 0.7, 8);
    const islandTopMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughnessMap: roughTex,
      roughness: 0.78,
      metalness: 0.08,
    });
    const islandTop = new THREE.Mesh(islandTopGeo, islandTopMat);
    islandTop.position.y = -0.35;
    islandTop.receiveShadow = true;
    this.scene.add(islandTop);

    // Stone cliff underbelly
    const cliffGeo = new THREE.CylinderGeometry(15.6, 8.5, 4.4, 8);
    const cliffMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.92,
      metalness: 0.05,
      flatShading: true,
    });
    const cliff = new THREE.Mesh(cliffGeo, cliffMat);
    cliff.position.y = -2.9;
    this.scene.add(cliff);

    // Glowing teal perimeter trim around island edge
    const trimGeo = new THREE.TorusGeometry(16.1, 0.16, 8, 8);
    trimGeo.rotateX(Math.PI / 2);
    trimGeo.rotateY(Math.PI / 8);
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x0891b2,
      emissiveIntensity: 0.6,
      roughness: 0.25,
      metalness: 0.7,
    });
    const trim = new THREE.Mesh(trimGeo, trimMat);
    trim.position.y = 0.01;
    this.scene.add(trim);

    // Central hexagonal quiz stage disc
    const stageGeo = new THREE.CylinderGeometry(3.2, 3.5, 0.16, 6);
    const stageMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.35,
      metalness: 0.55,
    });
    const stage = new THREE.Mesh(stageGeo, stageMat);
    stage.position.y = 0.08;
    stage.receiveShadow = true;
    this.scene.add(stage);

    const cRingGeo = new THREE.RingGeometry(2.55, 2.85, 6);
    cRingGeo.rotateX(-Math.PI / 2);
    const cRingMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    this.centerRing = new THREE.Mesh(cRingGeo, cRingMat);
    this.centerRing.position.y = 0.18;
    this.scene.add(this.centerRing);

    this.disposables.push(
      islandTopGeo,
      islandTopMat,
      cliffGeo,
      cliffMat,
      trimGeo,
      trimMat,
      stageGeo,
      stageMat,
      cRingGeo,
      cRingMat,
    );

    // Instanced perimeter crystal-pine trees & natural boulders on surrounding floating islets
    const treeCount = 28;
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 1.3, 6);
    trunkGeo.translate(0, 0.65, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 });
    const foliageGeo = new THREE.ConeGeometry(0.95, 2.4, 6);
    foliageGeo.translate(0, 2.2, 0);
    const foliageMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.72,
      flatShading: true,
    });

    const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
    const foliageInst = new THREE.InstancedMesh(foliageGeo, foliageMat, treeCount);
    foliageInst.castShadow = !this.isSoftwareGl;

    const rockCount = 26;
    const rockGeo = new THREE.DodecahedronGeometry(0.75, 0);
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.88,
      flatShading: true,
    });
    const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);

    const dummy = new THREE.Object3D();
    const foliagePalette = [0x0d9488, 0x10b981, 0x059669, 0x14b8a6];
    const rockPalette = [0x334155, 0x475569, 0x1e293b];

    for (let i = 0; i < treeCount; i++) {
      const angle = (i / treeCount) * Math.PI * 2 + 0.12;
      const dist = 14.3 + (i % 3) * 0.45;
      const s = 0.85 + (i % 5) * 0.08;
      dummy.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
      dummy.rotation.set(0, angle * 1.7, 0);
      dummy.scale.set(s, s * (0.9 + (i % 3) * 0.12), s);
      dummy.updateMatrix();
      trunkInst.setMatrixAt(i, dummy.matrix);
      foliageInst.setMatrixAt(i, dummy.matrix);

      _color.setHex(foliagePalette[i % foliagePalette.length]);
      foliageInst.setColorAt(i, _color);
    }
    trunkInst.instanceMatrix.needsUpdate = true;
    foliageInst.instanceMatrix.needsUpdate = true;
    if (foliageInst.instanceColor) foliageInst.instanceColor.needsUpdate = true;
    trunkInst.computeBoundingSphere();
    foliageInst.computeBoundingSphere();

    for (let i = 0; i < rockCount; i++) {
      const angle = (i / rockCount) * Math.PI * 2 + 0.25;
      const dist = 13.8 + ((i * 7) % 5) * 0.42;
      const s = 0.65 + ((i * 3) % 5) * 0.16;
      dummy.position.set(Math.cos(angle) * dist, s * 0.25, Math.sin(angle) * dist);
      dummy.rotation.set(i * 0.5, i * 1.1, 0);
      dummy.scale.set(s * 1.2, s * 0.75, s);
      dummy.updateMatrix();
      rockInst.setMatrixAt(i, dummy.matrix);
      _color.setHex(rockPalette[i % rockPalette.length]);
      rockInst.setColorAt(i, _color);
    }
    rockInst.instanceMatrix.needsUpdate = true;
    if (rockInst.instanceColor) rockInst.instanceColor.needsUpdate = true;
    rockInst.computeBoundingSphere();

    this.scene.add(trunkInst, foliageInst, rockInst);
    this.disposables.push(trunkGeo, trunkMat, foliageGeo, foliageMat, rockGeo, rockMat);

    // Distant floating sky islands & stylized clouds for horizon depth
    const cloudGeo = new THREE.IcosahedronGeometry(1.6, 1);
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.95,
      flatShading: true,
    });
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const dist = 28 + (i % 3) * 8;
      const cluster = new THREE.Group();
      cluster.position.set(Math.cos(angle) * dist, 3 + (i % 3) * 2.5, Math.sin(angle) * dist);
      for (let b = 0; b < 3; b++) {
        const puff = new THREE.Mesh(cloudGeo, cloudMat);
        puff.position.set((b - 1) * 1.3, (b % 2) * 0.5, 0);
        puff.scale.set(1.2, 0.55, 0.9);
        cluster.add(puff);
      }
      this.cloudsGroup.add(cluster);
    }
    this.scene.add(this.cloudsGroup);
    this.disposables.push(cloudGeo, cloudMat);
  }

  private buildAnswerPads() {
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const plinthGeo = new THREE.CylinderGeometry(3.15, 3.35, 0.16, 24);
    const ringGeo = new THREE.TorusGeometry(3.15, 0.11, 10, 32);
    ringGeo.rotateX(Math.PI / 2);
    const emblemGeo = new THREE.CircleGeometry(2.55, 24);
    emblemGeo.rotateX(-Math.PI / 2);
    const totemGeo = new THREE.OctahedronGeometry(0.48, 0);
    const hitGeo = new THREE.CylinderGeometry(3.3, 3.3, 1.4, 16);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });

    this.disposables.push(plinthGeo, ringGeo, emblemGeo, totemGeo, hitGeo, hitMat);

    for (const pad of ANSWER_PADS) {
      const group = new THREE.Group();
      group.position.set(pad.x, 0, pad.z);

      const plinthMat = new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.42,
        metalness: 0.45,
      });
      const plinth = new THREE.Mesh(plinthGeo, plinthMat);
      plinth.position.y = 0.08;
      plinth.receiveShadow = true;
      group.add(plinth);

      const ringMat = new THREE.MeshStandardMaterial({
        color: pad.colorNum,
        emissive: pad.colorNum,
        emissiveIntensity: 0.55,
        roughness: 0.2,
        metalness: 0.6,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 0.17;
      group.add(ring);

      const emblemTex = createPadEmblemTexture(pad.letter, pad.hexColor, maxAniso);
      const emblemMat = new THREE.MeshBasicMaterial({
        map: emblemTex,
        transparent: true,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      const emblem = new THREE.Mesh(emblemGeo, emblemMat);
      emblem.position.y = 0.18;
      group.add(emblem);

      const totemMat = new THREE.MeshStandardMaterial({
        color: pad.colorNum,
        emissive: pad.colorNum,
        emissiveIntensity: 0.35,
        roughness: 0.18,
        metalness: 0.78,
      });
      const totem = new THREE.Mesh(totemGeo, totemMat);
      const signX = pad.x < 0 ? -2.3 : 2.3;
      const signZ = pad.z < 0 ? -2.3 : 2.3;
      totem.position.set(signX, 1.8, signZ);
      totem.castShadow = !this.isSoftwareGl;
      group.add(totem);

      // Raycast hit proxy on layer 1
      const hitMesh = new THREE.Mesh(hitGeo, hitMat);
      hitMesh.position.y = 0.7;
      hitMesh.layers.set(1);
      hitMesh.userData.padIndex = pad.index;
      group.add(hitMesh);

      this.scene.add(group);
      this.padGroups.push({ group, ringMat, totem, hitMesh, index: pad.index });
      this.disposables.push(plinthMat, ringMat, emblemTex, emblemMat, totemMat);
    }
  }

  private buildPodium() {
    this.podiumGroup.position.set(0, this.podiumTargetY, 0);

    const specs = [
      { rank: 1, x: 0, h: 1.75, color: 0xfacc15 },
      { rank: 2, x: -2.4, h: 1.15, color: 0xcbd5e1 },
      { rank: 3, x: 2.4, h: 0.8, color: 0xd97706 },
    ];

    for (const s of specs) {
      const geo = new THREE.BoxGeometry(1.9, s.h, 1.9);
      const mat = new THREE.MeshStandardMaterial({
        color: s.color,
        roughness: 0.25,
        metalness: 0.72,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(s.x, s.h / 2, 0);
      mesh.castShadow = !this.isSoftwareGl;
      mesh.receiveShadow = true;
      this.podiumGroup.add(mesh);
      this.disposables.push(geo, mat);
    }

    this.scene.add(this.podiumGroup);
  }

  private buildConfettiPool() {
    const count = 120;
    const geo = new THREE.BoxGeometry(0.16, 0.04, 0.24);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.3,
      metalness: 0.2,
    });
    this.confettiMesh = new THREE.InstancedMesh(geo, mat, count);
    this.confettiMesh.frustumCulled = false;

    const colors = [0xef4444, 0x06b6d4, 0xf59e0b, 0x22c55e, 0xa855f7, 0xf472b6];
    for (let i = 0; i < count; i++) {
      this.confettiPool.push({
        active: false,
        x: 0,
        y: -20,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        rx: 0,
        ry: 0,
        life: 0,
        maxLife: 2.5,
      });
      _color.setHex(colors[i % colors.length]);
      this.confettiMesh.setColorAt(i, _color);
      _mat4.makeScale(0, 0, 0);
      this.confettiMesh.setMatrixAt(i, _mat4);
    }
    this.confettiMesh.instanceMatrix.needsUpdate = true;
    if (this.confettiMesh.instanceColor) this.confettiMesh.instanceColor.needsUpdate = true;
    this.scene.add(this.confettiMesh);
    this.disposables.push(geo, mat);
  }

  public triggerConfetti(originX = 0, originY = 2.5, originZ = 0) {
    for (let i = 0; i < this.confettiPool.length; i++) {
      const p = this.confettiPool[i];
      p.active = true;
      p.x = originX + (Math.random() - 0.5) * 3;
      p.y = originY + Math.random() * 1.5;
      p.z = originZ + (Math.random() - 0.5) * 3;
      const angle = Math.random() * Math.PI * 2;
      const speed = 2.5 + Math.random() * 5.5;
      p.vx = Math.cos(angle) * speed;
      p.vy = 5.5 + Math.random() * 6.5;
      p.vz = Math.sin(angle) * speed;
      p.rx = Math.random() * Math.PI;
      p.ry = Math.random() * Math.PI;
      p.life = 0;
      p.maxLife = 1.8 + Math.random() * 1.2;
    }
  }

  private buildPreviewShowcase() {
    const previewTypes: BlookAvatarId[] = ['fox', 'unicorn', 'robot', 'frog'];
    previewTypes.forEach((av, idx) => {
      const rig = createBlookRig(av, { castShadow: !this.isSoftwareGl });
      const angle = (idx / previewTypes.length) * Math.PI * 2 + 0.4;
      rig.root.position.set(Math.cos(angle) * 2.1, 0.16, Math.sin(angle) * 2.1);
      rig.root.rotation.y = -angle + Math.PI / 2;
      this.previewGroup.add(rig.root);
      this.previewRigs.push(rig);
    });
    this.scene.add(this.previewGroup);
  }

  public setPreviewVisible(visible: boolean) {
    this.previewGroup.visible = visible;
  }

  public syncRoomState(params: {
    inRoom: boolean;
    localPlayerId: string | null;
    phase: GamePhase;
    correctIndex: number | null;
    players: PlayerPublicState[];
  }) {
    const prevPhase = this.phase;
    this.inRoom = params.inRoom;
    this.localPlayerId = params.localPlayerId;
    this.phase = params.phase;
    this.correctIndex = params.correctIndex;

    this.previewGroup.visible = !params.inRoom;

    if (params.phase === 'podium' && prevPhase !== 'podium') {
      this.setCameraPreset('podium');
      this.triggerConfetti(0, 3.2, 0);
    } else if (params.phase === 'question' && prevPhase !== 'question') {
      this.setCameraPreset(this.localPlayerId ? 'follow' : 'arena');
    } else if (params.phase === 'reveal' && prevPhase !== 'reveal') {
      if (params.correctIndex !== null) {
        const pad = ANSWER_PADS[params.correctIndex];
        if (pad) this.triggerConfetti(pad.x, 1.5, pad.z);
      }
    }

    this.podiumTargetY = params.phase === 'podium' ? 0.02 : -4.2;

    // Reconcile players
    const incomingIds = new Set(params.players.map((p) => p.id));
    for (const [id, ent] of this.playersMap.entries()) {
      if (!incomingIds.has(id)) {
        this.scene.remove(ent.rig.root);
        ent.rig.dispose();
        this.playersMap.delete(id);
      }
    }

    // Sort top 3 for podium placement
    const sorted = [...params.players].sort((a, b) => b.score - a.score);

    params.players.forEach((p) => {
      let ent = this.playersMap.get(p.id);
      const isLocal = p.id === params.localPlayerId;

      if (!ent) {
        const rig = createBlookRig(p.avatar, {
          name: p.name,
          isLocal,
          castShadow: !this.isSoftwareGl,
        });
        rig.root.position.set(p.x, 0, p.z);
        rig.root.rotation.y = p.rotY;
        this.scene.add(rig.root);

        ent = {
          id: p.id,
          avatar: p.avatar,
          name: p.name,
          rig,
          x: p.x,
          y: 0,
          z: p.z,
          rotY: p.rotY,
          vy: 0,
          targetX: p.x,
          targetZ: p.z,
          targetRotY: p.rotY,
          targetVy: 0,
          squash: 1,
          answeredCurrent: p.answeredCurrent,
        };
        this.playersMap.set(p.id, ent);
      }

      ent.answeredCurrent = p.answeredCurrent;

      // Update ground ring color to indicate locked answer
      const ringMat = ent.rig.ringMesh.material as THREE.MeshBasicMaterial;
      if (p.answeredCurrent) {
        ringMat.color.setHex(0x22c55e);
        ringMat.opacity = 0.85;
      } else {
        ringMat.color.setHex(isLocal ? 0x38bdf8 : 0x64748b);
        ringMat.opacity = isLocal ? 0.85 : 0.25;
      }

      if (params.phase === 'podium') {
        const rankIdx = sorted.findIndex((s) => s.id === p.id);
        if (rankIdx === 0) {
          ent.targetX = 0;
          ent.targetZ = 0;
          ent.targetRotY = 0;
        } else if (rankIdx === 1) {
          ent.targetX = -2.4;
          ent.targetZ = 0;
          ent.targetRotY = 0.15;
        } else if (rankIdx === 2) {
          ent.targetX = 2.4;
          ent.targetZ = 0;
          ent.targetRotY = -0.15;
        } else {
          ent.targetX = p.x;
          ent.targetZ = Math.max(4.5, p.z);
          ent.targetRotY = Math.PI;
        }
      } else if (!isLocal || prevPhase !== params.phase) {
        ent.targetX = p.x;
        ent.targetZ = p.z;
        ent.targetRotY = p.rotY;
        if (isLocal && prevPhase !== params.phase) {
          ent.x = p.x;
          ent.z = p.z;
          ent.rotY = p.rotY;
        }
      }
    });
  }

  public applyRemoteMove(payload: { id: string; x: number; z: number; rotY: number; vy: number }) {
    if (payload.id === this.localPlayerId || this.phase === 'podium') return;
    const ent = this.playersMap.get(payload.id);
    if (!ent) return;
    ent.targetX = payload.x;
    ent.targetZ = payload.z;
    ent.targetRotY = payload.rotY;
    ent.targetVy = payload.vy;
  }

  public setCameraPreset(preset: CameraPreset) {
    this.cameraPreset = preset;
    this.userInteractingCamera = false;
    this.transitionActive = true;

    if (preset === 'arena') {
      this.transitionGoalPos.set(0, 14.5, 20.5);
      this.transitionGoalTarget.set(0, 0.8, 0);
    } else if (preset === 'stage') {
      this.transitionGoalPos.set(11, 7.5, 13.5);
      this.transitionGoalTarget.set(0, 1.0, 0);
    } else if (preset === 'podium') {
      this.transitionGoalPos.set(0, 4.6, 9.8);
      this.transitionGoalTarget.set(0, 1.5, 0);
    }
  }

  public moveLocalPlayerToPad(padIndex: 0 | 1 | 2 | 3) {
    const pad = ANSWER_PADS[padIndex];
    if (!pad || !this.localPlayerId) return;
    const ent = this.playersMap.get(this.localPlayerId);
    if (!ent) return;
    ent.x = pad.x + (Math.random() - 0.5) * 0.8;
    ent.z = pad.z + (Math.random() - 0.5) * 0.8;
    ent.vy = 5.5;
    ent.squash = 1.28;
    soundEngine.playJump();
    this.callbacks.onLocalMove(ent.x, ent.z, ent.rotY, ent.vy);
  }

  private bindEvents() {
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);
  }

  private handleContextLost = (e: Event) => {
    e.preventDefault();
    this.callbacks.onContextLost?.();
  };

  private handleResize = () => {
    if (this.disposed) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    this.keysHeld.add(e.code);
    if (e.code === 'Space') {
      this.jumpBufferTimer = 0.14;
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    this.keysHeld.delete(e.code);
  };

  private handleWindowBlur = () => {
    this.keysHeld.clear();
  };

  private handlePointerDown = (e: PointerEvent) => {
    this.pointerDownPos.x = e.clientX;
    this.pointerDownPos.y = e.clientY;
  };

  private handlePointerUp = (e: PointerEvent) => {
    // Only treat as click if pointer didn't drag
    const dx = e.clientX - this.pointerDownPos.x;
    const dy = e.clientY - this.pointerDownPos.y;
    if (dx * dx + dy * dy > 36) return;
    if (this.phase !== 'question' || !this.localPlayerId) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hits = this.raycaster.intersectObjects(
      this.padGroups.map((p) => p.hitMesh),
      false,
    );
    if (hits.length > 0) {
      const idx = hits[0].object.userData.padIndex as 0 | 1 | 2 | 3;
      this.moveLocalPlayerToPad(idx);
      this.callbacks.onPadSelect(idx);
    }
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
      const dt = Math.min(this.clock.getDelta(), 0.05);
      const elapsed = this.clock.getElapsedTime();

      this.updateScene(dt, elapsed);
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

  private updateScene(dt: number, elapsed: number) {
    // 1. Rotate center stage ring & pad totems
    this.centerRing.rotation.z = elapsed * 0.35;
    this.cloudsGroup.rotation.y = elapsed * 0.015;

    for (let i = 0; i < this.padGroups.length; i++) {
      const pad = this.padGroups[i];
      pad.totem.rotation.y = elapsed * 1.4 + i;
      pad.totem.position.y = 1.75 + Math.sin(elapsed * 2.2 + i) * 0.22;

      if (this.phase === 'reveal' && this.correctIndex !== null) {
        const isCorrect = pad.index === this.correctIndex;
        pad.ringMat.emissiveIntensity = isCorrect ? 1.4 + Math.sin(elapsed * 8) * 0.4 : 0.12;
      } else if (this.phase === 'question') {
        pad.ringMat.emissiveIntensity = 0.65 + Math.sin(elapsed * 3.5 + i) * 0.15;
      } else {
        pad.ringMat.emissiveIntensity = 0.35;
      }
    }

    // 2. Smoothly raise/lower Winner's Podium
    this.podiumGroup.position.y = THREE.MathUtils.damp(
      this.podiumGroup.position.y,
      this.podiumTargetY,
      6,
      dt,
    );

    // 3. Animate preview showcase Blooks on Title Screen
    if (this.previewGroup.visible) {
      for (let i = 0; i < this.previewRigs.length; i++) {
        const rig = this.previewRigs[i];
        const hop = Math.max(0, Math.sin(elapsed * 3.2 + i * 1.4)) * 0.35;
        rig.bodyPivot.position.y = hop;
        rig.shadowMesh.scale.setScalar(1 - hop * 0.35);
        if (rig.wingLeft && rig.wingRight) {
          const flap = Math.sin(elapsed * 14 + i) * 0.35;
          rig.wingLeft.rotation.z = flap;
          rig.wingRight.rotation.z = -flap;
        }
      }
    }

    // 4. Local Player Physics & Controls (WASD / Arrows + Space jump)
    const now = performance.now();
    if (this.inRoom && this.localPlayerId && this.phase !== 'podium') {
      const local = this.playersMap.get(this.localPlayerId);
      if (local) {
        let moveX = 0;
        let moveZ = 0;
        if (this.keysHeld.has('KeyW') || this.keysHeld.has('ArrowUp')) moveZ -= 1;
        if (this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown')) moveZ += 1;
        if (this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft')) moveX -= 1;
        if (this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight')) moveX += 1;

        const moving = moveX !== 0 || moveZ !== 0;
        if (moving) {
          const len = Math.hypot(moveX, moveZ);
          moveX /= len;
          moveZ /= len;
          const speed = 8.8;
          local.x = THREE.MathUtils.clamp(local.x + moveX * speed * dt, -13.2, 13.2);
          local.z = THREE.MathUtils.clamp(local.z + moveZ * speed * dt, -13.2, 13.2);
          const desiredRot = Math.atan2(moveX, moveZ);
          let diff = desiredRot - local.rotY;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          local.rotY += diff * Math.min(1, dt * 12);
        }

        // Coyote time + jump buffer
        if (local.y <= 0.02) {
          this.coyoteTimer = 0.1;
        } else {
          this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
        }
        this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);

        if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0) {
          local.vy = 7.8;
          local.squash = 1.26;
          this.jumpBufferTimer = 0;
          this.coyoteTimer = 0;
          soundEngine.playJump();
        }

        local.vy -= 22 * dt;
        local.y += local.vy * dt;
        if (local.y <= 0) {
          if (local.vy < -3) {
            local.squash = 0.78;
          }
          local.y = 0;
          local.vy = 0;
        }

        // Auto-submit if player walks onto an Answer Pad during active question
        if (this.phase === 'question' && !local.answeredCurrent) {
          for (const pad of ANSWER_PADS) {
            const dist = Math.hypot(local.x - pad.x, local.z - pad.z);
            if (dist < pad.radius - 0.35) {
              this.callbacks.onPadSelect(pad.index);
              break;
            }
          }
        }

        // Throttled 20Hz socket emission when moving or airborne
        if ((moving || local.y > 0.01) && now - this.lastMoveEmit > 50) {
          this.lastMoveEmit = now;
          this.callbacks.onLocalMove(local.x, local.z, local.rotY, local.vy);
        }
      }
    }

    // 5. Update all player Blook transforms, squash-and-stretch, and podium heights
    const sorted = Array.from(this.playersMap.values());
    for (const ent of sorted) {
      const isLocal = ent.id === this.localPlayerId;

      if (!isLocal || this.phase === 'podium') {
        ent.x = THREE.MathUtils.damp(ent.x, ent.targetX, 10, dt);
        ent.z = THREE.MathUtils.damp(ent.z, ent.targetZ, 10, dt);

        let diff = ent.targetRotY - ent.rotY;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        ent.rotY += diff * Math.min(1, dt * 10);

        if (this.phase !== 'podium') {
          if (ent.targetVy > 2 && ent.y <= 0.02) {
            ent.vy = ent.targetVy;
          }
          ent.vy -= 22 * dt;
          ent.y = Math.max(0, ent.y + ent.vy * dt);
          if (ent.y === 0) ent.vy = 0;
        }
      }

      // Base surface elevation (on podium or on island ground)
      let baseSurfaceY = 0;
      if (this.phase === 'podium') {
        if (Math.abs(ent.targetX) < 0.5 && Math.abs(ent.targetZ) < 0.5) baseSurfaceY = 1.77;
        else if (Math.abs(ent.targetX + 2.4) < 0.5 && Math.abs(ent.targetZ) < 0.5) baseSurfaceY = 1.17;
        else if (Math.abs(ent.targetX - 2.4) < 0.5 && Math.abs(ent.targetZ) < 0.5) baseSurfaceY = 0.82;
      } else {
        // Slight elevation if standing inside center stage or pad
        const centerDist = Math.hypot(ent.x, ent.z);
        if (centerDist < 3.1) baseSurfaceY = 0.16;
        else {
          for (const pad of ANSWER_PADS) {
            if (Math.hypot(ent.x - pad.x, ent.z - pad.z) < 3.15) {
              baseSurfaceY = 0.16;
              break;
            }
          }
        }
      }

      ent.squash = THREE.MathUtils.damp(ent.squash, 1, 10, dt);
      const speed = Math.hypot(ent.targetX - ent.x, ent.targetZ - ent.z);
      const runBob = !isLocal && speed > 0.1 ? Math.abs(Math.sin(elapsed * 12)) * 0.16 : 0;

      ent.rig.root.position.set(ent.x, baseSurfaceY, ent.z);
      ent.rig.bodyPivot.position.y = ent.y + runBob;
      ent.rig.bodyPivot.rotation.y = ent.rotY;

      const invSq = 1 / Math.sqrt(Math.max(0.5, ent.squash));
      ent.rig.bodyPivot.scale.set(invSq, ent.squash, invSq);

      const shadowScale = Math.max(0.45, 1 - (ent.y + runBob) * 0.25);
      ent.rig.shadowMesh.scale.setScalar(shadowScale);

      if (ent.rig.wingLeft && ent.rig.wingRight) {
        const flap = Math.sin(elapsed * 15) * 0.35;
        ent.rig.wingLeft.rotation.z = flap;
        ent.rig.wingRight.rotation.z = -flap;
      }
    }

    // 6. Confetti physics
    let confettiDirty = false;
    for (let i = 0; i < this.confettiPool.length; i++) {
      const p = this.confettiPool[i];
      if (!p.active) continue;
      confettiDirty = true;
      p.life += dt;
      if (p.life >= p.maxLife || p.y < -2) {
        p.active = false;
        _mat4.makeScale(0, 0, 0);
        this.confettiMesh.setMatrixAt(i, _mat4);
        continue;
      }
      p.vy -= 11 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rx += 5 * dt;
      p.ry += 4 * dt;

      _vec3.set(p.x, p.y, p.z);
      _euler.set(p.rx, p.ry, 0);
      _quat.setFromEuler(_euler);
      const s = 1 - p.life / p.maxLife;
      _scale.set(s, s, s);
      _mat4.compose(_vec3, _quat, _scale);
      this.confettiMesh.setMatrixAt(i, _mat4);
    }
    if (confettiDirty) {
      this.confettiMesh.instanceMatrix.needsUpdate = true;
    }

    // 7. Camera choreography
    if (!this.inRoom) {
      // Gentle cinematic title screen orbit
      const camAngle = elapsed * 0.14;
      this.camera.position.set(Math.sin(camAngle) * 19, 9.5, Math.cos(camAngle) * 19);
      this.controls.target.set(0, 1.0, 0);
      this.controls.update();
    } else if (!this.userInteractingCamera) {
      if (this.cameraPreset === 'follow' && this.localPlayerId && this.phase !== 'podium') {
        const local = this.playersMap.get(this.localPlayerId);
        if (local) {
          _vec3.set(local.x, 10.5, local.z + 12.5);
          _vec3B.set(local.x, 0.8, local.z);
          this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, _vec3.x, 4.5, dt);
          this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, _vec3.y, 4.5, dt);
          this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, _vec3.z, 4.5, dt);
          this.controls.target.x = THREE.MathUtils.damp(this.controls.target.x, _vec3B.x, 6, dt);
          this.controls.target.y = THREE.MathUtils.damp(this.controls.target.y, _vec3B.y, 6, dt);
          this.controls.target.z = THREE.MathUtils.damp(this.controls.target.z, _vec3B.z, 6, dt);
        }
      } else if (this.transitionActive) {
        this.camera.position.x = THREE.MathUtils.damp(
          this.camera.position.x,
          this.transitionGoalPos.x,
          5,
          dt,
        );
        this.camera.position.y = THREE.MathUtils.damp(
          this.camera.position.y,
          this.transitionGoalPos.y,
          5,
          dt,
        );
        this.camera.position.z = THREE.MathUtils.damp(
          this.camera.position.z,
          this.transitionGoalPos.z,
          5,
          dt,
        );
        this.controls.target.x = THREE.MathUtils.damp(
          this.controls.target.x,
          this.transitionGoalTarget.x,
          5,
          dt,
        );
        this.controls.target.y = THREE.MathUtils.damp(
          this.controls.target.y,
          this.transitionGoalTarget.y,
          5,
          dt,
        );
        this.controls.target.z = THREE.MathUtils.damp(
          this.controls.target.z,
          this.transitionGoalTarget.z,
          5,
          dt,
        );
        if (this.camera.position.distanceTo(this.transitionGoalPos) < 0.08) {
          this.transitionActive = false;
        }
      }
      this.controls.update();
    } else {
      this.controls.update();
    }
  }

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.removeEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);

    for (const ent of this.playersMap.values()) {
      ent.rig.dispose();
    }
    this.playersMap.clear();

    for (const rig of this.previewRigs) {
      rig.dispose();
    }
    this.previewRigs = [];

    this.disposables.forEach((d) => d.dispose());
    this.controls.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
