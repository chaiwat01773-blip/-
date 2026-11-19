import * as THREE from 'three';
import { formatLogicPromptLines } from '../shared/logicPuzzles.ts';
import type { ZombieTier } from '../shared/types.ts';
import { createContactShadowTexture } from './proceduralTextures.ts';

let sharedZombieShadow: THREE.CanvasTexture | null = null;
function getZombieShadowTex(): THREE.CanvasTexture {
  if (!sharedZombieShadow) {
    sharedZombieShadow = createContactShadowTexture();
  }
  return sharedZombieShadow;
}

export interface ZombieLabelBossInfo {
  isBoss?: boolean;
  bossStep?: number;
  bossTotalSteps?: number;
}

export interface ZombieRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  leftArm: THREE.Mesh;
  rightArm: THREE.Mesh;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  shadowMesh: THREE.Mesh;
  targetRing: THREE.Mesh;
  labelSprite: THREE.Sprite;
  hitMaterials: THREE.MeshStandardMaterial[];
  setTargeted: (targeted: boolean) => void;
  updateLabel: (
    tier: ZombieTier,
    prompt: string,
    enraged?: boolean,
    bossInfo?: ZombieLabelBossInfo,
  ) => void;
  dispose: () => void;
}

function drawLogicQuestionCanvas(
  canvas: HTMLCanvasElement,
  tier: ZombieTier,
  prompt: string,
  enraged = false,
  bossInfo?: ZombieLabelBossInfo,
) {
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const isBoss = Boolean(bossInfo?.isBoss);
  const bossStep = bossInfo?.bossStep ?? 0;
  const bossTotal = bossInfo?.bossTotalSteps ?? 5;

  const tierSpec: Record<ZombieTier, { label: string; badgeBg: string; border: string }> = {
    easy: { label: 'EASY', badgeBg: '#22c55e', border: '#4ade80' },
    medium: { label: 'MEDIUM', badgeBg: '#a855f7', border: '#c084fc' },
    hard: { label: 'HARD', badgeBg: '#ef4444', border: '#f87171' },
  };
  const spec = tierSpec[tier];

  const r = 22;
  const pad = 10;
  const w = W - pad * 2;
  const h = H - pad * 2;
  const x = pad;
  const y = pad;

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();

  ctx.fillStyle = isBoss
    ? 'rgba(55, 8, 18, 0.96)'
    : enraged
      ? 'rgba(69, 10, 10, 0.96)'
      : 'rgba(11, 18, 32, 0.94)';
  ctx.fill();
  ctx.lineWidth = isBoss ? 8 : enraged ? 7 : 5;
  ctx.strokeStyle = isBoss ? '#fbbf24' : enraged ? '#fb923c' : spec.border;
  ctx.stroke();

  // Header badge
  if (isBoss) {
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(28, 22, 186, 32);
    ctx.fillStyle = '#fef08a';
    ctx.font = '900 18px "Noto Sans Thai", "Outfit", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`👹 BOSS ข้อ ${bossStep + 1}/${bossTotal}`, 121, 39);

    // 5-segment Boss Shield Bar
    const remaining = Math.max(0, bossTotal - bossStep);
    const barStartX = 228;
    const pipW = 24;
    const pipGap = 6;
    for (let i = 0; i < bossTotal; i++) {
      ctx.fillStyle = i < remaining ? '#facc15' : '#334155';
      ctx.fillRect(barStartX + i * (pipW + pipGap), 27, pipW, 20);
    }
  } else {
    ctx.fillStyle = spec.badgeBg;
    ctx.fillRect(28, 22, 128, 30);
    ctx.fillStyle = '#090d16';
    ctx.font = '800 18px "Outfit", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(spec.label, 92, 38);
  }

  if (enraged) {
    ctx.fillStyle = '#f97316';
    ctx.fillRect(W - 186, 22, 158, 30);
    ctx.fillStyle = '#090d16';
    ctx.font = '800 16px "Noto Sans Thai", "Outfit", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚡ วิ่งเร็วขึ้น!', W - 107, 38);
  }

  // Multi-line prompt lines (P on line 1, Q on line 2, Question on line 3)
  const lines = formatLogicPromptLines(prompt).slice(0, 3);
  const contentTop = 68;
  const contentBottom = H - 20;
  const availH = contentBottom - contentTop;
  const stepY = availH / Math.max(1, lines.length);

  lines.forEach((line, idx) => {
    const isLast = idx === lines.length - 1;
    const isAssignment = /^[PQR]\s*=/.test(line);
    const baseSize =
      lines.length >= 3
        ? isLast
          ? 27
          : 24
        : lines.length === 2
          ? isLast
            ? 29
            : 25
          : line.length > 26
            ? 25
            : 32;

    ctx.fillStyle = isAssignment && !isLast ? '#67e8f9' : '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${baseSize}px "Noto Sans Thai", "Outfit", sans-serif`;
    const cy = contentTop + stepY * (idx + 0.5);
    ctx.fillText(line, W / 2, cy, W - 48);
  });
}

/**
 * Composite procedural 3D Zombie / Boss Zombie model pivoted at bottom-center (y = 0)
 * facing -X (toward the defender barricade on the left).
 */
export function createZombieRig(
  tier: ZombieTier,
  prompt: string,
  castShadow = true,
  enraged = false,
  bossInfo?: ZombieLabelBossInfo,
): ZombieRig {
  const isBoss = Boolean(bossInfo?.isBoss);
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const disposables: Array<{ dispose: () => void }> = [];

  const skinHex = isBoss
    ? 0x7f1d1d
    : tier === 'easy'
      ? 0x65a30d
      : tier === 'medium'
        ? 0x7e22ce
        : 0xbe123c;
  const shirtHex = isBoss
    ? 0x1e1b4b
    : tier === 'easy'
      ? 0x334155
      : tier === 'medium'
        ? 0x1e1b4b
        : 0x450a0a;
  const eyeHex = isBoss
    ? 0xfef08a
    : tier === 'easy'
      ? 0xbef264
      : tier === 'medium'
        ? 0xe879f9
        : 0xfacc15;

  const skinMat = new THREE.MeshStandardMaterial({
    color: skinHex,
    roughness: 0.65,
    metalness: isBoss ? 0.15 : 0.05,
  });
  const shirtMat = new THREE.MeshStandardMaterial({
    color: shirtHex,
    roughness: 0.86,
    metalness: 0.1,
  });
  const armorMat = new THREE.MeshStandardMaterial({
    color: isBoss || tier === 'hard' ? 0xf59e0b : 0x64748b,
    roughness: 0.22,
    metalness: 0.85,
  });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: eyeHex,
    emissive: isBoss ? 0xef4444 : enraged ? 0xf97316 : eyeHex,
    emissiveIntensity: isBoss ? 3.2 : enraged ? 2.6 : 1.2,
    roughness: 0.15,
  });
  disposables.push(skinMat, shirtMat, armorMat, eyeMat);

  // Contact shadow
  const shadowSize = isBoss ? 2.6 : 1.75;
  const shadowGeo = new THREE.PlaneGeometry(shadowSize, shadowSize);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: getZombieShadowTex(),
    transparent: true,
    depthWrite: false,
    opacity: isBoss ? 0.65 : 0.52,
  });
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.position.y = 0.02;
  root.add(shadowMesh);
  disposables.push(shadowGeo, shadowMat);

  // Target selection ring under zombie's feet
  const ringGeo = new THREE.RingGeometry(isBoss ? 0.95 : 0.75, isBoss ? 1.24 : 0.96, 30);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: isBoss ? 0xfacc15 : 0x38bdf8,
    transparent: true,
    opacity: isBoss ? 0.75 : 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const targetRing = new THREE.Mesh(ringGeo, ringMat);
  targetRing.position.y = 0.04;
  root.add(targetRing);
  disposables.push(ringGeo, ringMat);

  // 1 & 2. Legs (bottom at y = 0)
  const legGeo = new THREE.BoxGeometry(0.24, 0.56, 0.24);
  const leftLeg = new THREE.Mesh(legGeo, shirtMat);
  leftLeg.position.set(0, 0.28, -0.2);
  leftLeg.castShadow = castShadow;
  const rightLeg = new THREE.Mesh(legGeo, shirtMat);
  rightLeg.position.set(0, 0.28, 0.2);
  rightLeg.castShadow = castShadow;
  bodyGroup.add(leftLeg, rightLeg);

  // 3. Torso
  const torsoGeo = new THREE.BoxGeometry(0.56, 0.78, 0.72);
  const torso = new THREE.Mesh(torsoGeo, shirtMat);
  torso.position.set(0, 0.92, 0);
  torso.rotation.z = 0.08;
  torso.castShadow = castShadow;
  bodyGroup.add(torso);

  // 4. Head
  const headGeo = new THREE.BoxGeometry(0.64, 0.62, 0.64);
  const head = new THREE.Mesh(headGeo, skinMat);
  head.position.set(-0.06, 1.62, 0);
  head.castShadow = castShadow;
  bodyGroup.add(head);

  // 5 & 6. Glowing Zombie Eyes
  const eyeGeo = new THREE.BoxGeometry(0.08, 0.12, 0.14);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.38, 1.66, -0.15);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeR.position.set(-0.38, 1.66, 0.15);
  bodyGroup.add(eyeL, eyeR);

  // 7 & 8. Outstretched Zombie Arms
  const armGeo = new THREE.BoxGeometry(0.64, 0.2, 0.2);
  armGeo.translate(-0.28, 0, 0);
  const leftArm = new THREE.Mesh(armGeo, skinMat);
  leftArm.position.set(-0.08, 1.15, -0.46);
  leftArm.castShadow = castShadow;
  const rightArm = new THREE.Mesh(armGeo, skinMat);
  rightArm.position.set(-0.08, 1.15, 0.46);
  rightArm.castShadow = castShadow;
  bodyGroup.add(leftArm, rightArm);

  disposables.push(legGeo, torsoGeo, headGeo, eyeGeo, armGeo);

  // 9 & 10. Tier-specific Armor / Boss Horns & Crown
  if (isBoss || tier === 'medium' || tier === 'hard') {
    const shoulderGeo = new THREE.BoxGeometry(0.34, 0.26, 0.3);
    [-1, 1].forEach((s) => {
      const pad = new THREE.Mesh(shoulderGeo, armorMat);
      pad.position.set(0, 1.28, s * 0.46);
      bodyGroup.add(pad);
    });
    disposables.push(shoulderGeo);
  }

  if (isBoss) {
    const crownGeo = new THREE.ConeGeometry(0.32, 0.42, 6);
    const crown = new THREE.Mesh(crownGeo, armorMat);
    crown.position.set(-0.06, 2.12, 0);
    bodyGroup.add(crown);

    const hornGeo = new THREE.ConeGeometry(0.11, 0.48, 5);
    [-1, 1].forEach((s) => {
      const horn = new THREE.Mesh(hornGeo, armorMat);
      horn.position.set(-0.14, 2.02, s * 0.28);
      horn.rotation.x = s * 0.35;
      horn.rotation.z = 0.28;
      bodyGroup.add(horn);
    });
    disposables.push(crownGeo, hornGeo);
    root.scale.setScalar(1.52);
  } else if (tier === 'hard') {
    const crownGeo = new THREE.ConeGeometry(0.28, 0.34, 5);
    const crown = new THREE.Mesh(crownGeo, armorMat);
    crown.position.set(-0.06, 2.08, 0);
    bodyGroup.add(crown);
    disposables.push(crownGeo);

    root.scale.setScalar(1.16);
  }

  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 560;
  labelCanvas.height = 212;
  drawLogicQuestionCanvas(labelCanvas, tier, prompt, enraged, bossInfo);

  const labelTex = new THREE.CanvasTexture(labelCanvas);
  labelTex.colorSpace = THREE.SRGBColorSpace;
  labelTex.needsUpdate = true;

  const labelMat = new THREE.SpriteMaterial({
    map: labelTex,
    transparent: true,
    depthWrite: false,
  });
  const labelSprite = new THREE.Sprite(labelMat);
  labelSprite.scale.set(isBoss ? 4.35 : 4.0, isBoss ? 1.65 : 1.5, 1);
  labelSprite.position.set(0, isBoss ? 3.15 : 2.95, 0);
  root.add(labelSprite);

  return {
    root,
    bodyGroup,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    shadowMesh,
    targetRing,
    labelSprite,
    hitMaterials: [skinMat, shirtMat, armorMat],
    setTargeted: (targeted: boolean) => {
      ringMat.opacity = targeted ? 0.92 : isBoss ? 0.35 : 0;
    },
    updateLabel: (
      nextTier: ZombieTier,
      nextPrompt: string,
      nextEnraged = false,
      nextBossInfo?: ZombieLabelBossInfo,
    ) => {
      drawLogicQuestionCanvas(labelCanvas, nextTier, nextPrompt, nextEnraged, nextBossInfo);
      labelTex.needsUpdate = true;
      if (nextEnraged) {
        eyeMat.emissive.setHex(0xf97316);
        eyeMat.emissiveIntensity = 2.8;
      }
    },
    dispose: () => {
      disposables.forEach((d) => d.dispose());
      labelTex.dispose();
      labelMat.dispose();
    },
  };
}
