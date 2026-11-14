import * as THREE from 'three';
import type { BlookAvatarId } from '../shared/types.ts';
import { createContactShadowTexture, createNameTagSprite } from './proceduralTextures.ts';

let sharedShadowTex: THREE.CanvasTexture | null = null;
let sharedBlookBodyGeo: THREE.ExtrudeGeometry | null = null;
let sharedFootGeo: THREE.CapsuleGeometry | null = null;
let sharedEyeWhiteGeo: THREE.SphereGeometry | null = null;
let sharedEyePupilGeo: THREE.SphereGeometry | null = null;

function getSharedShadowTex(): THREE.CanvasTexture {
  if (!sharedShadowTex) {
    sharedShadowTex = createContactShadowTexture();
  }
  return sharedShadowTex;
}

function getSharedBodyGeometry(): THREE.ExtrudeGeometry {
  if (!sharedBlookBodyGeo) {
    const s = 0.42;
    const r = 0.14;
    const shape = new THREE.Shape();
    shape.moveTo(-s + r, -s);
    shape.lineTo(s - r, -s);
    shape.quadraticCurveTo(s, -s, s, -s + r);
    shape.lineTo(s, s - r);
    shape.quadraticCurveTo(s, s, s - r, s);
    shape.lineTo(-s + r, s);
    shape.quadraticCurveTo(-s, s, -s, s - r);
    shape.lineTo(-s, -s + r);
    shape.quadraticCurveTo(-s, -s, -s + r, -s);

    sharedBlookBodyGeo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.72,
      bevelEnabled: true,
      bevelSegments: 4,
      steps: 1,
      bevelSize: 0.11,
      bevelThickness: 0.11,
    });
    sharedBlookBodyGeo.center();
  }
  return sharedBlookBodyGeo;
}

function getFootGeo(): THREE.CapsuleGeometry {
  if (!sharedFootGeo) {
    sharedFootGeo = new THREE.CapsuleGeometry(0.11, 0.12, 4, 8);
    sharedFootGeo.rotateX(Math.PI / 2);
  }
  return sharedFootGeo;
}

function getEyeWhiteGeo(): THREE.SphereGeometry {
  if (!sharedEyeWhiteGeo) {
    sharedEyeWhiteGeo = new THREE.SphereGeometry(0.11, 14, 14);
  }
  return sharedEyeWhiteGeo;
}

function getEyePupilGeo(): THREE.SphereGeometry {
  if (!sharedEyePupilGeo) {
    sharedEyePupilGeo = new THREE.SphereGeometry(0.062, 12, 12);
  }
  return sharedEyePupilGeo;
}

export interface BlookRig {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  shadowMesh: THREE.Mesh;
  ringMesh: THREE.Mesh;
  wingLeft?: THREE.Object3D;
  wingRight?: THREE.Object3D;
  nameSprite?: THREE.Sprite;
  dispose: () => void;
}

/**
 * Builds a composite 6–10 part procedural 3D Blook character
 * pivoted at bottom-center (y = 0) with varied roughness/metalness and contact shadow.
 */
export function createBlookRig(
  avatarId: BlookAvatarId,
  options: { name?: string; isLocal?: boolean; castShadow?: boolean } = {},
): BlookRig {
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  bodyPivot.position.y = 0;
  root.add(bodyPivot);

  const localDisposables: Array<{ dispose: () => void }> = [];

  // Ground contact shadow plane
  const shadowMat = new THREE.MeshBasicMaterial({
    map: getSharedShadowTex(),
    transparent: true,
    depthWrite: false,
    opacity: 0.52,
  });
  const shadowGeo = new THREE.PlaneGeometry(1.55, 1.55);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.position.y = 0.02;
  root.add(shadowMesh);
  localDisposables.push(shadowMat, shadowGeo);

  // Selection/Answered ground ring around feet
  const ringGeo = new THREE.RingGeometry(0.58, 0.72, 28);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: options.isLocal ? 0x38bdf8 : 0x64748b,
    transparent: true,
    opacity: options.isLocal ? 0.85 : 0.25,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  ringMesh.position.y = 0.03;
  root.add(ringMesh);
  localDisposables.push(ringGeo, ringMat);

  // Palette per Blook (varied roughness/metalness across adjacent parts)
  const palettes: Record<
    BlookAvatarId,
    { body: number; belly: number; dark: number; accent: number; metalAccent?: boolean }
  > = {
    fox: { body: 0xf97316, belly: 0xfff7ed, dark: 0x1e293b, accent: 0xfdba74 },
    panda: { body: 0xf8fafc, belly: 0x1e293b, dark: 0x0f172a, accent: 0x334155 },
    frog: { body: 0x22c55e, belly: 0xd9f99d, dark: 0x14532d, accent: 0xf472b6 },
    lion: { body: 0xfacc15, belly: 0xfef08a, dark: 0x451a03, accent: 0xb45309 },
    unicorn: { body: 0xf472b6, belly: 0xfdf2f8, dark: 0x312e81, accent: 0x38bdf8, metalAccent: true },
    octopus: { body: 0x8b5cf6, belly: 0xc4b5fd, dark: 0x2e1065, accent: 0xf472b6 },
    bee: { body: 0xfacc15, belly: 0x1e293b, dark: 0x0f172a, accent: 0xe0f2fe },
    robot: { body: 0x06b6d4, belly: 0x334155, dark: 0x0f172a, accent: 0xf59e0b, metalAccent: true },
  };

  const pal = palettes[avatarId] || palettes.fox;

  // Materials with >= 0.25 roughness differentiation
  const bodyMat = new THREE.MeshStandardMaterial({
    color: pal.body,
    roughness: avatarId === 'robot' ? 0.28 : 0.68,
    metalness: avatarId === 'robot' ? 0.65 : 0.05,
  });
  const bellyMat = new THREE.MeshStandardMaterial({
    color: pal.belly,
    roughness: 0.78,
    metalness: 0.02,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: pal.accent,
    roughness: pal.metalAccent ? 0.2 : 0.42,
    metalness: pal.metalAccent ? 0.85 : 0.1,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: pal.dark,
    roughness: 0.35,
    metalness: 0.12,
  });
  const scleraMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.15,
    metalness: 0.0,
  });
  const pupilMat = new THREE.MeshStandardMaterial({
    color: 0x090d16,
    roughness: 0.08,
    metalness: 0.15,
  });
  localDisposables.push(bodyMat, bellyMat, accentMat, darkMat, scleraMat, pupilMat);

  const castShadow = Boolean(options.castShadow);

  // 1. Primary silhouette: Rounded beveled Blook cube body (centered at y = 0.64)
  const torso = new THREE.Mesh(getSharedBodyGeometry(), bodyMat);
  torso.position.y = 0.64;
  torso.castShadow = castShadow;
  torso.receiveShadow = true;
  bodyPivot.add(torso);

  // 2 & 3. Feet (bottom flush at y = 0)
  const footL = new THREE.Mesh(getFootGeo(), darkMat);
  footL.position.set(-0.24, 0.11, 0.14);
  footL.castShadow = castShadow;
  const footR = new THREE.Mesh(getFootGeo(), darkMat);
  footR.position.set(0.24, 0.11, 0.14);
  footR.castShadow = castShadow;
  bodyPivot.add(footL, footR);

  // 4. Front Belly Patch / Plate
  const bellyGeo = new THREE.BoxGeometry(0.56, 0.42, 0.08);
  const belly = new THREE.Mesh(bellyGeo, bellyMat);
  belly.position.set(0, 0.48, 0.45);
  bodyPivot.add(belly);
  localDisposables.push(bellyGeo);

  // 5 & 6. Expressive Eyes (Sclera + Glossy Pupil)
  const eyeOffsetY = avatarId === 'frog' ? 1.12 : 0.78;
  const eyeOffsetZ = avatarId === 'frog' ? 0.3 : 0.47;
  const eyeSpread = avatarId === 'frog' ? 0.28 : 0.21;

  [-1, 1].forEach((side) => {
    const sclera = new THREE.Mesh(getEyeWhiteGeo(), scleraMat);
    sclera.position.set(side * eyeSpread, eyeOffsetY, eyeOffsetZ);
    const pupil = new THREE.Mesh(getEyePupilGeo(), pupilMat);
    pupil.position.set(side * eyeSpread, eyeOffsetY, eyeOffsetZ + 0.07);
    bodyPivot.add(sclera, pupil);
  });

  let wingLeft: THREE.Object3D | undefined;
  let wingRight: THREE.Object3D | undefined;

  // 7–10. Species-specific Secondary Silhouette & Accent Details
  if (avatarId === 'fox') {
    const earGeo = new THREE.ConeGeometry(0.18, 0.36, 4);
    const innerEarGeo = new THREE.ConeGeometry(0.09, 0.22, 4);
    const snoutGeo = new THREE.BoxGeometry(0.32, 0.2, 0.22);
    const noseGeo = new THREE.SphereGeometry(0.06, 10, 10);
    const tailGeo = new THREE.CapsuleGeometry(0.14, 0.34, 4, 8);
    localDisposables.push(earGeo, innerEarGeo, snoutGeo, noseGeo, tailGeo);

    [-1, 1].forEach((s) => {
      const ear = new THREE.Mesh(earGeo, bodyMat);
      ear.position.set(s * 0.32, 1.24, -0.04);
      ear.rotation.z = -s * 0.18;
      ear.castShadow = castShadow;
      const inner = new THREE.Mesh(innerEarGeo, bellyMat);
      inner.position.set(s * 0.32, 1.22, 0.03);
      inner.rotation.z = -s * 0.18;
      bodyPivot.add(ear, inner);
    });
    const snout = new THREE.Mesh(snoutGeo, bellyMat);
    snout.position.set(0, 0.58, 0.53);
    const nose = new THREE.Mesh(noseGeo, darkMat);
    nose.position.set(0, 0.64, 0.65);
    const tail = new THREE.Mesh(tailGeo, accentMat);
    tail.position.set(0, 0.45, -0.58);
    tail.rotation.x = Math.PI / 3;
    bodyPivot.add(snout, nose, tail);
  } else if (avatarId === 'panda') {
    const earGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.1, 14);
    earGeo.rotateX(Math.PI / 2);
    const patchGeo = new THREE.BoxGeometry(0.22, 0.2, 0.06);
    const noseGeo = new THREE.SphereGeometry(0.06, 10, 10);
    localDisposables.push(earGeo, patchGeo, noseGeo);

    [-1, 1].forEach((s) => {
      const ear = new THREE.Mesh(earGeo, darkMat);
      ear.position.set(s * 0.38, 1.14, 0);
      ear.castShadow = castShadow;
      const patch = new THREE.Mesh(patchGeo, darkMat);
      patch.position.set(s * 0.21, 0.78, 0.44);
      patch.rotation.z = s * 0.16;
      bodyPivot.add(ear, patch);
    });
    const nose = new THREE.Mesh(noseGeo, darkMat);
    nose.position.set(0, 0.63, 0.51);
    bodyPivot.add(nose);
  } else if (avatarId === 'frog') {
    const domeGeo = new THREE.SphereGeometry(0.17, 14, 14);
    const cheekGeo = new THREE.SphereGeometry(0.08, 10, 10);
    const crownGeo = new THREE.CylinderGeometry(0.14, 0.18, 0.12, 6);
    localDisposables.push(domeGeo, cheekGeo, crownGeo);

    [-1, 1].forEach((s) => {
      const dome = new THREE.Mesh(domeGeo, bodyMat);
      dome.position.set(s * 0.28, 1.12, 0.22);
      const cheek = new THREE.Mesh(cheekGeo, accentMat);
      cheek.position.set(s * 0.34, 0.66, 0.46);
      bodyPivot.add(dome, cheek);
    });
    const crown = new THREE.Mesh(crownGeo, bellyMat);
    crown.position.set(0, 1.18, -0.05);
    bodyPivot.add(crown);
  } else if (avatarId === 'lion') {
    const maneRingGeo = new THREE.TorusGeometry(0.52, 0.16, 10, 18);
    const earGeo = new THREE.SphereGeometry(0.12, 12, 12);
    const snoutGeo = new THREE.BoxGeometry(0.3, 0.18, 0.16);
    const tailGeo = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.36, -0.46),
        new THREE.Vector3(0.16, 0.52, -0.68),
        new THREE.Vector3(0.24, 0.74, -0.62),
      ]),
      10,
      0.045,
      6,
      false,
    );
    localDisposables.push(maneRingGeo, earGeo, snoutGeo, tailGeo);

    const mane = new THREE.Mesh(maneRingGeo, accentMat);
    mane.position.set(0, 0.68, 0.08);
    mane.castShadow = castShadow;
    [-1, 1].forEach((s) => {
      const ear = new THREE.Mesh(earGeo, bodyMat);
      ear.position.set(s * 0.36, 1.14, 0.08);
      bodyPivot.add(ear);
    });
    const snout = new THREE.Mesh(snoutGeo, bellyMat);
    snout.position.set(0, 0.58, 0.52);
    const tail = new THREE.Mesh(tailGeo, accentMat);
    bodyPivot.add(mane, snout, tail);
  } else if (avatarId === 'unicorn') {
    const hornGeo = new THREE.ConeGeometry(0.11, 0.44, 12);
    const earGeo = new THREE.ConeGeometry(0.11, 0.24, 8);
    const maneGeo = new THREE.BoxGeometry(0.16, 0.56, 0.24);
    const wingGeo = new THREE.BoxGeometry(0.32, 0.18, 0.08);
    localDisposables.push(hornGeo, earGeo, maneGeo, wingGeo);

    const horn = new THREE.Mesh(hornGeo, accentMat);
    horn.position.set(0, 1.32, 0.2);
    horn.rotation.x = 0.22;
    horn.castShadow = castShadow;
    [-1, 1].forEach((s) => {
      const ear = new THREE.Mesh(earGeo, bellyMat);
      ear.position.set(s * 0.3, 1.18, 0.02);
      ear.rotation.z = -s * 0.25;
      bodyPivot.add(ear);
    });
    const mane = new THREE.Mesh(maneGeo, accentMat);
    mane.position.set(0, 0.95, -0.34);
    wingLeft = new THREE.Mesh(wingGeo, bellyMat);
    wingLeft.position.set(-0.56, 0.7, -0.08);
    wingRight = new THREE.Mesh(wingGeo, bellyMat);
    wingRight.position.set(0.56, 0.7, -0.08);
    bodyPivot.add(horn, mane, wingLeft, wingRight);
  } else if (avatarId === 'octopus') {
    const tentacleGeo = new THREE.CapsuleGeometry(0.09, 0.22, 4, 8);
    const spotGeo = new THREE.SphereGeometry(0.1, 10, 10);
    const browGeo = new THREE.BoxGeometry(0.42, 0.08, 0.1);
    localDisposables.push(tentacleGeo, spotGeo, browGeo);

    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const tentacle = new THREE.Mesh(tentacleGeo, bodyMat);
      tentacle.position.set(Math.cos(angle) * 0.44, 0.24, Math.sin(angle) * 0.44);
      tentacle.rotation.z = Math.cos(angle) * 0.35;
      tentacle.rotation.x = -Math.sin(angle) * 0.35;
      bodyPivot.add(tentacle);
    }
    const spot = new THREE.Mesh(spotGeo, accentMat);
    spot.position.set(0.28, 1.02, -0.18);
    const brow = new THREE.Mesh(browGeo, darkMat);
    brow.position.set(0, 0.95, 0.48);
    bodyPivot.add(spot, brow);
  } else if (avatarId === 'bee') {
    const stripeGeo = new THREE.BoxGeometry(1.06, 0.14, 0.98);
    const wingGeo = new THREE.SphereGeometry(0.24, 12, 10);
    wingGeo.scale(1.2, 0.22, 0.85);
    const antGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.24, 6);
    const tipGeo = new THREE.SphereGeometry(0.06, 8, 8);
    localDisposables.push(stripeGeo, wingGeo, antGeo, tipGeo);

    const stripe1 = new THREE.Mesh(stripeGeo, darkMat);
    stripe1.position.set(0, 0.56, 0);
    const stripe2 = new THREE.Mesh(stripeGeo, darkMat);
    stripe2.position.set(0, 0.82, 0);
    bodyPivot.add(stripe1, stripe2);

    wingLeft = new THREE.Mesh(wingGeo, accentMat);
    wingLeft.position.set(-0.56, 0.96, -0.15);
    wingRight = new THREE.Mesh(wingGeo, accentMat);
    wingRight.position.set(0.56, 0.96, -0.15);
    bodyPivot.add(wingLeft, wingRight);

    [-1, 1].forEach((s) => {
      const ant = new THREE.Mesh(antGeo, darkMat);
      ant.position.set(s * 0.18, 1.24, 0.15);
      ant.rotation.z = -s * 0.25;
      const tip = new THREE.Mesh(tipGeo, darkMat);
      tip.position.set(s * 0.22, 1.36, 0.15);
      bodyPivot.add(ant, tip);
    });
  } else if (avatarId === 'robot') {
    const visorGeo = new THREE.BoxGeometry(0.76, 0.26, 0.12);
    const earBoltGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.14, 12);
    earBoltGeo.rotateZ(Math.PI / 2);
    const antRodGeo = new THREE.CylinderGeometry(0.035, 0.045, 0.32, 8);
    const beaconGeo = new THREE.SphereGeometry(0.09, 12, 12);
    localDisposables.push(visorGeo, earBoltGeo, antRodGeo, beaconGeo);

    const visor = new THREE.Mesh(visorGeo, darkMat);
    visor.position.set(0, 0.78, 0.46);
    [-1, 1].forEach((s) => {
      const bolt = new THREE.Mesh(earBoltGeo, accentMat);
      bolt.position.set(s * 0.54, 0.72, 0);
      bodyPivot.add(bolt);
    });
    const rod = new THREE.Mesh(antRodGeo, bellyMat);
    rod.position.set(0, 1.28, 0);
    const beacon = new THREE.Mesh(beaconGeo, accentMat);
    beacon.position.set(0, 1.46, 0);
    bodyPivot.add(visor, rod, beacon);
  }

  let nameSprite: THREE.Sprite | undefined;
  if (options.name) {
    nameSprite = createNameTagSprite(options.name, options.isLocal ? '#38bdf8' : '#e2e8f0');
    root.add(nameSprite);
  }

  return {
    root,
    bodyPivot,
    shadowMesh,
    ringMesh,
    wingLeft,
    wingRight,
    nameSprite,
    dispose: () => {
      localDisposables.forEach((d) => d.dispose());
      if (nameSprite) {
        const mat = nameSprite.material as THREE.SpriteMaterial;
        mat.map?.dispose();
        mat.dispose();
      }
    },
  };
}
