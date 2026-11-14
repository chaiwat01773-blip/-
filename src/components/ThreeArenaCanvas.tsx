import { useEffect, useRef, useState } from 'react';
import type { GamePhase, PlayerPublicState } from '../shared/types.ts';
import { ArenaScene, type CameraPreset } from '../three/ArenaScene.ts';

interface ThreeArenaCanvasProps {
  inRoom: boolean;
  localPlayerId: string | null;
  phase: GamePhase;
  correctIndex: number | null;
  players: PlayerPublicState[];
  cameraPreset: CameraPreset;
  sceneRefOut: React.MutableRefObject<ArenaScene | null>;
  onLocalMove: (x: number, z: number, rotY: number, vy: number) => void;
  onPadSelect: (optionIndex: 0 | 1 | 2 | 3) => void;
}

export function ThreeArenaCanvas({
  inRoom,
  localPlayerId,
  phase,
  correctIndex,
  players,
  cameraPreset,
  sceneRefOut,
  onLocalMove,
  onPadSelect,
}: ThreeArenaCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [webglError, setWebglError] = useState(false);

  const callbacksRef = useRef({ onLocalMove, onPadSelect });
  callbacksRef.current = { onLocalMove, onPadSelect };

  // Mount WebGL canvas once in isolated container
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let arena: ArenaScene | null = null;
    try {
      arena = new ArenaScene(container, {
        onLocalMove: (x, z, rotY, vy) => callbacksRef.current.onLocalMove(x, z, rotY, vy),
        onPadSelect: (idx) => callbacksRef.current.onPadSelect(idx),
        onContextLost: () => setWebglError(true),
      });
      sceneRefOut.current = arena;
    } catch {
      setWebglError(true);
    }

    return () => {
      arena?.dispose();
      sceneRefOut.current = null;
    };
  }, [sceneRefOut]);

  // Sync game state into Three.js scene without re-mounting WebGL
  useEffect(() => {
    sceneRefOut.current?.syncRoomState({
      inRoom,
      localPlayerId,
      phase,
      correctIndex,
      players,
    });
  }, [inRoom, localPlayerId, phase, correctIndex, players, sceneRefOut]);

  useEffect(() => {
    sceneRefOut.current?.setCameraPreset(cameraPreset);
  }, [cameraPreset, sceneRefOut]);

  return (
    <div className="fixed inset-0 z-0 overflow-hidden bg-[#0b1628]">
      <div ref={mountRef} className="w-full h-full" />
      {webglError && (
        <div
          className="absolute inset-0 flex items-center justify-center p-6 text-center"
          style={{
            background:
              'radial-gradient(circle at 50% 35%, rgba(14,116,144,0.35), rgba(11,22,40,0.96))',
          }}
        >
          <div className="max-w-md rounded-2xl border border-slate-700 bg-slate-900/95 p-6 text-slate-100">
            <h2 className="font-display text-xl font-bold mb-2">โหมดแสดงผล 2 มิติสำรอง</h2>
            <p className="text-sm text-slate-300">
              เบราว์เซอร์ไม่รองรับ WebGL ชั่วคราว คุณยังสามารถเล่นตอบคำถามแบบ Real-time ได้ครบทุกฟีเจอร์
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
