import * as THREE from 'three';

export function createArenaFloorTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Rich slate-teal stone courtyard pattern
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, size, size);

  const tiles = 8;
  const tileSize = size / tiles;
  for (let y = 0; y < tiles; y++) {
    for (let x = 0; x < tiles; x++) {
      const isAlt = (x + y) % 2 === 0;
      ctx.fillStyle = isAlt ? '#243447' : '#1b2838';
      ctx.fillRect(x * tileSize + 3, y * tileSize + 3, tileSize - 6, tileSize - 6);

      // Subtle inner highlight bevel
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x * tileSize + 5, y * tileSize + 5, tileSize - 10, tileSize - 10);
    }
  }

  // Subtle noise speckles for surface realism
  for (let i = 0; i < 1600; i++) {
    const px = Math.random() * size;
    const py = Math.random() * size;
    const alpha = Math.random() * 0.05;
    ctx.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;
    ctx.fillRect(px, py, 2, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createFloorRoughnessTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#b8b8b8';
  ctx.fillRect(0, 0, size, size);

  const tiles = 4;
  const tileSize = size / tiles;
  for (let y = 0; y < tiles; y++) {
    for (let x = 0; x < tiles; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#969696' : '#c8c8c8';
      ctx.fillRect(x * tileSize + 2, y * tileSize + 2, tileSize - 4, tileSize - 4);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  // Data map stays in linear space (NoColorSpace)
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createPadEmblemTexture(
  letter: string,
  hexColor: string,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, size, size);

  // Dark inner circle with colored rim
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.44, 0, Math.PI * 2);
  ctx.fillStyle = '#0f172a';
  ctx.fill();
  ctx.lineWidth = 14;
  ctx.strokeStyle = hexColor;
  ctx.stroke();

  // Inner dashed ring
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.35, 0, Math.PI * 2);
  ctx.setLineDash([16, 12]);
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.stroke();
  ctx.restore();

  // Bold letter
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 116px "Outfit", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, size / 2, size / 2 + 6);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.05,
    size / 2,
    size / 2,
    size * 0.48,
  );
  grad.addColorStop(0, 'rgba(2, 6, 23, 0.55)');
  grad.addColorStop(0.55, 'rgba(2, 6, 23, 0.25)');
  grad.addColorStop(1, 'rgba(2, 6, 23, 0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createNameTagSprite(name: string, accentHex = '#38bdf8'): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Rounded dark plate
  const r = 16;
  const w = 236;
  const h = 44;
  const x = 10;
  const y = 10;

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

  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = accentHex;
  ctx.stroke();

  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 22px "Noto Sans Thai", "Outfit", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const truncated = name.length > 14 ? name.slice(0, 13) + '…' : name;
  ctx.fillText(truncated, canvas.width / 2, canvas.height / 2 + 1);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;

  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.1, 0.52, 1);
  sprite.position.set(0, 2.05, 0);
  return sprite;
}
