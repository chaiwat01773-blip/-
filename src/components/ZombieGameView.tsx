import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Crosshair,
  Flame,
  Heart,
  Home,
  Pause,
  Play,
  RotateCcw,
  Settings,
  Sparkles,
  Users,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import {
  BLOOK_AVATARS,
  TEAM_DEFS,
  type BlookAvatarId,
  type TeamId,
  type ZombieBreachEvent,
  type ZombieGameSnapshot,
  type ZombieShotEvent,
  type ZombieWrongEvent,
} from '../shared/types.ts';
import { formatLogicPromptLines } from '../shared/logicPuzzles.ts';
import { ZombieArenaScene, type ZombieHudState } from '../three/ZombieArenaScene.ts';

export interface MultiplayerZombieConfig {
  pin: string;
  role: 'host' | 'player';
  localDefenderId: string;
  teamId?: TeamId;
  splitScreen?: boolean;
  zombieState: ZombieGameSnapshot | null;
  lastShot: ZombieShotEvent | null;
  lastWrong: ZombieWrongEvent | null;
  lastBreach: ZombieBreachEvent | null;
  onShoot: (targetZombieId: string | null, answer: string, explosive: boolean) => void;
  onPauseToggle: (paused: boolean) => void;
  onRestart: () => void;
  onBackToLobby: () => void;
}

interface ZombieGameViewProps {
  avatarId: BlookAvatarId;
  muted: boolean;
  onToggleMute: () => void;
  onExit: () => void;
  multiplayer?: MultiplayerZombieConfig;
}

const CHOICE_KEYS = ['1', '2', '3', '4'] as const;
const SPLIT_LETTERS = ['A', 'B', 'C', 'D'] as const;

export function ZombieGameView({
  avatarId,
  muted,
  onToggleMute,
  onExit,
  multiplayer,
}: ZombieGameViewProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<ZombieArenaScene | null>(null);

  const isMp = Boolean(multiplayer);
  const isSplit = Boolean(multiplayer?.splitScreen);
  const latestMpSnapshotRef = useRef(multiplayer?.zombieState ?? null);
  latestMpSnapshotRef.current = multiplayer?.zombieState ?? null;

  const [hud, setHud] = useState<ZombieHudState>({
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
    targetedZombieId: null,
    activeZombies: [],
    feedbackText: null,
    feedbackKind: null,
  });

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new ZombieArenaScene(
      container,
      avatarId,
      (nextHud) => {
        setHud(nextHud);
      },
      multiplayer
        ? {
            multiplayer: true,
            localDefenderId: multiplayer.localDefenderId,
            initialSnapshot: latestMpSnapshotRef.current,
            splitScreen: Boolean(multiplayer.splitScreen),
          }
        : undefined,
    );
    sceneRef.current = scene;

    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, [avatarId, isMp, isSplit, multiplayer?.localDefenderId, multiplayer?.teamId]);

  useEffect(() => {
    if (multiplayer?.zombieState) {
      sceneRef.current?.syncMultiplayerState(multiplayer.zombieState);
    }
  }, [multiplayer?.zombieState]);

  useEffect(() => {
    if (multiplayer?.lastShot) {
      sceneRef.current?.handleRemoteShot(multiplayer.lastShot);
    }
  }, [multiplayer?.lastShot]);

  useEffect(() => {
    if (multiplayer?.lastWrong) {
      sceneRef.current?.handleRemoteWrong(multiplayer.lastWrong);
    }
  }, [multiplayer?.lastWrong]);

  useEffect(() => {
    if (multiplayer?.lastBreach) {
      sceneRef.current?.handleRemoteBreach(multiplayer.lastBreach);
    }
  }, [multiplayer?.lastBreach]);

  const targetedZombie = useMemo(() => {
    if (hud.activeZombies.length === 0) return null;
    return (
      hud.activeZombies.find((z) => z.id === hud.targetedZombieId) || hud.activeZombies[0]
    );
  }, [hud.activeZombies, hud.targetedZombieId]);

  const handleTogglePause = useCallback(() => {
    if (hud.gameOver) return;
    if (multiplayer) {
      if (multiplayer.role !== 'host') return;
      multiplayer.onPauseToggle(!hud.paused);
    } else {
      sceneRef.current?.setPaused(!hud.paused);
    }
  }, [hud.gameOver, hud.paused, multiplayer]);

  const handlePickChoice = useCallback(
    (choice: string) => {
      if (hud.paused || hud.gameOver || !targetedZombie) return;
      if (multiplayer) {
        multiplayer.onShoot(targetedZombie.id, choice, false);
      } else {
        sceneRef.current?.submitChoice(targetedZombie.id, choice, false);
      }
    },
    [hud.paused, hud.gameOver, targetedZombie, multiplayer],
  );

  const handleFireSpecial = useCallback(() => {
    if (hud.explosiveAmmo <= 0 || hud.paused || hud.gameOver || !targetedZombie) return;
    if (multiplayer) {
      multiplayer.onShoot(targetedZombie.id, '', true);
    } else {
      sceneRef.current?.submitChoice(targetedZombie.id, '', true);
    }
  }, [hud.explosiveAmmo, hud.paused, hud.gameOver, targetedZombie, multiplayer]);

  const handleSelectTarget = useCallback((zombieId: string) => {
    sceneRef.current?.setTargetZombie(zombieId);
  }, []);

  const handleRestart = () => {
    if (multiplayer) {
      if (multiplayer.role === 'host') {
        multiplayer.onRestart();
      }
    } else {
      sceneRef.current?.restart();
    }
  };

  // Keyboard shortcuts: 1-4 = pick choice, Escape = pause, Shift+Enter / Space = explosive shot
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleTogglePause();
        return;
      }
      if (hud.paused || hud.gameOver) return;

      if ((e.key === 'Enter' && e.shiftKey) || e.key === ' ') {
        e.preventDefault();
        handleFireSpecial();
        return;
      }

      const idx = CHOICE_KEYS.indexOf(e.key as (typeof CHOICE_KEYS)[number]);
      if (idx !== -1 && targetedZombie && targetedZombie.puzzle.quickChoices[idx]) {
        e.preventDefault();
        handlePickChoice(targetedZombie.puzzle.quickChoices[idx]);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    handleTogglePause,
    handleFireSpecial,
    handlePickChoice,
    hud.paused,
    hud.gameOver,
    targetedZombie,
  ]);

  const hpPct = Math.max(0, Math.min(100, (hud.hp / hud.maxHp) * 100));
  const sortedDefenders = useMemo(() => {
    if (!multiplayer?.zombieState) return [];
    return [...multiplayer.zombieState.defenders].sort((a, b) => b.score - a.score);
  }, [multiplayer?.zombieState]);

  const teamDef = useMemo(() => {
    if (!multiplayer?.teamId) return null;
    return TEAM_DEFS.find((t) => t.id === multiplayer.teamId) || null;
  }, [multiplayer?.teamId]);

  const choices = targetedZombie?.puzzle.quickChoices || [];

  const renderTopHudContent = () => (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2.5">
        {/* Stats Cluster */}
        <div
          className="pointer-events-auto rounded-xl sm:rounded-2xl border border-slate-700/80 px-2.5 py-1.5 sm:px-4 sm:py-2.5 flex flex-wrap items-center gap-2 sm:gap-3.5 shadow-xl"
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.92)' }}
        >
          {teamDef && (
            <span className={`px-2 py-0.5 rounded-md text-[11px] sm:text-xs font-black ${teamDef.badgeClass}`}>
              {teamDef.label}
            </span>
          )}

          {multiplayer && (
            <>
              <div className="text-[11px] sm:text-xs font-bold text-slate-300 font-mono-tabular">
                PIN <span className="text-amber-400 font-black">{multiplayer.pin}</span>
              </div>
              <span className="text-slate-700 hidden sm:inline">|</span>
            </>
          )}

          <div className="flex items-center gap-1.5 sm:gap-2.5">
            <Heart className={`w-4 h-4 sm:w-5 sm:h-5 ${hud.hp <= 30 ? 'text-rose-500' : 'text-rose-400'} fill-current`} />
            <div>
              <div className="text-[10px] sm:text-[11px] font-bold text-slate-400 leading-none mb-0.5 sm:mb-1 tabular-nums">
                HP {hud.hp}/{hud.maxHp}
              </div>
              <div className="w-14 sm:w-28 h-2 sm:h-2.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className={`h-full transition-all duration-200 ${
                    hpPct > 50 ? 'bg-emerald-400' : hpPct > 25 ? 'bg-amber-400' : 'bg-rose-500'
                  }`}
                  style={{ width: `${hpPct}%` }}
                />
              </div>
            </div>
          </div>

          <span className="text-slate-700 hidden sm:inline">|</span>

          <div className="text-[11px] sm:text-xs font-bold text-slate-300 tabular-nums">
            W<span className="hidden sm:inline">ave </span>
            <span className="text-cyan-400 text-xs sm:text-sm font-black">{hud.wave}</span>
          </div>

          <div className="text-[11px] sm:text-xs font-bold text-slate-300 tabular-nums">
            <span className="hidden sm:inline">คะแนน </span>
            <span className="text-amber-400 text-xs sm:text-sm font-black">{hud.score.toLocaleString()}</span>
          </div>

          {multiplayer?.zombieState && (
            <div className="text-[11px] sm:text-xs font-bold text-slate-300 tabular-nums">
              ทีม{' '}
              <span className="text-emerald-400 text-xs sm:text-sm font-black">
                {multiplayer.zombieState.teamScore.toLocaleString()}
              </span>
            </div>
          )}

          <div className="text-[11px] sm:text-xs font-bold text-orange-400 flex items-center gap-0.5 sm:gap-1 tabular-nums">
            <Flame className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            x{hud.streak}
          </div>
        </div>

        {/* Right Controls Cluster */}
        <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2">
          <div
            className="hidden sm:flex rounded-xl border border-amber-400/40 px-3 py-2 items-center gap-1.5 text-xs font-extrabold text-amber-300 tabular-nums"
            style={{ backgroundColor: 'rgba(15, 23, 42, 0.92)' }}
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            ระเบิด x{hud.explosiveAmmo}
          </div>

          {(!multiplayer || multiplayer.role === 'host') && (
            <button
              type="button"
              onClick={handleTogglePause}
              className="p-2 sm:p-2.5 rounded-xl border border-slate-700/80 text-slate-200 hover:text-white cursor-pointer"
              style={{ backgroundColor: 'rgba(15, 23, 42, 0.92)' }}
              title="พักเกม (Esc)"
            >
              {hud.paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </button>
          )}

          {multiplayer?.role === 'host' && (
            <button
              type="button"
              onClick={multiplayer.onBackToLobby}
              className="px-2.5 py-2 sm:px-3 rounded-xl border border-emerald-500/40 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-200 text-[11px] sm:text-xs font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
              title="กลับไปหน้าห้องรอเพื่อแก้โจทย์"
            >
              <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>ห้องรอ<span className="hidden sm:inline"> / แก้โจทย์</span></span>
            </button>
          )}

          <button
            type="button"
            onClick={onToggleMute}
            className="p-2 sm:p-2.5 rounded-xl border border-slate-700/80 text-slate-200 hover:text-white cursor-pointer"
            style={{ backgroundColor: 'rgba(15, 23, 42, 0.92)' }}
            title={muted ? 'เปิดเสียง' : 'ปิดเสียง'}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={onExit}
            className="px-2.5 py-2 sm:px-3.5 rounded-xl border border-slate-700/80 text-[11px] sm:text-xs font-bold text-slate-200 hover:text-white flex items-center gap-1 sm:gap-1.5 cursor-pointer whitespace-nowrap"
            style={{ backgroundColor: 'rgba(15, 23, 42, 0.92)' }}
          >
            <Home className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            {multiplayer ? 'ออก' : 'หน้าแรก'}
          </button>
        </div>
      </div>

      {/* Multiplayer Teammate Bar */}
      {multiplayer && sortedDefenders.length > 0 && (
        <div className="mt-1.5 sm:mt-2 flex flex-nowrap sm:flex-wrap items-center gap-1.5 overflow-x-auto pb-0.5 custom-scroll pointer-events-auto">
          {sortedDefenders.map((d) => {
            const av = BLOOK_AVATARS.find((a) => a.id === d.avatar);
            const isMe = d.id === multiplayer.localDefenderId;
            return (
              <div
                key={d.id}
                className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg sm:rounded-xl border text-[10px] sm:text-[11px] font-bold flex items-center gap-1 sm:gap-1.5 shrink-0 ${
                  isMe
                    ? 'border-cyan-400/70 bg-cyan-950/85 text-cyan-100'
                    : 'border-slate-700/80 bg-slate-950/85 text-slate-200'
                }`}
              >
                <span>{av?.emoji || '🤖'}</span>
                <span className="max-w-[76px] sm:max-w-[90px] truncate">{d.name}</span>
                <span className="text-amber-400 font-mono-tabular">{d.score}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Transient Combat Feedback Banner */}
      {hud.feedbackText && (
        <div className="mt-1.5 sm:mt-2.5 flex justify-center">
          <div
            className={`px-3 py-1 sm:px-4 sm:py-1.5 rounded-xl border text-[11px] sm:text-xs font-extrabold shadow-lg text-center max-w-[94vw] ${
              hud.feedbackKind === 'special'
                ? 'border-amber-400 bg-amber-950/90 text-amber-200'
                : hud.feedbackKind === 'hit'
                  ? 'border-emerald-400 bg-emerald-950/90 text-emerald-200'
                  : hud.feedbackKind === 'damage'
                    ? 'border-rose-500 bg-rose-950/90 text-rose-200'
                    : 'border-slate-600 bg-slate-900/90 text-slate-200'
            }`}
          >
            {hud.feedbackText}
          </div>
        </div>
      )}
    </div>
  );

  const renderWeaponsDeckContent = () => (
    <>
      {/* Target Zombie Switcher Row */}
      {hud.activeZombies.length > 0 && (
        <div className="flex flex-nowrap sm:flex-wrap items-center gap-1.5 overflow-x-auto pb-0.5 custom-scroll">
          <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1 mr-0.5 shrink-0">
            <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">เป้าหมาย</span> ({hud.activeZombies.length}):
          </span>
          {hud.activeZombies.map((z, idx) => {
            const isTarget = targetedZombie?.id === z.id;
            const tierColor = z.isBoss
              ? 'text-amber-300'
              : z.puzzle.tier === 'hard'
                ? 'text-rose-300'
                : z.puzzle.tier === 'medium'
                  ? 'text-purple-300'
                  : 'text-emerald-300';
            return (
              <button
                key={z.id}
                type="button"
                onClick={() => handleSelectTarget(z.id)}
                className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg border text-[10px] sm:text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors shrink-0 whitespace-nowrap ${
                  z.isBoss
                    ? isTarget
                      ? 'border-amber-400 bg-rose-600/35 text-white'
                      : 'border-rose-500/70 bg-rose-950/80 text-rose-200'
                    : isTarget
                      ? 'border-cyan-400 bg-cyan-500/20 text-white'
                      : 'border-slate-700 bg-slate-950/80 text-slate-300 hover:border-slate-500'
                }`}
              >
                <span>
                  {z.isBoss
                    ? `👹 BOSS (${(z.bossStep ?? 0) + 1}/${z.bossTotalSteps ?? 5})`
                    : idx === 0
                      ? 'หน้าสุด'
                      : `#${idx + 1}`}
                </span>
                {!z.isBoss && <span className={tierColor}>{z.puzzle.tier.toUpperCase()}</span>}
                {z.enraged && <span className="text-orange-400">⚡</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Boss HP / 5-Question Progress & Speed Ramp Banner */}
      {targetedZombie?.isBoss && (
        <div className="rounded-xl border border-rose-500/60 bg-rose-950/60 px-2.5 py-1.5 sm:px-3.5 sm:py-2 flex flex-wrap items-center justify-between gap-1.5 sm:gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] sm:text-xs font-black text-amber-300">
              👹 BOSS · ข้อ {(targetedZombie.bossStep ?? 0) + 1}/{targetedZombie.bossTotalSteps ?? 5}
            </span>
            <div className="flex items-center gap-1" aria-label="Boss shield steps">
              {Array.from({ length: targetedZombie.bossTotalSteps ?? 5 }).map((_, pipIdx) => {
                const remaining =
                  (targetedZombie.bossTotalSteps ?? 5) - (targetedZombie.bossStep ?? 0);
                const filled = pipIdx < remaining;
                return (
                  <span
                    key={pipIdx}
                    className={`w-3.5 sm:w-5 h-1.5 sm:h-2 rounded-sm ${
                      filled ? 'bg-amber-400' : 'bg-slate-700'
                    }`}
                  />
                );
              })}
            </div>
          </div>
          <span className="text-[10px] sm:text-[11px] font-extrabold text-orange-300 font-mono-tabular">
            ⚡ {targetedZombie.speed.toFixed(1)}x
            <span className="hidden sm:inline"> (ตอบไม่ทันบอสพุ่งชนฐาน!)</span>
          </span>
        </div>
      )}

      {hud.bossRushActive && !hud.gameOver && (
        <div className="rounded-xl border border-rose-500 bg-rose-950/85 px-2.5 py-1 sm:px-3.5 sm:py-1.5 text-center text-[11px] sm:text-xs font-black text-rose-200">
          ⚠️ วิกฤต! บอสพุ่งชนฐานจนเลือดเกือบหมด — ฝูงซอมบี้ที่เหลือกำลังวิ่งบุกเข้ามา!
        </div>
      )}

      {/* Targeted Zombie Question (Stacked P / Q / Question Lines) + Special Bomb */}
      <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0 flex-1 w-full sm:w-auto">
          {targetedZombie ? (
            <div className="space-y-1 sm:space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                      targetedZombie.isBoss
                        ? 'bg-rose-500 text-white'
                        : targetedZombie.puzzle.tier === 'hard'
                          ? 'bg-rose-500 text-slate-950'
                          : targetedZombie.puzzle.tier === 'medium'
                            ? 'bg-purple-400 text-slate-950'
                            : 'bg-emerald-400 text-slate-950'
                    }`}
                  >
                    {targetedZombie.isBoss
                      ? `BOSS ${(targetedZombie.bossStep ?? 0) + 1}/${targetedZombie.bossTotalSteps ?? 5}`
                      : targetedZombie.puzzle.tier}
                  </span>
                  {targetedZombie.enraged && (
                    <span className="px-2 py-0.5 rounded-md bg-orange-500/25 border border-orange-400/60 text-orange-300 text-[10px] font-extrabold">
                      ⚡ เร็วขึ้น!
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleFireSpecial}
                  disabled={hud.explosiveAmmo <= 0 || hud.paused || hud.gameOver || !targetedZombie}
                  className="sm:hidden px-2.5 py-1 rounded-lg bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-slate-950 font-extrabold text-[11px] flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <Zap className="w-3.5 h-3.5 fill-current" />
                  ระเบิด ({hud.explosiveAmmo})
                </button>
              </div>

              <div className="rounded-xl border border-slate-700/80 bg-slate-950/85 px-2.5 py-1.5 sm:px-3.5 sm:py-2.5 flex flex-col gap-0.5">
                {formatLogicPromptLines(targetedZombie.puzzle.prompt).map((line, li, arr) => {
                  const isAssignment = /^[PQR]\s*=/.test(line);
                  const isQuestionLine = li === arr.length - 1;
                  return (
                    <div
                      key={li}
                      className={`break-words leading-snug ${
                        isAssignment && !isQuestionLine
                          ? 'text-cyan-300 font-bold text-xs sm:text-base'
                          : isQuestionLine
                            ? 'text-white font-black text-sm sm:text-lg pt-0.5'
                            : 'text-slate-200 font-bold text-xs sm:text-base'
                      }`}
                    >
                      {line}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-xs sm:text-sm font-bold text-slate-400 py-2">
              กำลังรอซอมบี้กลุ่มถัดไปบุกเข้ามา...
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleFireSpecial}
          disabled={hud.explosiveAmmo <= 0 || hud.paused || hud.gameOver || !targetedZombie}
          className="hidden sm:flex px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-slate-950 font-extrabold text-sm items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          title="ยิงกระสุนระเบิดเคลียร์ซอมบี้รอบจุดตก (Space หรือ Shift+Enter)"
        >
          <Zap className="w-4 h-4 fill-current" />
          กระสุนระเบิด ({hud.explosiveAmmo})
        </button>
      </div>

      {/* Choice Buttons Grid (2x2 A/B/C/D in Split-Screen Mode, or responsive 2/4 grid) */}
      {targetedZombie && (
        <div
          className={`grid gap-2 sm:gap-2.5 ${
            isSplit
              ? 'grid-cols-2'
              : choices.length <= 2
                ? 'grid-cols-2'
                : 'grid-cols-2 sm:grid-cols-4'
          }`}
        >
          {choices.map((choice, idx) => (
            <button
              key={`${targetedZombie.id}-${idx}-${choice}`}
              type="button"
              disabled={hud.paused || hud.gameOver}
              onClick={() => handlePickChoice(choice)}
              className="group relative px-2.5 py-2.5 sm:px-4 sm:py-3 rounded-xl border border-slate-600 bg-slate-800/95 hover:bg-cyan-500/20 hover:border-cyan-400 active:scale-[0.98] disabled:opacity-50 text-left flex items-center gap-2 sm:gap-2.5 cursor-pointer transition-all"
            >
              <span className="w-6 h-6 sm:w-7 sm:h-7 rounded-md sm:rounded-lg bg-slate-950 border border-slate-600 group-hover:border-cyan-400 text-cyan-300 font-mono-tabular text-xs font-black flex items-center justify-center shrink-0">
                {isSplit ? SPLIT_LETTERS[idx] || idx + 1 : idx + 1}
              </span>
              <span className="text-xs sm:text-sm font-extrabold text-white break-words leading-snug">
                {choice}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="hidden sm:flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
        <span>
          เลือกช้อยที่ถูกต้องเพื่อยิง (กดปุ่มตัวเลข 1-{Math.max(2, choices.length)} ได้) · ถ้าตอบผิด ซอมบี้ตัวนั้นจะวิ่งเร็วขึ้นและเปลี่ยนโจทย์ใหม่ทันที!
        </span>
        <span>ตอบถูก 5 ครั้งติด = กระสุนระเบิด +1 (กด Space ยิงระเบิด)</span>
      </div>
      <div className="sm:hidden text-[10px] text-slate-400 text-center">
        แตะช้อยเพื่อยิง · ตอบผิดซอมบี้วิ่งเร็วขึ้น + เปลี่ยนโจทย์ · ถูก 5 ติด = ระเบิด +1
      </div>
    </>
  );

  return (
    <div
      className={
        isSplit
          ? 'relative w-full h-dvh flex flex-col overflow-hidden select-none bg-[#090f1d]'
          : 'relative w-full h-dvh overflow-hidden select-none bg-[#090f1d]'
      }
    >
      {isSplit ? (
        <>
          {/* Top Screen: Unobstructed 3D Zombie Arena + Compact Top Bar */}
          <div className="relative flex-1 min-h-0 w-full overflow-hidden">
            <div ref={mountRef} className="w-full h-full" />
            <div className="absolute inset-x-0 top-0 z-10 pointer-events-none p-2 sm:p-4">
              {renderTopHudContent()}
            </div>
          </div>

          {/* Bottom Half: Dedicated Question Card + 2x2 A/B/C/D Answer Pad */}
          <div className="shrink-0 z-10 bg-slate-900 border-t-2 border-slate-700/90 px-2.5 py-2.5 sm:px-5 sm:py-3.5 pb-[max(0.65rem,env(safe-area-inset-bottom))] max-h-[54dvh] overflow-y-auto touch-pan-y custom-scroll">
            <div className="max-w-4xl mx-auto space-y-2 sm:space-y-2.5">
              {renderWeaponsDeckContent()}
            </div>
          </div>
        </>
      ) : (
        <>
          <div ref={mountRef} className="fixed inset-0 z-0" />

          {/* Top HUD Bar */}
          <div className="fixed inset-x-0 top-0 z-10 pointer-events-none p-2 sm:p-5">
            {renderTopHudContent()}
          </div>

          {/* Bottom Multiple-Choice Weapons Dock */}
          <div className="fixed inset-x-0 bottom-0 z-10 pointer-events-none p-2 sm:p-5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <div
              className="pointer-events-auto max-w-4xl mx-auto rounded-2xl border border-slate-700/80 p-2.5 sm:p-4 shadow-2xl space-y-2 sm:space-y-3 max-h-[48dvh] sm:max-h-none overflow-y-auto touch-pan-y custom-scroll"
              style={{ backgroundColor: 'rgba(15, 23, 42, 0.94)' }}
            >
              {renderWeaponsDeckContent()}
            </div>
          </div>
        </>
      )}

      {/* Pause / Game Over Modal */}
      {(hud.paused || hud.gameOver) && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center p-4 overflow-y-auto custom-scroll"
          style={{ backgroundColor: 'rgba(2, 6, 23, 0.82)' }}
        >
          <div className="w-full max-w-lg max-h-[90dvh] overflow-y-auto touch-pan-y custom-scroll rounded-2xl border border-slate-700 bg-slate-900 p-5 sm:p-6 text-center space-y-5 shadow-2xl my-auto">
            <div>
              <h2 className="font-display text-2xl font-black text-white">
                {hud.gameOver
                  ? teamDef
                    ? `ฐาน${teamDef.label}ถูกซอมบี้บุกแล้ว!`
                    : 'ฐานถูกซอมบี้บุกแล้ว!'
                  : multiplayer?.role === 'player'
                    ? 'ผู้คุม (Host) พักเกมชั่วคราว'
                    : 'พักเกมชั่วคราว'}
              </h2>
              <p className="text-sm text-slate-300 mt-1">
                {hud.gameOver
                  ? teamDef
                    ? `สรุปผลการป้องกันฐานของ${teamDef.label}`
                    : 'สรุปผลการป้องกันฐานจากกองทัพซอมบี้'
                  : multiplayer?.role === 'player'
                    ? 'รอผู้คุม (Host) กดเล่นต่อ...'
                    : 'กด เล่นต่อ เพื่อสู้กับซอมบี้ต่อ'}
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-left">
              <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/70">
                <div className="text-xs text-slate-400">คะแนนของคุณ</div>
                <div className="font-mono-tabular text-lg font-black text-amber-400">
                  {hud.score.toLocaleString()}
                </div>
              </div>
              <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/70">
                <div className="text-xs text-slate-400">กำจัดรวม</div>
                <div className="font-mono-tabular text-lg font-black text-cyan-400">
                  {hud.kills} ตัว
                </div>
              </div>
              <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/70">
                <div className="text-xs text-slate-400">Wave สูงสุด</div>
                <div className="font-mono-tabular text-lg font-black text-emerald-400">
                  Wave {hud.wave}
                </div>
              </div>
              <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/70">
                <div className="text-xs text-slate-400">Streak สูงสุด</div>
                <div className="font-mono-tabular text-lg font-black text-orange-400">
                  x{hud.bestStreak}
                </div>
              </div>
            </div>

            {multiplayer && sortedDefenders.length > 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-left space-y-2 max-h-40 overflow-y-auto custom-scroll">
                <div className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-cyan-400" />
                  อันดับคะแนนทีม ({sortedDefenders.length} คน)
                </div>
                {sortedDefenders.map((d, idx) => {
                  const av = BLOOK_AVATARS.find((a) => a.id === d.avatar);
                  return (
                    <div
                      key={d.id}
                      className="flex items-center justify-between text-xs py-1 border-b border-slate-800/70 last:border-0"
                    >
                      <div className="flex items-center gap-2 font-bold text-white">
                        <span className="text-slate-400 w-4">#{idx + 1}</span>
                        <span>{av?.emoji || '🤖'}</span>
                        <span>{d.name}</span>
                      </div>
                      <div className="font-mono-tabular text-amber-400 font-bold">
                        {d.score.toLocaleString()} ({d.kills} ตัว)
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-2.5">
              {!hud.gameOver && (!multiplayer || multiplayer.role === 'host') && (
                <button
                  type="button"
                  onClick={handleTogglePause}
                  className="px-5 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-extrabold text-sm cursor-pointer"
                >
                  เล่นต่อ
                </button>
              )}
              {(!multiplayer || multiplayer.role === 'host') && (
                <button
                  type="button"
                  onClick={handleRestart}
                  className="px-5 py-2.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-extrabold text-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  เล่นใหม่อีกครั้ง
                </button>
              )}
              {multiplayer?.role === 'host' && (
                <button
                  type="button"
                  onClick={multiplayer.onBackToLobby}
                  className="px-4 py-2.5 rounded-xl border border-emerald-500/40 bg-emerald-950/70 hover:bg-emerald-900 text-emerald-200 font-bold text-sm cursor-pointer"
                >
                  กลับห้องรอ / แก้โจทย์
                </button>
              )}
              <button
                type="button"
                onClick={onExit}
                className="px-5 py-2.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm cursor-pointer"
              >
                {multiplayer ? 'ออกจากห้อง' : 'กลับหน้าแรก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
