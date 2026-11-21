import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  Grid2x2,
  Heart,
  Home,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Settings,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  BLOOK_AVATARS,
  TEAM_DEFS,
  type TeamId,
  type TeamZombieGameEntry,
  type ZombieBreachEvent,
  type ZombieShotEvent,
  type ZombieWrongEvent,
} from '../shared/types.ts';
import { formatLogicPromptLines } from '../shared/logicPuzzles.ts';
import { ZombieArenaScene } from '../three/ZombieArenaScene.ts';

export interface MonitorCombatHandlers {
  onShot: (shot: ZombieShotEvent) => void;
  onWrong: (wrong: ZombieWrongEvent) => void;
  onBreach: (breach: ZombieBreachEvent) => void;
}

interface ZombieTeamMonitorViewProps {
  pin: string;
  teams: TeamZombieGameEntry[];
  muted: boolean;
  onToggleMute: () => void;
  onPauseToggle: (paused: boolean) => void;
  onRestart: () => void;
  onBackToLobby: () => void;
  onExit: () => void;
  registerCombatHandlers: (handlers: MonitorCombatHandlers | null) => void;
}

export function ZombieTeamMonitorView({
  pin,
  teams,
  muted,
  onToggleMute,
  onPauseToggle,
  onRestart,
  onBackToLobby,
  onExit,
  registerCombatHandlers,
}: ZombieTeamMonitorViewProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const slotRefs = useRef<Map<TeamId, HTMLDivElement>>(new Map());

  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const envTexRef = useRef<THREE.Texture | null>(null);
  const isSoftwareGlRef = useRef(false);
  const scenesRef = useRef<Map<TeamId, ZombieArenaScene>>(new Map());

  const [expandedTeam, setExpandedTeam] = useState<TeamId | null>(null);
  const expandedTeamRef = useRef<TeamId | null>(null);
  expandedTeamRef.current = expandedTeam;

  // If the expanded team disappears (e.g. players left), gracefully return to grid view
  useEffect(() => {
    if (expandedTeam && !teams.some((t) => t.teamId === expandedTeam)) {
      setExpandedTeam(null);
    }
  }, [expandedTeam, teams]);

  // Register direct socket combat event bridge (no React batching drops across 4 teams)
  useEffect(() => {
    registerCombatHandlers({
      onShot: (shot) => {
        if (!shot.teamId) return;
        scenesRef.current.get(shot.teamId)?.handleRemoteShot(shot);
      },
      onWrong: (wrong) => {
        if (!wrong.teamId) return;
        scenesRef.current.get(wrong.teamId)?.handleRemoteWrong(wrong);
      },
      onBreach: (breach) => {
        if (!breach.teamId) return;
        scenesRef.current.get(breach.teamId)?.handleRemoteBreach(breach);
      },
    });
    return () => registerCombatHandlers(null);
  }, [registerCombatHandlers]);

  // Initialize shared WebGLRenderer + RoomEnvironment + unified render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;

    const isSoftwareGl = ZombieArenaScene.detectSoftwareGl();
    isSoftwareGlRef.current = isSoftwareGl;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.autoClear = false;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(
      Math.max(1, stage.clientWidth),
      Math.max(1, stage.clientHeight),
      false,
    );
    rendererRef.current = renderer;

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    envTexRef.current = envTex;
    pmremGenerator.dispose();

    const syncCanvasSize = () => {
      const w = Math.max(1, stage.clientWidth);
      const h = Math.max(1, stage.clientHeight);
      renderer.setSize(w, h, false);
    };

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncCanvasSize) : null;
    resizeObserver?.observe(stage);
    window.addEventListener('resize', syncCanvasSize);

    let disposed = false;
    let frameId = 0;
    const clock = new THREE.Clock();

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const tick = () => {
      if (disposed) return;
      const rawDt = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.getElapsedTime();

      for (const sceneInst of scenesRef.current.values()) {
        sceneInst.stepManaged(rawDt, elapsed);
      }

      const canvasRect = canvas.getBoundingClientRect();
      const cw = canvasRect.width;
      const ch = canvasRect.height;

      if (cw > 0 && ch > 0) {
        renderer.setScissorTest(false);
        renderer.setClearColor(0x060b16, 1);
        renderer.clear(true, true, true);

        const activeExpanded = expandedTeamRef.current;

        for (const [teamId, sceneInst] of scenesRef.current.entries()) {
          if (activeExpanded && activeExpanded !== teamId) continue;
          const slotEl = slotRefs.current.get(teamId);
          if (!slotEl) continue;

          const rect = slotEl.getBoundingClientRect();
          const left = Math.max(0, Math.round(rect.left - canvasRect.left));
          const top = Math.max(0, Math.round(rect.top - canvasRect.top));
          const width = Math.min(cw - left, Math.round(rect.width));
          const height = Math.min(ch - top, Math.round(rect.height));
          if (width <= 1 || height <= 1) continue;

          const bottomY = Math.max(0, Math.round(ch - (top + height)));
          sceneInst.setViewportSize(width, height);
          renderer.setViewport(left, bottomY, width, height);
          renderer.setScissor(left, bottomY, width, height);
          renderer.setScissorTest(true);
          renderer.clearDepth();
          renderer.render(sceneInst.getScene(), sceneInst.getCamera());
        }
        renderer.setScissorTest(false);
      }

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    if (isSoftwareGl) {
      afterDraw(tick);
    } else {
      frameId = requestAnimationFrame(tick);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', syncCanvasSize);

      for (const sceneInst of scenesRef.current.values()) {
        sceneInst.dispose();
      }
      scenesRef.current.clear();

      envTex.dispose();
      envTexRef.current = null;
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  // Reconcile active ZombieArenaScene instances with current teams & sync server state
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    const activeTeamIds = new Set(teams.map((t) => t.teamId));

    for (const [teamId, sceneInst] of Array.from(scenesRef.current.entries())) {
      if (!activeTeamIds.has(teamId)) {
        sceneInst.dispose();
        scenesRef.current.delete(teamId);
      }
    }

    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    for (const entry of teams) {
      let sceneInst = scenesRef.current.get(entry.teamId);
      if (!sceneInst) {
        sceneInst = new ZombieArenaScene(null, 'robot', () => {}, {
          multiplayer: true,
          localDefenderId: `monitor-${entry.teamId}`,
          initialSnapshot: entry.snapshot,
          splitScreen: true,
          externalManaged: {
            isSoftwareGl: isSoftwareGlRef.current,
            envMap: envTexRef.current,
            maxAnisotropy: maxAniso,
            silentAudio: true,
          },
        });
        scenesRef.current.set(entry.teamId, sceneInst);
      } else {
        sceneInst.syncMultiplayerState(entry.snapshot);
      }
    }
  }, [teams]);

  // Only allow combat audio for an individually inspected (expanded) team when not muted
  useEffect(() => {
    for (const [teamId, sceneInst] of scenesRef.current.entries()) {
      const shouldPlayAudio = !muted && expandedTeam === teamId;
      sceneInst.setSilentAudio(!shouldPlayAudio);
    }
  }, [expandedTeam, muted, teams]);

  const anyPaused = useMemo(
    () => teams.some((t) => !t.snapshot.gameOver && t.snapshot.paused),
    [teams],
  );
  const allGameOver = useMemo(
    () => teams.length > 0 && teams.every((t) => t.snapshot.gameOver),
    [teams],
  );

  const expandedEntry = useMemo(
    () => (expandedTeam ? teams.find((t) => t.teamId === expandedTeam) || null : null),
    [expandedTeam, teams],
  );

  // Determine grid classes: 1 -> 1x1, 2 -> 2 screens, 3 or 4 -> 2x2 grid
  const gridClass =
    expandedTeam !== null
      ? 'grid-cols-1 grid-rows-1'
      : teams.length <= 1
        ? 'grid-cols-1 grid-rows-1'
        : teams.length === 2
          ? 'grid-cols-1 md:grid-cols-2 grid-rows-2 md:grid-rows-1'
          : 'grid-cols-2 grid-rows-2';

  const placeholderTeamDefs = useMemo(() => {
    if (expandedTeam !== null || teams.length !== 3) return [];
    const present = new Set(teams.map((t) => t.teamId));
    return TEAM_DEFS.filter((d) => !present.has(d.id)).slice(0, 1);
  }, [expandedTeam, teams]);

  const bindSlotRef = (teamId: TeamId) => (el: HTMLDivElement | null) => {
    if (el) {
      slotRefs.current.set(teamId, el);
    } else {
      slotRefs.current.delete(teamId);
    }
  };

  return (
    <div className="relative w-full h-dvh flex flex-col overflow-hidden select-none bg-[#060b16]">
      {/* Top Controller Header Bar */}
      <header className="shrink-0 z-20 border-b border-slate-800 bg-slate-950/95 px-2.5 py-2 sm:px-4 sm:py-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5">
            <span className="px-2 py-0.5 rounded-md bg-cyan-400 text-slate-950 text-[11px] font-black">
              ผู้คุม (Monitor)
            </span>
            <span className="text-xs font-bold text-slate-300 font-mono-tabular">
              PIN <span className="text-amber-400 font-black">{pin}</span>
            </span>
          </div>

          {/* Team Quick Tabs / Return to Multi-View */}
          <div className="flex flex-wrap items-center gap-1">
            {expandedTeam !== null && (
              <button
                type="button"
                onClick={() => setExpandedTeam(null)}
                className="px-2.5 py-1 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-[11px] font-black flex items-center gap-1 cursor-pointer"
              >
                <Grid2x2 className="w-3.5 h-3.5" />
                ดูทุกจอ ({teams.length})
              </button>
            )}
            {teams.map((entry) => {
              const def = TEAM_DEFS.find((d) => d.id === entry.teamId)!;
              const isInspecting = expandedTeam === entry.teamId;
              return (
                <button
                  key={entry.teamId}
                  type="button"
                  onClick={() => setExpandedTeam(isInspecting ? null : entry.teamId)}
                  className={`px-2 py-1 rounded-lg border text-[11px] font-extrabold flex items-center gap-1.5 cursor-pointer transition-colors ${
                    isInspecting
                      ? `${def.borderClass} ${def.bgClass} text-white`
                      : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <span className={`px-1.5 py-0.2 rounded text-[10px] font-black ${def.badgeClass}`}>
                    {def.shortLabel}
                  </span>
                  <span className="font-mono-tabular text-amber-300">
                    {entry.snapshot.teamScore.toLocaleString()}
                  </span>
                  <span
                    className={`font-mono-tabular text-[10px] ${
                      entry.snapshot.gameOver
                        ? 'text-rose-400'
                        : entry.snapshot.hp <= 30
                          ? 'text-rose-300'
                          : 'text-emerald-300'
                    }`}
                  >
                    {entry.snapshot.gameOver ? 'พัง' : `${entry.snapshot.hp}HP`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Host Action Buttons */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {!allGameOver && (
            <button
              type="button"
              onClick={() => onPauseToggle(!anyPaused)}
              className="px-2.5 py-1.5 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-100 text-xs font-bold flex items-center gap-1 cursor-pointer"
              title={anyPaused ? 'เล่นต่อทุกทีม' : 'พักทุกทีมชั่วคราว'}
            >
              {anyPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{anyPaused ? 'เล่นต่อ' : 'พักเกม'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onRestart}
            className="px-2.5 py-1.5 rounded-xl border border-emerald-500/40 bg-emerald-950/70 hover:bg-emerald-900 text-emerald-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
            title="เริ่มแมตช์ใหม่ทุกทีม"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">เริ่มใหม่</span>
          </button>

          <button
            type="button"
            onClick={onBackToLobby}
            className="px-2.5 py-1.5 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>ห้องรอ</span>
          </button>

          <button
            type="button"
            onClick={onToggleMute}
            className="p-1.5 sm:p-2 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 cursor-pointer"
            title={muted ? 'เปิดเสียง (เมื่อกดขยายทีม)' : 'ปิดเสียง'}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={onExit}
            className="px-2.5 py-1.5 rounded-xl border border-rose-500/40 bg-rose-950/80 hover:bg-rose-900 text-rose-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
          >
            <Home className="w-3.5 h-3.5" />
            <span>ปิดห้อง</span>
          </button>
        </div>
      </header>

      {/* Shared Multi-Viewport Three.js Canvas Stage */}
      <div ref={stageRef} className="relative flex-1 min-h-0 w-full overflow-hidden">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />

        {teams.length === 0 ? (
          <div className="relative z-10 h-full flex items-center justify-center p-4">
            <div className="rounded-2xl border border-slate-700 bg-slate-900/90 px-6 py-5 text-center space-y-2 max-w-md">
              <div className="text-base font-bold text-white">ยังไม่มีทีมที่มีผู้เล่นเข้าแข่งขัน</div>
              <p className="text-xs text-slate-300">
                รอผู้เล่นสแกน QR เข้าห้องและเลือกทีม A / B / C / D เมื่อมีผู้เล่นเข้าทีม จอทีมนั้นจะแสดงผลที่นี่ทันที
              </p>
            </div>
          </div>
        ) : (
          <div className={`relative z-10 w-full h-full grid gap-2 p-2 ${gridClass}`}>
            {teams
              .filter((t) => expandedTeam === null || t.teamId === expandedTeam)
              .map((entry) => {
                const def = TEAM_DEFS.find((d) => d.id === entry.teamId)!;
                const snap = entry.snapshot;
                const hpPct = Math.max(0, Math.min(100, (snap.hp / snap.maxHp) * 100));
                const isExpanded = expandedTeam === entry.teamId;
                const frontZombie = [...snap.zombies].sort((a, b) => a.x - b.x)[0];

                return (
                  <div
                    key={entry.teamId}
                    ref={bindSlotRef(entry.teamId)}
                    className={`relative rounded-xl border-2 overflow-hidden bg-transparent flex flex-col justify-between ${def.borderClass}`}
                  >
                    {/* Top-Left Expand Button (ปุ่มขยาย ตามแบบร่าง) + Compact Team Stats */}
                    <div className="p-2 flex flex-wrap items-start justify-between gap-1.5 pointer-events-auto">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setExpandedTeam(isExpanded ? null : entry.teamId)}
                          className="px-2 py-1 rounded-lg border border-cyan-400/80 bg-slate-950/90 hover:bg-cyan-400 hover:text-slate-950 text-cyan-200 text-[11px] font-black flex items-center gap-1 shadow-lg cursor-pointer transition-colors"
                          title={isExpanded ? 'ย่อกลับไปดูทุกจอ' : `ขยายตรวจดู ${def.label}`}
                        >
                          {isExpanded ? (
                            <>
                              <Minimize2 className="w-3.5 h-3.5" />
                              <span>ย่อกลับทุกจอ</span>
                            </>
                          ) : (
                            <>
                              <Maximize2 className="w-3.5 h-3.5" />
                              <span>ขยาย</span>
                            </>
                          )}
                        </button>

                        <div
                          className="rounded-lg border border-slate-700/90 px-2 py-1 flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-100 shadow-lg"
                          style={{ backgroundColor: 'rgba(15, 23, 42, 0.88)' }}
                        >
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${def.badgeClass}`}>
                            {def.label}
                          </span>
                          <span className="flex items-center gap-1 text-slate-300">
                            <Users className="w-3 h-3 text-cyan-400" />
                            {entry.memberCount}
                          </span>
                          <span className="flex items-center gap-1 font-mono-tabular">
                            <Heart className="w-3 h-3 text-rose-400 fill-current" />
                            <span
                              className={
                                snap.hp > 50
                                  ? 'text-emerald-300'
                                  : snap.hp > 25
                                    ? 'text-amber-300'
                                    : 'text-rose-400'
                              }
                            >
                              {snap.hp}
                            </span>
                            <span className="hidden sm:inline-block w-12 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                              <span
                                className={`block h-full ${
                                  hpPct > 50
                                    ? 'bg-emerald-400'
                                    : hpPct > 25
                                      ? 'bg-amber-400'
                                      : 'bg-rose-500'
                                }`}
                                style={{ width: `${hpPct}%` }}
                              />
                            </span>
                          </span>
                          <span className="text-cyan-300 font-mono-tabular">W{snap.wave}</span>
                          <span className="text-amber-300 font-mono-tabular">
                            {snap.teamScore.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {!isExpanded && frontZombie && !snap.gameOver && (
                        <div
                          className="hidden sm:block rounded-lg border border-slate-700/80 px-2 py-1 text-[10px] font-bold text-slate-200 max-w-[200px] truncate"
                          style={{ backgroundColor: 'rgba(15, 23, 42, 0.85)' }}
                        >
                          {frontZombie.isBoss ? '👹 BOSS: ' : '🧟 '}
                          {formatLogicPromptLines(frontZombie.puzzle.prompt).slice(-1)[0]}
                        </div>
                      )}
                    </div>

                    {/* Center Overlay when Team Base is Breached / Paused */}
                    {(snap.gameOver || snap.paused) && (
                      <div className="mx-auto my-auto pointer-events-none px-3">
                        <div
                          className="rounded-xl border border-rose-500/70 px-3.5 py-2 text-center shadow-xl"
                          style={{ backgroundColor: 'rgba(15, 23, 42, 0.88)' }}
                        >
                          <div className="text-xs sm:text-sm font-black text-white">
                            {snap.gameOver
                              ? `ฐาน${def.label}ถูกซอมบี้บุกแล้ว!`
                              : `${def.label} พักเกมชั่วคราว`}
                          </div>
                          <div className="text-[11px] text-amber-300 font-bold">
                            คะแนนรวม {snap.teamScore.toLocaleString()} · กำจัด {snap.kills} ตัว · Wave {snap.wave}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Bottom Compact Team Strip inside Cell */}
                    {!isExpanded && (
                      <div className="p-1.5 flex items-center justify-between gap-1.5 pointer-events-none">
                        <div className="flex flex-nowrap items-center gap-1 overflow-x-auto custom-scroll">
                          {snap.defenders.map((d) => {
                            const av = BLOOK_AVATARS.find((a) => a.id === d.avatar);
                            return (
                              <span
                                key={d.id}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-slate-700/80 text-[10px] font-bold text-slate-100 shrink-0"
                                style={{ backgroundColor: 'rgba(15, 23, 42, 0.88)' }}
                              >
                                <span>{av?.emoji || '🦊'}</span>
                                <span className="max-w-[64px] truncate">{d.name}</span>
                                <span className="text-amber-300 font-mono-tabular">{d.score}</span>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

            {/* When 3 teams are active, fill the 4th grid cell cleanly */}
            {placeholderTeamDefs.map((emptyTeam) => (
              <div
                key={emptyTeam.id}
                className="rounded-xl border border-dashed border-slate-700/80 bg-slate-950/75 flex flex-col items-center justify-center gap-1.5 p-4 text-center"
              >
                <span className={`px-2.5 py-0.5 rounded-md text-xs font-black ${emptyTeam.badgeClass}`}>
                  {emptyTeam.label}
                </span>
                <div className="text-xs font-bold text-slate-400">ยังไม่มีผู้เล่นในทีมนี้</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Expanded Single-Team Inspection Drawer */}
      {expandedEntry && (
        <section className="shrink-0 z-20 border-t border-slate-800 bg-slate-950/95 px-3 py-2.5 sm:px-5 sm:py-3 max-h-[28dvh] overflow-y-auto custom-scroll">
          <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Team Members Breakdown */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-2.5 space-y-1.5">
              <div className="text-xs font-bold text-slate-300 flex items-center justify-between">
                <span>สมาชิกใน{TEAM_DEFS.find((d) => d.id === expandedEntry.teamId)?.label}</span>
                <span className="text-amber-400 font-mono-tabular">
                  รวม {expandedEntry.snapshot.teamScore.toLocaleString()} คะแนน · {expandedEntry.snapshot.kills} ตัว
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {expandedEntry.snapshot.defenders.map((d) => {
                  const av = BLOOK_AVATARS.find((a) => a.id === d.avatar);
                  return (
                    <div
                      key={d.id}
                      className="px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-950/90 text-[11px] font-bold text-white flex items-center gap-1.5"
                    >
                      <span>{av?.emoji || '🦊'}</span>
                      <span>{d.name}</span>
                      <span className="text-amber-400 font-mono-tabular">{d.score}</span>
                      <span className="text-slate-400">({d.kills} ตัว)</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Active Zombies & Current Questions in this Team */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-2.5 space-y-1.5">
              <div className="text-xs font-bold text-slate-300">
                ซอมบี้ที่กำลังบุกทีมนี้ ({expandedEntry.snapshot.zombies.length} ตัว)
              </div>
              {expandedEntry.snapshot.zombies.length === 0 ? (
                <div className="text-[11px] text-slate-400">กำลังรอซอมบี้ตัวถัดไป...</div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {[...expandedEntry.snapshot.zombies]
                    .sort((a, b) => a.x - b.x)
                    .map((z, idx) => (
                      <div
                        key={z.id}
                        className={`px-2 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1.5 ${
                          z.isBoss
                            ? 'border-rose-500 bg-rose-950/70 text-amber-200'
                            : 'border-slate-700 bg-slate-950/90 text-slate-200'
                        }`}
                      >
                        <span className="text-cyan-400">
                          {z.isBoss ? '👹 BOSS' : `#${idx + 1}`}
                        </span>
                        <span className="max-w-[210px] truncate">
                          {formatLogicPromptLines(z.puzzle.prompt).join(' · ')}
                        </span>
                        <span className="text-emerald-300 font-mono-tabular">
                          = {z.puzzle.displayAnswer}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
